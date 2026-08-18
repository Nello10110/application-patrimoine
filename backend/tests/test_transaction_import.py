"""Verrouille le comportement actuel du parsing d'un export d'historique de
transactions (format Trade Republic et compatibles) : colonnes requises,
exclusion des mouvements hors bourse, tolérance aux montants vides, conversion
des dates ISO avec `Z`."""

from datetime import timezone

import pytest

from app.services.transaction_import import looks_like_transaction_export, parse_transactions_file

EN_TETE = (
    "transaction_id,datetime,date,category,type,asset_class,symbol,name,"
    "shares,price,amount,fee,tax,description,mcc_code"
)

LIGNES = [
    # Achat en bourse classique.
    "tx-buy-1,2024-01-15T10:30:00.000Z,2024-01-15,TRADING,BUY,STOCK,US0378331005,Apple Inc,"
    "10,150.5,-1505.00,1.00,0.00,Achat Apple,",
    # Mouvement de carte bancaire : hors suivi boursier, exclu par son `type`.
    "tx-card-1,2024-01-16T08:00:00.000Z,2024-01-16,CARD,CARD_TRANSACTION,,,,"
    ",,-12.50,0,0,Carrefour,",
    # Type non listé dans EXCLUDED_TYPES, mais avec un `mcc_code` : exclu quand même.
    "tx-mcc-1,2024-01-17T09:00:00.000Z,2024-01-17,CARD,CARD_SOMETHING_ELSE,,,,"
    ",,-5.00,0,0,Test mcc,5411",
    # Opération sur titre (action gratuite) : pas de mouvement de cash, `amount` vide.
    "tx-free-1,2024-01-18T00:00:00.000Z,2024-01-18,OTHER,FREE_RECEIPT,STOCK,US0378331005,Apple Inc,"
    "5,,,0,0,Action gratuite,",
]


def _contenu_csv(lignes: list[str]) -> bytes:
    return "\n".join([EN_TETE, *lignes]).encode("utf-8")


def test_looks_like_transaction_export_colonnes_requises():
    assert looks_like_transaction_export(EN_TETE.split(","))
    assert not looks_like_transaction_export(["date", "type", "amount"])


def test_parse_transactions_file_export_complet():
    resultat = parse_transactions_file(_contenu_csv(LIGNES))

    assert resultat.lignes_lues == len(LIGNES)
    assert resultat.mouvements_hors_bourse_exclus == 2  # carte + mcc_code
    assert len(resultat.rows) == 2  # achat + opération sur titre

    ids = {row["transaction_id"] for row in resultat.rows}
    assert ids == {"tx-buy-1", "tx-free-1"}


def test_exclusion_types_hors_bourse():
    resultat = parse_transactions_file(_contenu_csv(LIGNES))
    ids = {row["transaction_id"] for row in resultat.rows}
    assert "tx-card-1" not in ids


def test_exclusion_lignes_avec_mcc_code():
    resultat = parse_transactions_file(_contenu_csv(LIGNES))
    ids = {row["transaction_id"] for row in resultat.rows}
    assert "tx-mcc-1" not in ids


def test_rejet_fichier_mauvais_format():
    contenu = b"date,type,amount\n2024-01-01,BUY,100\n"
    with pytest.raises(ValueError):
        parse_transactions_file(contenu)


def test_tolerance_montant_vide():
    resultat = parse_transactions_file(_contenu_csv(LIGNES))
    ligne_gratuite = next(row for row in resultat.rows if row["transaction_id"] == "tx-free-1")

    assert ligne_gratuite["amount"] == 0.0
    assert ligne_gratuite["shares"] == 5.0
    assert ligne_gratuite["price"] is None


def test_conversion_date_iso_avec_z():
    resultat = parse_transactions_file(_contenu_csv(LIGNES))
    ligne_achat = next(row for row in resultat.rows if row["transaction_id"] == "tx-buy-1")
    dt = ligne_achat["datetime_utc"]

    assert dt.tzinfo is not None
    assert dt.astimezone(timezone.utc).replace(tzinfo=None).isoformat() == "2024-01-15T10:30:00"


def test_champs_transaction_parses():
    resultat = parse_transactions_file(_contenu_csv(LIGNES))
    ligne_achat = next(row for row in resultat.rows if row["transaction_id"] == "tx-buy-1")

    assert ligne_achat["category"] == "TRADING"
    assert ligne_achat["type"] == "BUY"
    assert ligne_achat["symbol"] == "US0378331005"
    assert ligne_achat["shares"] == 10.0
    assert ligne_achat["price"] == 150.5
    assert ligne_achat["amount"] == -1505.0
    assert ligne_achat["fee"] == 1.0
    assert ligne_achat["tax"] == 0.0
    assert ligne_achat["description"] == "Achat Apple"
