"""Verrouille `services/revenus_passifs_service.py` (backlog 2.P.3, absorbe C.2) :
revenu CERTAIN (loyers nets, intérêts de livrets) vs ESTIMÉ (dividendes/intérêts de
courtage extrapolés depuis les 12 derniers mois réellement perçus)."""

from datetime import date, timedelta

from app.services import immobilier_service, revenus_passifs_service

from .conftest import ID_UTILISATEUR_TEST, make_holding, make_transaction


def test_sans_aucune_donnee_tout_est_nul(db):
    resultat = revenus_passifs_service.compute_revenus_passifs(db, ID_UTILISATEUR_TEST)

    assert resultat == {
        "loyers_nets_annuels": 0.0,
        "interets_livrets_annuels": 0.0,
        "revenu_certain_annuel": 0.0,
        "dividendes_estimes_annuels": 0.0,
        "interets_courtage_estimes_annuels": 0.0,
        "revenu_estime_annuel": 0.0,
        "revenu_total_projete_annuel": 0.0,
        "revenu_total_projete_mensuel": 0.0,
    }


def test_loyers_nets_annuels_retranche_charges_et_frais_pas_la_mensualite(db):
    """Backlog : le loyer net est un revenu locatif, pas un cashflow après emprunt —
    contrairement à `cashflow_mensuel` (fiche immobilier), la mensualité de l'emprunt
    ne doit PAS être retranchée ici."""
    maison = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    immobilier_service.upsert_detail_immobilier(
        db, maison.id, loyer_mensuel=1000.0, charges_mensuelles=100.0, frais_annuels=1200.0
    )

    resultat = revenus_passifs_service.compute_revenus_passifs(db, ID_UTILISATEUR_TEST)

    # 1000*12 - (100*12 + 1200) = 12000 - 2400 = 9600
    assert resultat["loyers_nets_annuels"] == 9600.0
    assert resultat["revenu_certain_annuel"] == 9600.0


def test_bien_immobilier_sans_loyer_renseigne_ne_compte_pas(db):
    maison = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    immobilier_service.upsert_detail_immobilier(db, maison.id, surface_m2=50.0)  # pas de loyer

    resultat = revenus_passifs_service.compute_revenus_passifs(db, ID_UTILISATEUR_TEST)

    assert resultat["loyers_nets_annuels"] == 0.0


def test_interets_livrets_annuels_applique_le_taux_declare(db):
    make_holding(db, ticker="LIVRETA", type_actif="REGULATED_SAVINGS", quantite=1, valeur_estimee=10000.0, taux_pct=3.0)
    make_holding(db, ticker="PEE", type_actif="EMPLOYEE_SAVINGS", quantite=1, valeur_estimee=5000.0, taux_pct=2.0)
    # Un actif hors liste (ex. compte courant) ne doit jamais entrer dans ce calcul,
    # même avec un taux renseigné par erreur.
    make_holding(db, ticker="CC", type_actif="CASH_ACCOUNT", quantite=1, valeur_estimee=1000.0, taux_pct=5.0)

    resultat = revenus_passifs_service.compute_revenus_passifs(db, ID_UTILISATEUR_TEST)

    # 10000*0.03 + 5000*0.02 = 300 + 100 = 400
    assert resultat["interets_livrets_annuels"] == 400.0


def test_dividendes_et_interets_courtage_extrapoles_depuis_les_12_derniers_mois(db):
    aujourdhui = date.today()
    recent = (aujourdhui - timedelta(days=30)).isoformat()
    trop_vieux = (aujourdhui - timedelta(days=400)).isoformat()

    make_transaction(
        db, transaction_id="div1", category="CASH", type="DIVIDEND", date=recent, amount=50.0, fee=0.0, tax=-5.0, shares=None
    )
    make_transaction(
        db, transaction_id="int1", category="CASH", type="INTEREST_PAYMENT", date=recent, amount=20.0, fee=0.0, tax=0.0, shares=None
    )
    # Hors fenêtre des 12 derniers mois : ne doit pas être compté.
    make_transaction(
        db, transaction_id="div_vieux", category="CASH", type="DIVIDEND", date=trop_vieux, amount=999.0, fee=0.0, tax=0.0, shares=None
    )

    resultat = revenus_passifs_service.compute_revenus_passifs(db, ID_UTILISATEUR_TEST)

    assert resultat["dividendes_estimes_annuels"] == 45.0  # 50 + 0 - 5
    assert resultat["interets_courtage_estimes_annuels"] == 20.0
    assert resultat["revenu_estime_annuel"] == 65.0


def test_revenu_total_combine_certain_et_estime(db):
    maison = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    immobilier_service.upsert_detail_immobilier(db, maison.id, loyer_mensuel=1000.0)
    make_holding(db, ticker="LIVRETA", type_actif="REGULATED_SAVINGS", quantite=1, valeur_estimee=10000.0, taux_pct=3.0)
    make_transaction(
        db,
        transaction_id="div1",
        category="CASH",
        type="DIVIDEND",
        date=date.today().isoformat(),
        amount=100.0,
        fee=0.0,
        tax=0.0,
        shares=None,
    )

    resultat = revenus_passifs_service.compute_revenus_passifs(db, ID_UTILISATEUR_TEST)

    # certain = 12000 (loyer, sans charges/frais renseignés) + 300 (livret) = 12300
    # estime = 100 (dividende)
    assert resultat["revenu_certain_annuel"] == 12300.0
    assert resultat["revenu_estime_annuel"] == 100.0
    assert resultat["revenu_total_projete_annuel"] == 12400.0
    assert resultat["revenu_total_projete_mensuel"] == round(12400.0 / 12, 2)
