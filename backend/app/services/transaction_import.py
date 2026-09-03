"""Parsing d'un export d'historique de transactions (format Trade Republic et
compatibles) : un grand livre de mouvements (achats/ventes, dividendes, versements,
opérations sur titres...), à distinguer d'un simple relevé de positions.

Cette application ne suit que l'activité boursière : les mouvements de carte
bancaire ET les virements avec le compte courant/la banque (dépôts, retraits) ne
sont pas des flux d'investissement du point de vue de l'utilisateur — ils sont
détectés et exclus dès le parsing, jamais stockés en base.
"""

import io
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pandas as pd

from .csv_import import to_float

REQUIRED_COLUMNS = {
    "datetime",
    "date",
    "category",
    "type",
    "asset_class",
    "symbol",
    "shares",
    "price",
    "amount",
    "fee",
    "tax",
    "description",
    "transaction_id",
}

# Mouvements de carte bancaire (dépenses quotidiennes) + virements avec la banque
# (dépôts/retraits sur le compte courant Trade Republic) : hors suivi boursier.
EXCLUDED_TYPES = {
    "CARD_TRANSACTION",
    "CARD_TRANSACTION_INTERNATIONAL",
    "CARD_ORDERING_FEE",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "TRANSFER_INBOUND",
    "TRANSFER_INSTANT_INBOUND",
    "CUSTOMER_INBOUND",
    "CUSTOMER_INPAYMENT",
    "CUSTOMER_OUTBOUND_REQUEST",
}


@dataclass
class ParsedTransactions:
    rows: list[dict] = field(default_factory=list)
    lignes_lues: int = 0
    mouvements_hors_bourse_exclus: int = 0
    # Clé de compte suggérée par ticker (revue du 03/09/2026, § import multi-comptes)
    # — PAS un champ de `Transaction` (aucune colonne `account_type` sur ce modèle,
    # décision délibérée : cette clé ne sert qu'à l'assignation d'un compte à
    # l'import, jamais réutile après coup, donc pas de raison de l'y stocker en
    # base). « Dernière ligne du fichier gagne » par ticker, même règle que
    # `portfolio_reconstruction.state.asset_class` — un ticker change quasiment
    # jamais de nature entre deux transactions, la précision chronologique exacte
    # n'a pas d'enjeu ici. Comptée par clé pour l'aperçu (`import/apercu`).
    cle_compte_par_ticker: dict[str, str] = field(default_factory=dict)
    lignes_par_cle_compte: dict[str, int] = field(default_factory=lambda: dict.fromkeys(CLES_COMPTE, 0))


def looks_like_transaction_export(columns: list[str]) -> bool:
    return REQUIRED_COLUMNS.issubset(set(columns))


# Ordre = ordre d'affichage à l'écran d'aperçu de l'import. Noms proposés par
# défaut, éditables par l'utilisateur avant confirmation (revue du 03/09/2026,
# demande directe : « il faut qu'à l'import il me demande et remplisse
# l'établissement, et [...] j'ai une partie PEA, une partie Compte titre, une
# partie Cryptomonnaie et une partie obligation »).
CLE_COMPTE_PEA = "pea"
CLE_COMPTE_TITRES = "compte_titres"
CLE_COMPTE_CRYPTO = "crypto"
CLE_COMPTE_OBLIGATIONS = "obligations"
CLES_COMPTE = (CLE_COMPTE_PEA, CLE_COMPTE_TITRES, CLE_COMPTE_CRYPTO, CLE_COMPTE_OBLIGATIONS)
NOMS_COMPTE_PAR_DEFAUT = {
    CLE_COMPTE_PEA: "PEA",
    CLE_COMPTE_TITRES: "Compte-titres",
    CLE_COMPTE_CRYPTO: "Cryptomonnaie",
    CLE_COMPTE_OBLIGATIONS: "Obligations",
}


def cle_compte(account_type: str | None, asset_class: str | None) -> str:
    """Bucket de compte suggéré pour une transaction, à partir des deux seuls
    champs du fichier Trade Republic qui portent ce signal : `account_type`
    (`PEA` sur un compte PEA, `DEFAULT` sinon — vérifié sur un export réel : 127
    lignes `PEA`, le reste `DEFAULT`) et `asset_class` (`STOCK`/`FUND`/`CRYPTO`/
    `BOND`/`PRIVATE_FUND`/vide, par transaction).

    `account_type == "PEA"` prime sur `asset_class` : un PEA ne contient QUE des
    actions/fonds éligibles par construction réglementaire, la distinction
    crypto/obligations n'a pas de sens à l'intérieur d'un PEA. En dehors d'un PEA,
    les obligations obtiennent leur propre compte plutôt que de rejoindre le
    compte-titres (décision utilisateur explicite, 03/09/2026)."""
    if (account_type or "").strip().upper() == "PEA":
        return CLE_COMPTE_PEA
    ac = (asset_class or "").strip().upper()
    if ac == "CRYPTO":
        return CLE_COMPTE_CRYPTO
    if ac == "BOND":
        return CLE_COMPTE_OBLIGATIONS
    return CLE_COMPTE_TITRES


def _clean(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.lower() == "nan":
        return None
    return text


def parse_transactions_file(content: bytes) -> ParsedTransactions:
    df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False)
    df.columns = [str(c).strip() for c in df.columns]

    if not looks_like_transaction_export(list(df.columns)):
        raise ValueError("Ce fichier ne ressemble pas à un export d'historique de transactions reconnu")

    result = ParsedTransactions(lignes_lues=len(df))

    for _, row in df.iterrows():
        type_ = _clean(row.get("type")) or ""
        mcc = _clean(row.get("mcc_code"))
        if type_ in EXCLUDED_TYPES or mcc:
            result.mouvements_hors_bourse_exclus += 1
            continue

        transaction_id = _clean(row.get("transaction_id"))
        dt_raw = _clean(row.get("datetime"))
        if not transaction_id or not dt_raw:
            continue
        # Les opérations sur titres (splits, actions gratuites, migrations...) n'ont pas
        # de mouvement de cash : `amount` est vide mais la ligne reste indispensable pour
        # la reconstruction du portefeuille (elle porte le delta de `shares`).
        amount = to_float(row.get("amount")) or 0.0

        try:
            dt = datetime.fromisoformat(dt_raw.replace("Z", "+00:00"))
        except ValueError:
            continue

        symbol = _clean(row.get("symbol"))
        asset_class = _clean(row.get("asset_class"))
        # `account_type` n'est PAS dans `REQUIRED_COLUMNS` : absent sur un export qui
        # ne le porterait pas (variante de format), traité comme `DEFAULT` — aucune
        # régression sur un fichier qui ne l'aurait jamais eu.
        cle = cle_compte(_clean(row.get("account_type")), asset_class)
        # Comptage PAR LIGNE (pas par ticker) : c'est ce que l'aperçu affiche
        # (« 127 lignes PEA »), vérifié correspondre exactement aux comptages bruts
        # du fichier réel de l'utilisateur (127 `account_type=PEA`, 5 `asset_class=
        # BOND`...). Le mapping par ticker ci-dessous sert un besoin différent :
        # décider à QUEL compte rattacher chaque position reconstruite.
        result.lignes_par_cle_compte[cle] = result.lignes_par_cle_compte.get(cle, 0) + 1
        if symbol:
            # Dernière ligne du fichier gagne par ticker (cf. docstring de
            # `ParsedTransactions.cle_compte_par_ticker`) — un mouvement de cash pur
            # (pas de `symbol`) ne concerne aucun ticker, jamais retenu ici.
            result.cle_compte_par_ticker[symbol] = cle

        result.rows.append(
            {
                "transaction_id": transaction_id,
                "datetime_utc": dt,
                "date": _clean(row.get("date")) or dt.date().isoformat(),
                "category": _clean(row.get("category")) or "",
                "type": type_,
                "asset_class": asset_class,
                "symbol": symbol,
                "name": _clean(row.get("name")),
                "shares": to_float(row.get("shares")),
                "price": to_float(row.get("price")),
                "amount": amount,
                "fee": to_float(row.get("fee")) or 0.0,
                "tax": to_float(row.get("tax")) or 0.0,
                "description": _clean(row.get("description")),
            }
        )

    return result


# Staging du résultat de parsing entre l'aperçu et la confirmation (redesign du
# 03/09/2026, import du grand livre en deux temps — même patron que
# `csv_import._PENDING_IMPORTS`, mais un `ParsedTransactions` complet plutôt qu'un
# `DataFrame` brut : `parse_transactions_file` a ses propres réglages de lecture
# (`dtype=str, keep_default_na=False`) et sa propre logique métier (exclusion des
# mouvements hors bourse, `cle_compte`...), déjà entièrement calculée à l'aperçu —
# la confirmation réutilise ce résultat tel quel plutôt que de re-parser le fichier
# une seconde fois (évite aussi tout risque de divergence entre les deux passages).
_PENDING_TRANSACTIONS: dict[str, tuple[ParsedTransactions, datetime]] = {}
_MAX_PENDING_TRANSACTIONS = 20
DUREE_EXPIRATION_PENDING_TRANSACTIONS = timedelta(minutes=30)


def _purger_imports_expires() -> None:
    maintenant = datetime.now(UTC)
    expires = [
        token
        for token, (_, depose_le) in _PENDING_TRANSACTIONS.items()
        if maintenant - depose_le > DUREE_EXPIRATION_PENDING_TRANSACTIONS
    ]
    for token in expires:
        _PENDING_TRANSACTIONS.pop(token, None)


def stage_parsed(parsed: ParsedTransactions) -> str:
    _purger_imports_expires()
    token = uuid.uuid4().hex
    if len(_PENDING_TRANSACTIONS) >= _MAX_PENDING_TRANSACTIONS:
        _PENDING_TRANSACTIONS.pop(next(iter(_PENDING_TRANSACTIONS)))
    _PENDING_TRANSACTIONS[token] = (parsed, datetime.now(UTC))
    return token


def get_pending_transactions(token: str) -> ParsedTransactions:
    _purger_imports_expires()
    entree = _PENDING_TRANSACTIONS.get(token)
    if entree is None:
        raise KeyError("Fichier introuvable ou expiré, merci de ré-uploader")
    return entree[0]


def clear_pending_transactions(token: str) -> None:
    _PENDING_TRANSACTIONS.pop(token, None)
