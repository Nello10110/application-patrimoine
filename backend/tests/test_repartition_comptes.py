"""Verrouille la répartition par compte (LOT 5.1) : annotation manuelle par ligne,
jamais une rentabilité — cf. docstring de `analysis_service.repartition_par_compte`."""

from app.models import Holding

from .conftest import ID_UTILISATEUR_TEST
from app.services.analysis_service import COMPTE_SANS_ANNOTATION, repartition_par_compte, value_holdings


def test_repartition_par_compte_regroupe_les_lignes_annotees(db):
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=10.0, prix_revient_moyen=100.0, compte="PEA"))
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="BBB", quantite=5.0, prix_revient_moyen=100.0, compte="CTO"))
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="CCC", quantite=2.0, prix_revient_moyen=100.0, compte="PEA"))
    db.commit()

    valued = value_holdings(db.query(Holding).all())
    items = repartition_par_compte(valued)

    par_compte = {i["compte"]: i for i in items}
    # PEA : AAA (1000) + CCC (200) = 1200 -> 1200/1700 ~ 70.6%
    assert par_compte["PEA"]["valeur"] == 1200.0
    assert par_compte["CTO"]["valeur"] == 500.0
    assert par_compte["PEA"]["pourcentage"] == 70.6
    assert par_compte["CTO"]["pourcentage"] == 29.4


def test_repartition_par_compte_regroupe_les_lignes_sans_annotation(db):
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=10.0, prix_revient_moyen=100.0, compte=None))
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="BBB", quantite=5.0, prix_revient_moyen=100.0, compte="CTO"))
    db.commit()

    valued = value_holdings(db.query(Holding).all())
    items = repartition_par_compte(valued)

    par_compte = {i["compte"]: i for i in items}
    assert par_compte[COMPTE_SANS_ANNOTATION]["valeur"] == 1000.0
    assert par_compte["CTO"]["valeur"] == 500.0


def test_repartition_par_compte_portefeuille_vide():
    assert repartition_par_compte([]) == []


def test_route_comptes_signale_l_absence_d_annotation(client, db):
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=10.0, prix_revient_moyen=100.0, compte=None))
    db.commit()

    reponse = client.get("/api/analysis/comptes")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["a_des_comptes_annotes"] is False
    assert corps["items"][0]["compte"] == COMPTE_SANS_ANNOTATION
    assert "annotation manuelle" in corps["pas_de_rentabilite_par_compte"]


def test_route_comptes_detecte_au_moins_une_ligne_annotee(client, db):
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=10.0, prix_revient_moyen=100.0, compte="PEA"))
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="BBB", quantite=5.0, prix_revient_moyen=100.0, compte=None))
    db.commit()

    corps = client.get("/api/analysis/comptes").json()

    assert corps["a_des_comptes_annotes"] is True
    assert corps["valeur_totale"] == 1500.0
    assert len(corps["items"]) == 2


def test_route_comptes_repond_sur_portefeuille_vide(client):
    reponse = client.get("/api/analysis/comptes")
    assert reponse.status_code == 200
    assert reponse.json()["items"] == []
    assert reponse.json()["a_des_comptes_annotes"] is False
