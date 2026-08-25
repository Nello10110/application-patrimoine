"""Verrouille `services/salaire_service.py` : conversion brut/net, taux d'épargne
distinct du rendement de marché."""

from app.services import performance_service, preferences_service, salaire_service

from .conftest import ID_UTILISATEUR_TEST, make_transaction


def test_estimer_brut_net_depuis_brut_cadre():
    brut, net = salaire_service.estimer_brut_net(3000.0, "brut", "cadre")
    assert brut == 3000.0
    assert net == 2250.0  # 3000 * 0.75


def test_estimer_brut_net_depuis_net_non_cadre():
    brut, net = salaire_service.estimer_brut_net(2340.0, "net", "non_cadre")
    assert net == 2340.0
    assert round(brut, 2) == 3000.0  # 2340 / 0.78


def test_resume_brut_mensuel_avec_treizieme_mois(db):
    resultat = salaire_service.compute_salaire_resume(
        db, ID_UTILISATEUR_TEST, 2026, montant=3000.0, type_montant="brut", periodicite="mensuel", statut="cadre", nombre_mois=13
    )
    assert resultat["brut_annuel"] == 39000.0  # 3000 * 13
    assert resultat["brut_par_versement"] == 3000.0
    assert round(resultat["brut_mensuel_moyen"], 2) == 3250.0  # 39000 / 12
    assert resultat["net_avant_impot_annuel"] == 29250.0  # 39000 * 0.75


def test_resume_annuel_ne_multiplie_pas_par_nombre_mois(db):
    resultat = salaire_service.compute_salaire_resume(
        db, ID_UTILISATEUR_TEST, 2026, montant=36000.0, type_montant="brut", periodicite="annuel", statut="non_cadre", nombre_mois=12
    )
    assert resultat["brut_annuel"] == 36000.0


def test_net_apres_impot_absent_sans_taux_imposition(db):
    resultat = salaire_service.compute_salaire_resume(
        db, ID_UTILISATEUR_TEST, 2026, montant=2500.0, type_montant="net", periodicite="mensuel", statut="cadre", nombre_mois=12
    )
    assert resultat["net_apres_impot_annuel"] is None
    assert resultat["net_apres_impot_mensuel_moyen"] is None
    # Repli : le taux d'épargne se calcule alors sur le net AVANT impôt.
    assert resultat["taux_epargne_base_net_apres_impot"] is False


def test_net_apres_impot_present_avec_taux_imposition(db):
    preferences_service.enregistrer_preferences(db, ID_UTILISATEUR_TEST, "cout_moyen_pondere", 5.0, taux_imposition_pct=10.0)

    resultat = salaire_service.compute_salaire_resume(
        db, ID_UTILISATEUR_TEST, 2026, montant=2500.0, type_montant="net", periodicite="mensuel", statut="cadre", nombre_mois=12
    )
    assert resultat["net_apres_impot_annuel"] == 27000.0  # 2500*12 * 0.9
    assert resultat["taux_epargne_base_net_apres_impot"] is True


def test_taux_epargne_calcule_depuis_les_achats_reels_de_lannee(db):
    preferences_service.enregistrer_preferences(db, ID_UTILISATEUR_TEST, "cout_moyen_pondere", 5.0, taux_imposition_pct=0.0)
    # Achat réel sur l'année : 1000 investis.
    make_transaction(db, category="TRADING", type="BUY", date="2026-03-01", amount=-1000.0, fee=0.0, tax=0.0, shares=1.0)
    # Hors période (2025) : ne doit pas compter.
    make_transaction(db, category="TRADING", type="BUY", date="2025-03-01", amount=-500.0, fee=0.0, tax=0.0, shares=1.0)
    # Vente : ne doit pas compter dans le montant investi.
    make_transaction(db, category="TRADING", type="SELL", date="2026-04-01", amount=200.0, fee=0.0, tax=0.0, shares=-1.0)

    resultat = salaire_service.compute_salaire_resume(
        db, ID_UTILISATEUR_TEST, 2026, montant=20000.0, type_montant="net", periodicite="annuel", statut="cadre", nombre_mois=12
    )
    assert resultat["montant_investi_annee"] == 1000.0
    assert resultat["taux_epargne_pct"] == 5.0  # 1000 / 20000 * 100


def test_taux_epargne_none_si_base_nulle(db):
    # Appel direct au service (hors validation Pydantic `SalaireIn`, qui interdit
    # montant <= 0) pour verrouiller l'absence de division par zéro.
    resultat = salaire_service.compute_salaire_resume(
        db, ID_UTILISATEUR_TEST, 2026, montant=0.0, type_montant="net", periodicite="annuel", statut="cadre", nombre_mois=12
    )
    assert resultat["taux_epargne_pct"] is None


def test_montant_investi_periode_inclut_private_market_buy(db):
    make_transaction(db, category="CASH", type="PRIVATE_MARKET_BUY", date="2026-06-01", amount=-500.0, fee=-10.0, tax=0.0, shares=None, symbol=None)

    total = performance_service.montant_investi_periode(db, ID_UTILISATEUR_TEST, "2026-01-01", "2026-12-31")
    assert total == 510.0


def test_upsert_et_delete_salaire(db):
    ligne = salaire_service.upsert_salaire(
        db, ID_UTILISATEUR_TEST, 2026, montant=3000.0, type_montant="brut", periodicite="mensuel", statut="cadre", nombre_mois=12
    )
    assert ligne.id is not None
    assert salaire_service.get_salaire(db, ID_UTILISATEUR_TEST, 2026) is not None

    # Upsert : ré-écrit la même ligne, n'en crée pas une seconde.
    salaire_service.upsert_salaire(
        db, ID_UTILISATEUR_TEST, 2026, montant=3500.0, type_montant="brut", periodicite="mensuel", statut="cadre", nombre_mois=12
    )
    assert len(salaire_service.list_salaires(db, ID_UTILISATEUR_TEST)) == 1
    assert salaire_service.get_salaire(db, ID_UTILISATEUR_TEST, 2026).montant == 3500.0

    assert salaire_service.delete_salaire(db, ID_UTILISATEUR_TEST, 2026) is True
    assert salaire_service.get_salaire(db, ID_UTILISATEUR_TEST, 2026) is None
    assert salaire_service.delete_salaire(db, ID_UTILISATEUR_TEST, 2026) is False
