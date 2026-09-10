"""Parsing d'un export d'opérations Ledger (wallet matériel crypto) — retour
utilisateur du 11/09/2026, format distinct de l'export Trade Republic
(`transaction_import.py`), au point d'avoir sa propre carte d'import séparée sur
l'écran Import plutôt que d'étendre le parseur existant.

Colonnes fixes de l'export Ledger : `Operation Date, Status, Currency Ticker,
Operation Type, Operation Amount, Operation Fees, Operation Hash, Account Name,
Account xpub, Countervalue Ticker, Countervalue at Operation Date, Countervalue at
CSV Export`. Un même fichier mélange plusieurs cryptos (une ligne par opération, sur
n'importe quelle devise) — contrairement à Trade Republic, aucune notion de bucket de
compte ici : tout part dans un unique compte crypto, mais l'utilisateur choisit à
l'aperçu quelles devises importer réellement (un wallet accumule souvent des jetons
spam/poussière reçus sans action de sa part, à filtrer avant d'polluer le portefeuille).

**Limites assumées et documentées** (cf. plan — mieux vaut une hypothèse honnête
qu'une fausse précision) :
- Le fichier ne distingue pas un ACHAT d'un simple transfert depuis un wallet/exchange
  déjà possédé ailleurs : faute de mieux, chaque réception (`IN`) est traitée comme un
  achat au prix du jour (`Countervalue at Operation Date`) — même limite, structurellement,
  que n'importe quel grand livre de courtier qui ignore d'où vient un titre transféré.
- `Operation Fees` est exprimé dans l'unité de la crypto (pas en EUR) et le fichier ne
  fournit aucune contrepartie EUR fiable pour le convertir — ignoré du calcul de coût de
  revient (`fee=0.0` sur chaque ligne), plutôt que d'inventer un taux de change approximatif.
"""

import io
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pandas as pd

from .csv_import import to_float

REQUIRED_COLUMNS_LEDGER = {
    "Operation Date",
    "Status",
    "Currency Ticker",
    "Operation Type",
    "Operation Amount",
    "Operation Fees",
    "Operation Hash",
    "Account Name",
    "Account xpub",
    "Countervalue Ticker",
    "Countervalue at Operation Date",
    "Countervalue at CSV Export",
}

# Seuls ces deux types de mouvement ont un sens pour un grand livre d'investissement
# (achat/vente) — tout autre type d'opération Ledger (staking, delegate, reveal...) est
# ignoré et compté, jamais deviné (cf. `lignes_ignorees_type_operation`).
TYPES_OPERATION_RECONNUS = {"IN": "BUY", "OUT": "SELL"}

STATUT_CONFIRME = "Confirmed"


@dataclass
class DeviseApercu:
    ticker: str
    nb_operations: int = 0
    montant_total_eur: float = 0.0


@dataclass
class ParsedLedgerOperations:
    rows: list[dict] = field(default_factory=list)
    lignes_lues: int = 0
    lignes_ignorees_statut: int = 0
    lignes_ignorees_type_operation: dict[str, int] = field(default_factory=dict)
    devises: dict[str, DeviseApercu] = field(default_factory=dict)


def looks_like_ledger_export(columns: list[str]) -> bool:
    return REQUIRED_COLUMNS_LEDGER.issubset(set(columns))


def _clean(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.lower() == "nan":
        return None
    return text


def parse_ledger_file(content: bytes) -> ParsedLedgerOperations:
    df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False)
    df.columns = [str(c).strip() for c in df.columns]

    if not looks_like_ledger_export(list(df.columns)):
        raise ValueError("Ce fichier ne ressemble pas à un export Ledger reconnu")

    result = ParsedLedgerOperations(lignes_lues=len(df))

    for _, row in df.iterrows():
        statut = _clean(row.get("Status"))
        if statut != STATUT_CONFIRME:
            result.lignes_ignorees_statut += 1
            continue

        type_brut = _clean(row.get("Operation Type")) or ""
        type_transaction = TYPES_OPERATION_RECONNUS.get(type_brut)
        if type_transaction is None:
            result.lignes_ignorees_type_operation[type_brut] = result.lignes_ignorees_type_operation.get(type_brut, 0) + 1
            continue

        operation_hash = _clean(row.get("Operation Hash"))
        ticker = _clean(row.get("Currency Ticker"))
        dt_raw = _clean(row.get("Operation Date"))
        montant = to_float(row.get("Operation Amount"))
        if not operation_hash or not ticker or not dt_raw or not montant:
            continue

        try:
            dt = datetime.fromisoformat(dt_raw.replace("Z", "+00:00"))
        except ValueError:
            continue

        symbol = ticker.upper()
        # Contrepartie EUR au moment de l'opération — absente pour un jeton sans
        # cotation connue de Ledger (spam/poussière) : la ligne est quand même
        # importée, à coût nul, plutôt que perdue (l'utilisateur peut de toute façon
        # la décocher à l'aperçu s'il ne la veut pas).
        montant_eur = to_float(row.get("Countervalue at Operation Date")) or 0.0

        if type_transaction == "BUY":
            shares = montant
            amount = -montant_eur
        else:
            shares = -montant
            amount = montant_eur

        result.rows.append(
            {
                "transaction_id": f"ledger:{operation_hash}:{symbol}",
                "datetime_utc": dt,
                "date": dt.date().isoformat(),
                "category": "TRADING",
                "type": type_transaction,
                "asset_class": "CRYPTO",
                "symbol": symbol,
                "name": None,
                "shares": shares,
                "price": abs(montant_eur / montant) if montant else None,
                "amount": amount,
                "fee": 0.0,
                "tax": 0.0,
                "description": None,
            }
        )

        devise = result.devises.setdefault(symbol, DeviseApercu(ticker=symbol))
        devise.nb_operations += 1
        devise.montant_total_eur += montant_eur

    return result


# Staging entre l'aperçu et la confirmation — même patron que
# `transaction_import._PENDING_TRANSACTIONS`, mais un dict séparé : types distincts
# (`ParsedLedgerOperations`), aucune raison de coupler les deux caches entre deux
# formats d'import par ailleurs indépendants.
_PENDING_LEDGER: dict[str, tuple[ParsedLedgerOperations, datetime]] = {}
_MAX_PENDING_LEDGER = 20
DUREE_EXPIRATION_PENDING_LEDGER = timedelta(minutes=30)


def _purger_imports_expires() -> None:
    maintenant = datetime.now(UTC)
    expires = [token for token, (_, depose_le) in _PENDING_LEDGER.items() if maintenant - depose_le > DUREE_EXPIRATION_PENDING_LEDGER]
    for token in expires:
        _PENDING_LEDGER.pop(token, None)


def stage_parsed_ledger(parsed: ParsedLedgerOperations) -> str:
    _purger_imports_expires()
    token = uuid.uuid4().hex
    if len(_PENDING_LEDGER) >= _MAX_PENDING_LEDGER:
        _PENDING_LEDGER.pop(next(iter(_PENDING_LEDGER)))
    _PENDING_LEDGER[token] = (parsed, datetime.now(UTC))
    return token


def get_pending_ledger(token: str) -> ParsedLedgerOperations:
    _purger_imports_expires()
    entree = _PENDING_LEDGER.get(token)
    if entree is None:
        raise KeyError("Fichier introuvable ou expiré, merci de ré-uploader")
    return entree[0]


def clear_pending_ledger(token: str) -> None:
    _PENDING_LEDGER.pop(token, None)
