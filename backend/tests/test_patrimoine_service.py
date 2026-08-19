"""Verrouille le patrimoine net global (Phase 1 de `docs/ROADMAP.md`) :
`services/patrimoine_service.compute_patrimoine_net` — actifs (portefeuille financier
+ immobilier/SCPI/assurance-vie/PER) moins passifs (emprunts)."""

from datetime import datetime

from app.models import Loan
from app.services import patrimoine_service

from .conftest import make_holding


def test_actifs_totaux_couvre_le_portefeuille_financier_et_le_patrimoine_manuel(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    resultat = patrimoine_service.compute_patrimoine_net(db)

    # AAA sans cours en base : valorisée à son coût de revient (1000 €), comme
    # `analysis_service.value_holdings` le fait déjà pour toute ligne sans cotation.
    assert resultat["actifs_totaux"] == 1000.0 + 250000.0


def test_passifs_totaux_somme_les_emprunts(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
    db.add(Loan(libelle="Prêt A", capital_initial=50000.0, taux_annuel_pct=0.0, mensualite=1000.0, date_debut=datetime(2020, 1, 1), duree_mois=60, capital_restant_du_manuel=30000.0))
    db.add(Loan(libelle="Prêt B", capital_initial=20000.0, taux_annuel_pct=0.0, mensualite=500.0, date_debut=datetime(2020, 1, 1), duree_mois=40, capital_restant_du_manuel=5000.0))
    db.commit()

    resultat = patrimoine_service.compute_patrimoine_net(db)

    assert resultat["passifs_totaux"] == 35000.0


def test_patrimoine_net_est_actifs_moins_passifs(db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    db.add(Loan(libelle="Crédit immo", capital_initial=200000.0, taux_annuel_pct=0.0, mensualite=1000.0, date_debut=datetime(2020, 1, 1), duree_mois=200, capital_restant_du_manuel=120000.0))
    db.commit()

    resultat = patrimoine_service.compute_patrimoine_net(db)

    assert resultat["actifs_totaux"] == 300000.0
    assert resultat["passifs_totaux"] == 120000.0
    assert resultat["patrimoine_net"] == 180000.0


def test_repartition_par_classe_groupe_par_type_actif_avec_libelles_francais(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
    make_holding(db, ticker="BBB", type_actif="STOCK", quantite=1, prix_revient_moyen=500.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=100000.0, valeur_estimee=150000.0)
    make_holding(db, ticker="SANS_TYPE", type_actif=None, quantite=1, prix_revient_moyen=200.0)

    resultat = patrimoine_service.compute_patrimoine_net(db)

    par_categorie = {item["categorie"]: item["valeur"] for item in resultat["repartition_par_classe"]}
    assert par_categorie["Actions"] == 1500.0
    assert par_categorie["Immobilier"] == 150000.0
    assert par_categorie["Non renseigné"] == 200.0
    # Triée par valeur décroissante — l'immobilier (150000) doit passer avant les
    # actions (1500), elles-mêmes avant la catégorie non renseignée (200).
    categories_triees = [item["categorie"] for item in resultat["repartition_par_classe"]]
    assert categories_triees == ["Immobilier", "Actions", "Non renseigné"]


def test_repartition_par_classe_omet_les_categories_a_valeur_nulle(db):
    make_holding(db, ticker="PE", type_actif="PRIVATE_FUND", quantite=1, prix_revient_moyen=0.0)

    resultat = patrimoine_service.compute_patrimoine_net(db)

    assert resultat["repartition_par_classe"] == []


def test_aucune_donnee_renvoie_des_totaux_nuls(db):
    resultat = patrimoine_service.compute_patrimoine_net(db)

    assert resultat == {
        "actifs_totaux": 0,
        "passifs_totaux": 0,
        "patrimoine_net": 0,
        "repartition_par_classe": [],
    }
