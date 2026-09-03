"""Verrouille le comportement actuel du parsing d'un export d'historique de
transactions (format Trade Republic et compatibles) : colonnes requises,
exclusion des mouvements hors bourse, tolérance aux montants vides, conversion
des dates ISO avec `Z`."""

from datetime import timezone

import pytest

from app.services.transaction_import import (
    CLE_COMPTE_CRYPTO,
    CLE_COMPTE_OBLIGATIONS,
    CLE_COMPTE_PEA,
    CLE_COMPTE_TITRES,
    cle_compte,
    looks_like_transaction_export,
    parse_transactions_file,
)

EN_TETE = (
    "transaction_id,datetime,date,category,type,asset_class,symbol,name,"
    "shares,price,amount,fee,tax,description,mcc_code"
)

EN_TETE_AVEC_COMPTE = (
    "transaction_id,datetime,date,category,type,asset_class,symbol,name,"
    "shares,price,amount,fee,tax,description,account_type"
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


# --- Import multi-comptes (revue du 03/09/2026) -----------------------------


class TestCleCompte:
    """`cle_compte` : les 4 branches + la priorité `account_type == "PEA"` sur
    `asset_class` (un PEA ne contient que des actions/fonds éligibles par
    construction réglementaire, la distinction crypto/obligations n'a pas de sens
    à l'intérieur d'un PEA)."""

    def test_pea_prime_sur_asset_class(self):
        assert cle_compte("PEA", "CRYPTO") == CLE_COMPTE_PEA
        assert cle_compte("PEA", "BOND") == CLE_COMPTE_PEA
        assert cle_compte("PEA", "STOCK") == CLE_COMPTE_PEA

    def test_crypto_hors_pea(self):
        assert cle_compte("DEFAULT", "CRYPTO") == CLE_COMPTE_CRYPTO

    def test_obligations_hors_pea(self):
        assert cle_compte("DEFAULT", "BOND") == CLE_COMPTE_OBLIGATIONS

    def test_compte_titres_par_defaut(self):
        assert cle_compte("DEFAULT", "STOCK") == CLE_COMPTE_TITRES
        assert cle_compte("DEFAULT", "FUND") == CLE_COMPTE_TITRES
        assert cle_compte("DEFAULT", "PRIVATE_FUND") == CLE_COMPTE_TITRES
        assert cle_compte("DEFAULT", "") == CLE_COMPTE_TITRES

    def test_account_type_absent_traite_comme_default(self):
        assert cle_compte(None, "STOCK") == CLE_COMPTE_TITRES
        assert cle_compte(None, None) == CLE_COMPTE_TITRES

    def test_insensible_a_la_casse(self):
        assert cle_compte("pea", "stock") == CLE_COMPTE_PEA
        assert cle_compte("default", "crypto") == CLE_COMPTE_CRYPTO


# Reproduit le cas réel de l'utilisateur : PEA + Compte-titres + Cryptomonnaie +
# Obligations dans le même fichier.
LIGNES_MULTI_COMPTES = [
    "tx-pea-1,2024-01-10T10:00:00.000Z,2024-01-10,TRADING,BUY,STOCK,FR0000120271,TotalEnergies,"
    "1,50.0,-50.00,0,0,Achat PEA,PEA",
    "tx-ct-1,2024-01-11T10:00:00.000Z,2024-01-11,TRADING,BUY,STOCK,US0378331005,Apple Inc,"
    "1,150.0,-150.00,0,0,Achat CT,DEFAULT",
    "tx-crypto-1,2024-01-12T10:00:00.000Z,2024-01-12,TRADING,BUY,CRYPTO,BTC,Bitcoin,"
    "0.01,40000.0,-400.00,0,0,Achat crypto,DEFAULT",
    "tx-bond-1,2024-01-13T10:00:00.000Z,2024-01-13,TRADING,BUY,BOND,FR0013451333,OAT 2030,"
    "1,100.0,-100.00,0,0,Achat obligation,DEFAULT",
]


def _contenu_csv_multi_comptes(lignes: list[str]) -> bytes:
    return "\n".join([EN_TETE_AVEC_COMPTE, *lignes]).encode("utf-8")


def test_bucket_par_ligne_reproduit_le_cas_reel():
    resultat = parse_transactions_file(_contenu_csv_multi_comptes(LIGNES_MULTI_COMPTES))

    assert resultat.lignes_par_cle_compte == {
        CLE_COMPTE_PEA: 1,
        CLE_COMPTE_TITRES: 1,
        CLE_COMPTE_CRYPTO: 1,
        CLE_COMPTE_OBLIGATIONS: 1,
    }


def test_cle_compte_par_ticker_associe_chaque_symbole():
    resultat = parse_transactions_file(_contenu_csv_multi_comptes(LIGNES_MULTI_COMPTES))

    assert resultat.cle_compte_par_ticker == {
        "FR0000120271": CLE_COMPTE_PEA,
        "US0378331005": CLE_COMPTE_TITRES,
        "BTC": CLE_COMPTE_CRYPTO,
        "FR0013451333": CLE_COMPTE_OBLIGATIONS,
    }


def test_dernier_gagne_par_ticker_sur_deux_lignes_du_meme_symbole():
    """Un même ticker classé différemment sur deux lignes du fichier (rare, mais
    possible si le courtier change la nature d'un compte) : la DERNIÈRE ligne du
    fichier gagne pour le mapping par ticker (même règle que `state.asset_class`
    en reconstruction) — mais chaque ligne reste comptée individuellement dans
    `lignes_par_cle_compte` (comptage par ligne, pas par ticker)."""
    lignes = [
        "tx-1,2024-01-10T10:00:00.000Z,2024-01-10,TRADING,BUY,STOCK,XYZ,Ticker XYZ,"
        "1,10.0,-10.00,0,0,Achat 1,DEFAULT",
        "tx-2,2024-01-11T10:00:00.000Z,2024-01-11,TRADING,BUY,STOCK,XYZ,Ticker XYZ,"
        "1,10.0,-10.00,0,0,Achat 2,PEA",
    ]
    resultat = parse_transactions_file(_contenu_csv_multi_comptes(lignes))

    assert resultat.cle_compte_par_ticker == {"XYZ": CLE_COMPTE_PEA}
    assert resultat.lignes_par_cle_compte[CLE_COMPTE_TITRES] == 1
    assert resultat.lignes_par_cle_compte[CLE_COMPTE_PEA] == 1


def test_lignes_par_cle_compte_omet_aucune_cle_meme_a_zero():
    """Toutes les clés de `CLES_COMPTE` sont présentes dans le résultat, même à 0 —
    c'est `routers/transactions.py::import_apercu` qui filtre les clés à 0 pour
    l'affichage, pas ce service."""
    resultat = parse_transactions_file(_contenu_csv(LIGNES))

    assert set(resultat.lignes_par_cle_compte.keys()) == {
        CLE_COMPTE_PEA,
        CLE_COMPTE_TITRES,
        CLE_COMPTE_CRYPTO,
        CLE_COMPTE_OBLIGATIONS,
    }
    assert resultat.lignes_par_cle_compte[CLE_COMPTE_PEA] == 0
