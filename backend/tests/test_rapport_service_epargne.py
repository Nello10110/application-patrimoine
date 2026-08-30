"""Verrouille le bloc épargne du rapport (backlog § U.1, demande directe de
l'utilisateur 30/08/2026) : `rapport_service.compute_rapport_epargne_periode` — la
partie 100% financière de `compute_rapport_periode` reste couverte par
`test_rapport_service.py`, inchangée par cette extension."""

from datetime import datetime

from app.services import historical_performance_service, immobilier_service
from app.services.rapport_service import compute_rapport_epargne_periode, compute_rapport_periode

from .conftest import ID_UTILISATEUR_TEST, make_holding


def test_aucune_ligne_epargne_renvoie_a_des_donnees_false(db):
    epargne = compute_rapport_epargne_periode(db, "2026-01-01", "2026-12-31", ID_UTILISATEUR_TEST)

    assert epargne["a_des_donnees"] is False
    assert epargne["valeur_debut_periode"] == 0.0
    assert epargne["valeur_fin_periode"] == 0.0
    assert epargne["evolution_pct"] is None
    assert epargne["interets_estimes_periode"] == 0.0
    assert epargne["versements_estimes_periode"] == 0.0
    assert epargne["repartition_par_type"] == []


def test_evolution_de_lepargne_entre_debut_et_fin_de_periode(db):
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1, valeur_estimee=10000.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 10000.0, datetime(2026, 1, 1))
    immobilier_service.enregistrer_point_historique(db, holding.id, 11000.0, datetime(2026, 6, 1))

    epargne = compute_rapport_epargne_periode(db, "2026-01-01", "2026-12-31", ID_UTILISATEUR_TEST)

    assert epargne["a_des_donnees"] is True
    assert epargne["valeur_debut_periode"] == 10000.0
    assert epargne["valeur_fin_periode"] == 11000.0
    assert epargne["evolution_pct"] == 10.0


def test_repartition_par_type_en_fin_de_periode_triee_par_valeur_decroissante(db):
    livret = make_holding(db, ticker="LDD1", type_actif="REGULATED_SAVINGS", quantite=1, valeur_estimee=3000.0)
    av = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1, valeur_estimee=15000.0)
    immobilier_service.enregistrer_point_historique(db, livret.id, 3000.0, datetime(2026, 1, 1))
    immobilier_service.enregistrer_point_historique(db, av.id, 15000.0, datetime(2026, 1, 1))

    epargne = compute_rapport_epargne_periode(db, "2026-01-01", "2026-12-31", ID_UTILISATEUR_TEST)

    assert epargne["repartition_par_type"] == [
        {"label": "Assurance-vie", "valeur": 15000.0},
        {"label": "Épargne réglementée", "valeur": 3000.0},
    ]


def test_interets_estimes_proratises_sur_la_duree_de_la_periode(db):
    """Un livret à 4%/an, sur une période d'exactement un an, doit produire
    l'intérêt annuel plein — sur un DEMI-an, la moitié (extension proratisée de
    `revenus_passifs_service._interets_livrets_annuels`, jusqu'ici fixée à 12 mois)."""
    holding = make_holding(db, ticker="LDD1", type_actif="REGULATED_SAVINGS", quantite=1, valeur_estimee=10000.0, taux_pct=4.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 10000.0, datetime(2025, 1, 1))

    epargne_un_an = compute_rapport_epargne_periode(db, "2025-01-01", "2025-12-31", ID_UTILISATEUR_TEST)
    epargne_six_mois = compute_rapport_epargne_periode(db, "2025-01-01", "2025-07-01", ID_UTILISATEUR_TEST)

    assert epargne_un_an["interets_estimes_periode"] == 400.0  # 10000 * 4% (365j / 365)
    assert epargne_six_mois["interets_estimes_periode"] == 199.45  # 182j (1er janv. au 1er juil. inclus) / 365 * 400


def test_type_sans_taux_declare_necoule_aucun_interet(db):
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1, valeur_estimee=10000.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 10000.0, datetime(2025, 1, 1))

    epargne = compute_rapport_epargne_periode(db, "2025-01-01", "2025-12-31", ID_UTILISATEUR_TEST)

    assert epargne["interets_estimes_periode"] == 0.0


def test_versements_estimes_est_le_residu_apres_les_interets_estimes(db):
    holding = make_holding(db, ticker="LDD1", type_actif="REGULATED_SAVINGS", quantite=1, valeur_estimee=10500.0, taux_pct=4.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 10000.0, datetime(2025, 1, 1))
    immobilier_service.enregistrer_point_historique(db, holding.id, 10500.0, datetime(2025, 12, 31))

    epargne = compute_rapport_epargne_periode(db, "2025-01-01", "2025-12-31", ID_UTILISATEUR_TEST)

    # Évolution totale 500 € ; intérêt estimé ~420 € (10500 * 4% sur la période) ;
    # le reste (résidu) est attribué au versement estimé.
    variation = epargne["valeur_fin_periode"] - epargne["valeur_debut_periode"]
    assert epargne["versements_estimes_periode"] == round(variation - epargne["interets_estimes_periode"], 2)


def test_type_immobilier_ninflue_pas_sur_le_bloc_epargne(db):
    """`TYPES_EPARGNE` exclut explicitement l'immobilier (fiche dédiée) — une ligne
    REAL_ESTATE ne doit apparaître ni dans la valeur ni dans la répartition."""
    bien = make_holding(db, ticker="APPT", type_actif="REAL_ESTATE", quantite=1, valeur_estimee=300000.0)
    immobilier_service.enregistrer_point_historique(db, bien.id, 300000.0, datetime(2025, 1, 1))

    epargne = compute_rapport_epargne_periode(db, "2025-01-01", "2025-12-31", ID_UTILISATEUR_TEST)

    assert epargne["a_des_donnees"] is False


def test_compute_rapport_periode_inclut_le_bloc_epargne(db, monkeypatch):
    """Intégration : le rapport global embarque bien `epargne`, sans que le reste
    (100% financier, `test_rapport_service.py`) n'ait besoin de connaître son
    existence."""
    monkeypatch.setattr(historical_performance_service, "compute_portfolio_history", lambda db_, user_id_: [])
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1, valeur_estimee=5000.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 5000.0, datetime(2026, 1, 1))

    rapport = compute_rapport_periode(db, "2026-01-01", "2026-12-31", ID_UTILISATEUR_TEST)

    assert rapport["epargne"]["a_des_donnees"] is True
    assert rapport["epargne"]["valeur_fin_periode"] == 5000.0
