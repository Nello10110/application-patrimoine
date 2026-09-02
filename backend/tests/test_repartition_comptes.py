"""Verrouille la répartition par compte (LOT 5.1, `analysis_service.repartition_par_compte`)
— désormais réservée à la déclaration de patrimoine PDF (`pdf_export_service.py`,
cf. `test_pdf_export_service.py`), l'ancien endpoint `GET /api/analysis/comptes` a
été retiré au profit de l'écran Comptes structurel (backlog X.1,
`services/comptes_service.solde_par_compte`, testé dans `test_comptes_service.py`)."""

from app.models import Compte, Holding

from .conftest import ID_UTILISATEUR_TEST
from app.services.analysis_service import COMPTE_SANS_ANNOTATION, repartition_par_compte, value_holdings


def _compte(db, nom: str) -> Compte:
    compte = Compte(user_id=ID_UTILISATEUR_TEST, nom=nom)
    db.add(compte)
    db.commit()
    db.refresh(compte)
    return compte


def test_repartition_par_compte_regroupe_les_lignes_annotees(db):
    pea = _compte(db, "PEA")
    cto = _compte(db, "CTO")
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=10.0, prix_revient_moyen=100.0, compte_id=pea.id))
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="BBB", quantite=5.0, prix_revient_moyen=100.0, compte_id=cto.id))
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="CCC", quantite=2.0, prix_revient_moyen=100.0, compte_id=pea.id))
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
    cto = _compte(db, "CTO")
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="AAA", quantite=10.0, prix_revient_moyen=100.0, compte_id=None))
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="BBB", quantite=5.0, prix_revient_moyen=100.0, compte_id=cto.id))
    db.commit()

    valued = value_holdings(db.query(Holding).all())
    items = repartition_par_compte(valued)

    par_compte = {i["compte"]: i for i in items}
    assert par_compte[COMPTE_SANS_ANNOTATION]["valeur"] == 1000.0
    assert par_compte["CTO"]["valeur"] == 500.0


def test_repartition_par_compte_portefeuille_vide():
    assert repartition_par_compte([]) == []
