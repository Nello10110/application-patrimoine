"""Parseur d'export Ledger (wallet matériel crypto, retour utilisateur du
11/09/2026) — `app.services.ledger_import.parse_ledger_file`. Format distinct de
Trade Republic (`test_transaction_import_resynchronisation.py`), même doctrine de
ré-import (transaction_id stable entre deux parses du même fichier)."""

import pytest

from app.services import ledger_import

EN_TETE = (
    "Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,"
    "Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export"
)


def _ligne(
    hash_: str = "0xabc",
    ticker: str = "BTC",
    type_: str = "IN",
    montant: str = "0.001",
    fee: str = "0.0001",
    statut: str = "Confirmed",
    countervalue_operation: str = "37.80",
    countervalue_export: str = "40.00",
    date: str = "2024-01-19T10:26:23.000Z",
) -> str:
    return (
        f"{date},{statut},{ticker},{type_},{montant},{fee},{hash_},Bitcoin,xpub123,EUR,"
        f"{countervalue_operation},{countervalue_export}"
    )


def _csv(*lignes: str) -> bytes:
    return "\n".join([EN_TETE, *lignes]).encode("utf-8")


def test_looks_like_ledger_export_detecte_les_colonnes_attendues():
    assert ledger_import.looks_like_ledger_export(EN_TETE.split(","))
    assert not ledger_import.looks_like_ledger_export(["autre_colonne"])


def test_parse_leve_sur_un_format_non_reconnu():
    with pytest.raises(ValueError):
        ledger_import.parse_ledger_file(b"colonne_a,colonne_b\n1,2")


def test_operation_in_devient_un_achat_avec_le_bon_signe():
    parsed = ledger_import.parse_ledger_file(_csv(_ligne(type_="IN", montant="0.001", countervalue_operation="37.80")))

    assert len(parsed.rows) == 1
    ligne = parsed.rows[0]
    assert ligne["category"] == "TRADING"
    assert ligne["type"] == "BUY"
    assert ligne["asset_class"] == "CRYPTO"
    assert ligne["symbol"] == "BTC"
    assert ligne["shares"] == 0.001  # positif : achat
    assert ligne["amount"] == -37.80  # négatif : sortie de cash
    assert ligne["fee"] == 0.0  # frais natifs ignorés (pas de contrepartie EUR fiable)


def test_operation_out_devient_une_vente_avec_le_bon_signe():
    parsed = ledger_import.parse_ledger_file(_csv(_ligne(type_="OUT", montant="0.001", countervalue_operation="37.80")))

    ligne = parsed.rows[0]
    assert ligne["type"] == "SELL"
    assert ligne["shares"] == -0.001  # négatif : retrait, cf. portfolio_reconstruction._apply_transaction
    assert ligne["amount"] == 37.80  # positif : produit de la vente


def test_type_operation_non_reconnu_est_ignore_et_compte():
    parsed = ledger_import.parse_ledger_file(_csv(_ligne(type_="STAKE")))

    assert parsed.rows == []
    assert parsed.lignes_ignorees_type_operation == {"STAKE": 1}


def test_statut_non_confirme_est_ignore_et_compte():
    parsed = ledger_import.parse_ledger_file(_csv(_ligne(statut="Pending")))

    assert parsed.rows == []
    assert parsed.lignes_ignorees_statut == 1


def test_countervalue_vide_importe_quand_meme_la_ligne_a_cout_nul():
    """Jeton spam/poussière sans cotation connue de Ledger (cf. `bUNL` de l'export
    réel fourni par l'utilisateur) : la ligne est importée, à coût nul, plutôt que
    perdue — l'utilisateur peut de toute façon la décocher à l'aperçu."""
    parsed = ledger_import.parse_ledger_file(_csv(_ligne(ticker="BUNL", montant="0.1", countervalue_operation="")))

    assert len(parsed.rows) == 1
    assert parsed.rows[0]["amount"] == 0.0


def test_montant_nul_ou_illisible_est_ignore():
    parsed = ledger_import.parse_ledger_file(_csv(_ligne(montant="0"), _ligne(montant="", hash_="0xdef")))

    assert parsed.rows == []


def test_agregation_par_devise_compte_les_operations_et_le_montant_total():
    parsed = ledger_import.parse_ledger_file(
        _csv(
            _ligne(hash_="0x1", ticker="BTC", countervalue_operation="30.00"),
            _ligne(hash_="0x2", ticker="BTC", countervalue_operation="10.00"),
            _ligne(hash_="0x3", ticker="ETH", countervalue_operation="5.00"),
        )
    )

    assert parsed.devises["BTC"].nb_operations == 2
    assert parsed.devises["BTC"].montant_total_eur == 40.00
    assert parsed.devises["ETH"].nb_operations == 1
    assert parsed.devises["ETH"].montant_total_eur == 5.00


def test_transaction_id_prefixe_et_stable_entre_deux_parses():
    """Condition du ré-import (même mécanique que Trade Republic) : reparser le
    même fichier doit produire EXACTEMENT le même `transaction_id`."""
    contenu = _csv(_ligne(hash_="0xabc", ticker="BTC"))

    premier = ledger_import.parse_ledger_file(contenu).rows[0]["transaction_id"]
    second = ledger_import.parse_ledger_file(contenu).rows[0]["transaction_id"]

    assert premier == second
    assert premier == "ledger:0xabc:BTC"


def test_ticker_est_mis_en_majuscules():
    parsed = ledger_import.parse_ledger_file(_csv(_ligne(ticker="btc")))

    assert parsed.rows[0]["symbol"] == "BTC"


def test_staging_pending_va_et_vient():
    parsed = ledger_import.parse_ledger_file(_csv(_ligne()))
    token = ledger_import.stage_parsed_ledger(parsed)

    assert ledger_import.get_pending_ledger(token) is parsed

    ledger_import.clear_pending_ledger(token)

    with pytest.raises(KeyError):
        ledger_import.get_pending_ledger(token)
