"""Routes `/api/export/*` (LOT 5.2) : réponse CSV téléchargeable, compatible Excel
en locale française (BOM UTF-8, séparateur `;`, décimale `,`)."""

from datetime import datetime, timezone

import pytest

from app.models import Holding, MarketDataCache

from .conftest import make_holding, make_transaction

ROUTES_EXPORT = [
    "/api/export/positions",
    "/api/export/transactions",
    "/api/export/performance",
]


@pytest.mark.parametrize("route", ROUTES_EXPORT)
def test_route_repond_200_avec_content_type_csv(client, route):
    reponse = client.get(route)
    assert reponse.status_code == 200
    assert reponse.headers["content-type"].startswith("text/csv")


@pytest.mark.parametrize("route", ROUTES_EXPORT)
def test_content_disposition_propose_un_telechargement_avec_nom_date(client, route):
    reponse = client.get(route)
    disposition = reponse.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert ".csv" in disposition


@pytest.mark.parametrize("route", ROUTES_EXPORT)
def test_contenu_porte_le_bom_utf8(client, route):
    reponse = client.get(route)
    assert reponse.content.startswith(b"\xef\xbb\xbf")


def test_positions_vide_ne_contient_que_len_tete(client):
    reponse = client.get("/api/export/positions")
    texte = reponse.content.decode("utf-8-sig")
    lignes = texte.split("\r\n")
    assert lignes[0].startswith("Ticker;Nom;")
    # Une seule ligne de contenu (l'en-tête), suivie de la chaîne vide issue du
    # `\r\n` final.
    assert lignes[1:] == [""]


def test_transactions_vide_ne_contient_que_len_tete(client):
    reponse = client.get("/api/export/transactions")
    texte = reponse.content.decode("utf-8-sig")
    assert texte == "Date;Catégorie;Type;Classe d'actif;Symbole;Nom;Quantité;Prix;Montant;Frais;Taxe;Description\r\n"


def test_positions_separateur_point_virgule_et_decimale_virgule(client, db):
    make_holding(db, ticker="AAPL", nom="Apple", quantite=10.0, prix_revient_moyen=120.5, type_actif="STOCK")
    db.add(
        MarketDataCache(
            ticker="AAPL",
            prix_actuel=150.25,
            secteur="Technology",
            pays="United States",
            derniere_maj=datetime(2026, 8, 18, 14, 32, tzinfo=timezone.utc),
        )
    )
    db.commit()

    reponse = client.get("/api/export/positions")
    texte = reponse.content.decode("utf-8-sig")
    lignes = texte.strip("\r\n").split("\r\n")

    assert lignes[0].split(";")[0] == "Ticker"
    ligne_aapl = next(l for l in lignes[1:] if l.startswith("AAPL;"))
    cellules = ligne_aapl.split(";")
    assert cellules[0] == "AAPL"
    assert cellules[1] == "Apple"
    assert cellules[5] == "10,00"  # quantité
    assert cellules[7] == "150,25"  # prix actuel
    assert cellules[13] == "18/08/2026 14:32"  # dernière mise à jour du cours


def test_transactions_triees_par_date(client, db):
    make_transaction(db, transaction_id="tx-2", datetime_utc=datetime(2024, 6, 1), date="2024-06-01", amount=-500.0)
    make_transaction(db, transaction_id="tx-1", datetime_utc=datetime(2024, 1, 1), date="2024-01-01", amount=-100.0)

    reponse = client.get("/api/export/transactions")
    texte = reponse.content.decode("utf-8-sig")
    lignes = texte.strip("\r\n").split("\r\n")[1:]

    assert lignes[0].startswith("01/01/2024;")
    assert lignes[1].startswith("01/06/2024;")


def test_performance_deux_colonnes_libelle_valeur(client, db):
    make_transaction(db, symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1), date="2024-01-01")
    db.add(Holding(ticker="AAA", nom="Titre A", quantite=10.0, prix_revient_moyen=100.0))
    db.add(MarketDataCache(ticker="AAA", prix_actuel=110.0, derniere_maj=datetime.now(timezone.utc)))
    db.commit()

    reponse = client.get("/api/export/performance")
    texte = reponse.content.decode("utf-8-sig")
    lignes = texte.strip("\r\n").split("\r\n")

    assert lignes[0] == "Libellé;Valeur"
    ligne_cout = next(l for l in lignes[1:] if l.startswith("Coût total investi;"))
    assert ligne_cout == "Coût total investi;1000,00"
    ligne_date = next(l for l in lignes[1:] if l.startswith("Date de la première transaction;"))
    assert ligne_date == "Date de la première transaction;01/01/2024"
