"""Parsing d'un export d'historique de transactions (format Trade Republic et
compatibles) : un grand livre de mouvements (achats/ventes, dividendes, versements,
opérations sur titres...), à distinguer d'un simple relevé de positions.

Cette application ne suit que l'activité boursière : les mouvements de carte
bancaire ET les virements avec le compte courant/la banque (dépôts, retraits) ne
sont pas des flux d'investissement du point de vue de l'utilisateur — ils sont
détectés et exclus dès le parsing, jamais stockés en base.
"""

import io
from dataclasses import dataclass, field
from datetime import datetime

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


def looks_like_transaction_export(columns: list[str]) -> bool:
    return REQUIRED_COLUMNS.issubset(set(columns))


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

        result.rows.append(
            {
                "transaction_id": transaction_id,
                "datetime_utc": dt,
                "date": _clean(row.get("date")) or dt.date().isoformat(),
                "category": _clean(row.get("category")) or "",
                "type": type_,
                "asset_class": _clean(row.get("asset_class")),
                "symbol": _clean(row.get("symbol")),
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
