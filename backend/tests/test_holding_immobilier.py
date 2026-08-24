"""Fiche immobilier complète (backlog § 2.M.3) : détail locatif, cashflow, rentabilité
brute/nette, prix au m², et historique daté des valorisations (jamais écrasé,
contrairement à `Holding.valeur_estimee`/`date_valeur_estimee`)."""

from app.services import immobilier_service

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, NOM_UTILISATEUR_TEST, basculer_utilisateur, make_holding


def _payload_immobilier(**overrides) -> dict:
    defaults = dict(
        type_location="nue",
        loyer_mensuel=1000.0,
        charges_mensuelles=100.0,
        frais_annuels=2400.0,  # 200/mois
        surface_m2=50.0,
        nb_pieces=3,
        annee_construction=1995,
        dpe="D",
    )
    defaults.update(overrides)
    return defaults


# --- `PUT /holdings/{ticker}/immobilier` -------------------------------------------


def test_creer_le_detail_immobilier_dune_ligne(client, db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    reponse = client.put("/api/portfolio/holdings/MAISON/immobilier", json=_payload_immobilier())

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["type_location"] == "nue"
    assert corps["loyer_mensuel"] == 1000.0
    assert corps["surface_m2"] == 50.0
    assert corps["dpe"] == "D"


def test_mettre_a_jour_le_detail_immobilier_remplace_les_valeurs(client, db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    client.put("/api/portfolio/holdings/MAISON/immobilier", json=_payload_immobilier())

    reponse = client.put("/api/portfolio/holdings/MAISON/immobilier", json=_payload_immobilier(loyer_mensuel=1100.0))

    assert reponse.status_code == 200
    assert reponse.json()["loyer_mensuel"] == 1100.0


def test_immobilier_sur_ticker_introuvable_renvoie_404(client):
    reponse = client.put("/api/portfolio/holdings/INEXISTANT/immobilier", json=_payload_immobilier())

    assert reponse.status_code == 404


def test_immobilier_sur_actif_dun_autre_utilisateur_est_refuse(client, db):
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    make_holding(db, ticker="MAISON_B", user_id=ID_UTILISATEUR_B, type_actif="REAL_ESTATE")
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    reponse = client.put("/api/portfolio/holdings/MAISON_B/immobilier", json=_payload_immobilier())

    assert reponse.status_code == 404


def test_loyer_negatif_est_rejete(client, db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE")

    reponse = client.put("/api/portfolio/holdings/MAISON/immobilier", json=_payload_immobilier(loyer_mensuel=-100.0))

    assert reponse.status_code == 400


def test_surface_nulle_est_rejetee(client, db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE")

    reponse = client.put("/api/portfolio/holdings/MAISON/immobilier", json=_payload_immobilier(surface_m2=0))

    assert reponse.status_code == 400


# --- Cashflow / rentabilité, via `GET /holdings/{ticker}/detail` -------------------


def test_detail_dune_ligne_sans_fiche_immobiliere_renvoie_immobilier_null(client, db):
    make_holding(db, ticker="AAPL", type_actif="STOCK")

    reponse = client.get("/api/portfolio/holdings/AAPL/detail")

    assert reponse.status_code == 200
    assert reponse.json()["immobilier"] is None


def test_cashflow_et_rentabilite_sans_emprunt(client, db):
    # Prix d'acquisition 200 000€, loyer 1000€/mois, charges 100€/mois, frais 200€/mois (2400/an).
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    client.put("/api/portfolio/holdings/MAISON/immobilier", json=_payload_immobilier())

    reponse = client.get("/api/portfolio/holdings/MAISON/detail")

    immo = reponse.json()["immobilier"]
    # Cashflow = 1000 - 100 - 200 - 0 (pas d'emprunt) = 700
    assert immo["cashflow_mensuel"] == 700.0
    # Brute = 1000*12 / 200000 * 100 = 6.0
    assert immo["rentabilite_brute_pct"] == 6.0
    # Nette = (12000 - (1200+2400)) / 200000 * 100 = 8400/200000*100 = 4.2
    assert immo["rentabilite_nette_pct"] == 4.2
    # Prix/m2 = valeur (valeur_estimee prioritaire) / surface = 250000/50 = 5000
    assert immo["prix_m2"] == 5000.0
    assert immo["emprunt_mensualite"] is None


def test_cashflow_retranche_la_mensualite_de_lemprunt_rattache(client, db):
    holding = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", prix_revient_moyen=200000.0)
    client.put("/api/portfolio/holdings/MAISON/immobilier", json=_payload_immobilier())
    emprunt = client.post(
        "/api/loans",
        json=dict(
            libelle="Crédit immobilier",
            capital_initial=200000.0,
            taux_annuel_pct=3.5,
            mensualite=800.0,
            date_debut="2020-01-01T00:00:00",
            duree_mois=240,
        ),
    ).json()
    client.patch(f"/api/loans/{emprunt['id']}", json={"holding_id": holding.id})

    reponse = client.get("/api/portfolio/holdings/MAISON/detail")

    immo = reponse.json()["immobilier"]
    # Cashflow = 1000 - 100 - 200 - 800 = -100
    assert immo["cashflow_mensuel"] == -100.0
    assert immo["emprunt_mensualite"] == 800.0


def test_sans_loyer_seul_prix_m2_est_calcule(client, db):
    """Surface renseignée mais pas de loyer : prix/m² a un sens (comparer des biens
    entre eux), cashflow/rentabilité n'en ont pas — `None` plutôt qu'une valeur
    fausse dérivée d'un loyer inexistant."""
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    client.put("/api/portfolio/holdings/MAISON/immobilier", json=_payload_immobilier(loyer_mensuel=None))

    reponse = client.get("/api/portfolio/holdings/MAISON/detail")

    immo = reponse.json()["immobilier"]
    assert immo["prix_m2"] == 5000.0
    assert immo["cashflow_mensuel"] is None
    assert immo["rentabilite_brute_pct"] is None
    assert immo["rentabilite_nette_pct"] is None


# --- Historique de valorisation (`GET /holdings/{ticker}/immobilier-history`) ------


def test_creer_une_ligne_avec_valeur_estimee_ajoute_un_point_dhistorique(client):
    reponse = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000},
    )
    ticker = reponse.json()["ticker"]

    historique = client.get(f"/api/portfolio/holdings/{ticker}/immobilier-history").json()

    assert len(historique) == 1
    assert historique[0]["valeur"] == 250000.0


def test_mettre_a_jour_valeur_estimee_ajoute_un_point_sans_effacer_le_precedent(client):
    cree = client.post(
        "/api/portfolio/holdings", json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000}
    ).json()

    client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"valeur_estimee": 260000})
    client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"valeur_estimee": 270000})

    historique = client.get("/api/portfolio/holdings/MAISON/immobilier-history").json()

    valeurs = [p["valeur"] for p in historique]
    assert valeurs == [250000.0, 260000.0, 270000.0]  # ordre chronologique, rien écrasé


def test_modifier_un_autre_champ_najoute_pas_de_point_dhistorique(client):
    cree = client.post(
        "/api/portfolio/holdings", json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000}
    ).json()

    client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"nom": "Résidence principale"})

    historique = client.get("/api/portfolio/holdings/MAISON/immobilier-history").json()
    assert len(historique) == 1  # uniquement le point de la création


def test_effacer_valeur_estimee_najoute_pas_de_point_dhistorique(client):
    cree = client.post(
        "/api/portfolio/holdings", json={"ticker": "MAISON", "quantite": 1, "type_actif": "REAL_ESTATE", "valeur_estimee": 250000}
    ).json()

    reponse = client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"valeur_estimee": None})

    assert reponse.json()["valeur_estimee"] is None
    historique = client.get("/api/portfolio/holdings/MAISON/immobilier-history").json()
    assert len(historique) == 1  # inchangé : le point de la création n'est jamais retiré


def test_ligne_sans_valeur_estimee_na_aucun_point_dhistorique(client, db):
    make_holding(db, ticker="AAPL", type_actif="STOCK")

    historique = client.get("/api/portfolio/holdings/AAPL/immobilier-history").json()

    assert historique == []


def test_historique_dun_actif_dun_autre_utilisateur_est_refuse(client, db):
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    make_holding(db, ticker="MAISON_B", user_id=ID_UTILISATEUR_B, type_actif="REAL_ESTATE", valeur_estimee=100000.0)
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    reponse = client.get("/api/portfolio/holdings/MAISON_B/immobilier-history")

    assert reponse.status_code == 404


# --- Service pur (`immobilier_service`) ---------------------------------------------


def test_enregistrer_point_historique_ne_deduplique_pas_meme_date(db):
    from datetime import datetime

    holding = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE")
    date_unique = datetime(2026, 1, 1)

    immobilier_service.enregistrer_point_historique(db, holding.id, 100000.0, date_unique)
    immobilier_service.enregistrer_point_historique(db, holding.id, 110000.0, date_unique)

    points = immobilier_service.historique_valorisation(db, holding.id)
    assert len(points) == 2
