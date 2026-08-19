"""Vérification d'intégration (au-delà du test unitaire de
`analysis_service.holdings_financiers`) : les trois endpoints de
`routers/analysis.py` délèguent bien à cette fonction — un bien immobilier ne doit
apparaître ni dans `valeur_totale`, ni dans la répartition géo/secteur (Phase 1 de
`docs/ROADMAP.md`)."""

from .conftest import make_holding


def test_analysis_annee_exclut_limmobilier_de_la_valeur_totale(client, db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    reponse = client.get("/api/analysis/2026")

    assert reponse.status_code == 200
    assert reponse.json()["valeur_totale"] == 1000.0
