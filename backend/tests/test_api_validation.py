"""Verrouille la validation des saisies (LOT 3.2) et la détection d'un doublon de
catégorie d'objectif avant écriture en base (LOT 3.1). Pour chaque contrainte : un
cas nominal (accepté) et un cas rejeté (refusé proprement, jamais un 500).

Toutes les erreurs de validation Pydantic sont renvoyées en 400 par le gestionnaire
d'erreurs global (`app.main.gestion_erreurs_validation`), avec un message français
lisible tel quel (`detail`) — cf. docstring de ce gestionnaire."""

from app.models import ORIGINE_MANUEL


# ---------------------------------------------------------------------------
# 3.1 — catégorie en doublon dans les objectifs
# ---------------------------------------------------------------------------


def _payload_targets(annee, geo, sector=None):
    return {"annee": annee, "geo": geo, "sector": sector or []}


def test_set_targets_categorie_dupliquee_refusee_en_400(client):
    payload = _payload_targets(
        2026,
        geo=[
            {"categorie": "Europe", "pourcentage_cible": 50},
            {"categorie": "Europe", "pourcentage_cible": 50},
        ],
    )
    reponse = client.put("/api/targets/2026", json=payload)

    assert reponse.status_code == 400
    detail = reponse.json()["detail"]
    assert "Europe" in detail
    assert "geo" in detail


def test_set_targets_sans_doublon_accepte_en_200(client):
    payload = _payload_targets(
        2026,
        geo=[
            {"categorie": "Europe", "pourcentage_cible": 60},
            {"categorie": "Amérique du Nord", "pourcentage_cible": 40},
        ],
    )
    reponse = client.put("/api/targets/2026", json=payload)

    assert reponse.status_code == 200
    categories = {item["categorie"] for item in reponse.json()}
    assert categories == {"Europe", "Amérique du Nord"}


def test_set_targets_categorie_dupliquee_dans_sector_refusee(client):
    payload = _payload_targets(
        2026,
        geo=[],
        sector=[
            {"categorie": "Technologie", "pourcentage_cible": 50},
            {"categorie": "Technologie", "pourcentage_cible": 50},
        ],
    )
    reponse = client.put("/api/targets/2026", json=payload)

    assert reponse.status_code == 400
    detail = reponse.json()["detail"]
    assert "Technologie" in detail
    assert "sector" in detail


# ---------------------------------------------------------------------------
# 3.2 — HoldingBase / HoldingCreate : ticker, quantité, prix de revient
# ---------------------------------------------------------------------------


def test_create_holding_ticker_vide_refuse_en_400(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "   ", "quantite": 10})
    assert reponse.status_code == 400
    assert "ticker" in reponse.json()["detail"].lower()


def test_create_holding_ticker_normalise_majuscules_sans_espaces(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "  aapl  ", "quantite": 10})
    assert reponse.status_code == 200
    body = reponse.json()
    assert body["ticker"] == "AAPL"
    assert body["origine"] == ORIGINE_MANUEL


def test_create_holding_quantite_negative_refusee_en_400(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": -5})
    assert reponse.status_code == 400


def test_create_holding_quantite_nulle_refusee_en_400(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 0})
    assert reponse.status_code == 400


def test_create_holding_quantite_positive_acceptee(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 5})
    assert reponse.status_code == 200


def test_create_holding_prix_revient_negatif_refuse_en_400(client):
    reponse = client.post(
        "/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 5, "prix_revient_moyen": -1}
    )
    assert reponse.status_code == 400


def test_create_holding_prix_revient_nul_accepte(client):
    reponse = client.post(
        "/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 5, "prix_revient_moyen": 0}
    )
    assert reponse.status_code == 200


def test_create_holding_sans_prix_revient_accepte(client):
    reponse = client.post("/api/portfolio/holdings", json={"ticker": "AAPL", "quantite": 5})
    assert reponse.status_code == 200
    assert reponse.json()["prix_revient_moyen"] is None


# ---------------------------------------------------------------------------
# 3.2 — HoldingUpdate : mêmes contraintes, appliquées seulement aux champs fournis
# ---------------------------------------------------------------------------


def _creer_holding(client, **overrides):
    payload = {"ticker": "AAPL", "quantite": 5}
    payload.update(overrides)
    reponse = client.post("/api/portfolio/holdings", json=payload)
    assert reponse.status_code == 200
    return reponse.json()["id"]


def test_update_holding_quantite_negative_refusee_en_400(client):
    holding_id = _creer_holding(client)
    reponse = client.patch(f"/api/portfolio/holdings/{holding_id}", json={"quantite": -1})
    assert reponse.status_code == 400


def test_update_holding_quantite_positive_acceptee(client):
    holding_id = _creer_holding(client)
    reponse = client.patch(f"/api/portfolio/holdings/{holding_id}", json={"quantite": 42})
    assert reponse.status_code == 200
    assert reponse.json()["quantite"] == 42


def test_update_holding_ticker_vide_refuse_en_400(client):
    holding_id = _creer_holding(client)
    reponse = client.patch(f"/api/portfolio/holdings/{holding_id}", json={"ticker": "   "})
    assert reponse.status_code == 400


def test_update_holding_prix_revient_negatif_refuse_en_400(client):
    holding_id = _creer_holding(client)
    reponse = client.patch(f"/api/portfolio/holdings/{holding_id}", json={"prix_revient_moyen": -10})
    assert reponse.status_code == 400


# ---------------------------------------------------------------------------
# 3.2 — AllocationTargetItem : pourcentage_cible borné, catégorie non vide
# ---------------------------------------------------------------------------


def test_set_targets_pourcentage_negatif_refuse_en_400(client):
    payload = _payload_targets(2026, geo=[{"categorie": "Europe", "pourcentage_cible": -10}])
    reponse = client.put("/api/targets/2026", json=payload)
    assert reponse.status_code == 400


def test_set_targets_pourcentage_superieur_a_100_refuse_en_400(client):
    payload = _payload_targets(2026, geo=[{"categorie": "Europe", "pourcentage_cible": 150}])
    reponse = client.put("/api/targets/2026", json=payload)
    assert reponse.status_code == 400


def test_set_targets_pourcentage_borne_acceptee(client):
    payload = _payload_targets(2026, geo=[{"categorie": "Europe", "pourcentage_cible": 100}])
    reponse = client.put("/api/targets/2026", json=payload)
    assert reponse.status_code == 200


def test_set_targets_categorie_vide_refusee_en_400(client):
    payload = _payload_targets(2026, geo=[{"categorie": "   ", "pourcentage_cible": 100}])
    reponse = client.put("/api/targets/2026", json=payload)
    assert reponse.status_code == 400


# ---------------------------------------------------------------------------
# 3.2 — ScheduledJobUpdate.intervalle_heures : entre 0,25 et 168 heures
# ---------------------------------------------------------------------------


def test_update_job_intervalle_nul_refuse_en_400(client):
    reponse = client.put("/api/settings/jobs/market_data_refresh", json={"enabled": True, "intervalle_heures": 0})
    assert reponse.status_code == 400


def test_update_job_intervalle_negatif_refuse_en_400(client):
    reponse = client.put("/api/settings/jobs/market_data_refresh", json={"enabled": True, "intervalle_heures": -5})
    assert reponse.status_code == 400


def test_update_job_intervalle_superieur_a_une_semaine_refuse_en_400(client):
    reponse = client.put("/api/settings/jobs/market_data_refresh", json={"enabled": True, "intervalle_heures": 200})
    assert reponse.status_code == 400


def test_update_job_intervalle_valide_accepte(client):
    reponse = client.put("/api/settings/jobs/market_data_refresh", json={"enabled": True, "intervalle_heures": 6})
    assert reponse.status_code == 200
    assert reponse.json()["intervalle_heures"] == 6


def test_update_job_intervalle_minimal_quart_heure_accepte(client):
    reponse = client.put("/api/settings/jobs/market_data_refresh", json={"enabled": True, "intervalle_heures": 0.25})
    assert reponse.status_code == 200


# ---------------------------------------------------------------------------
# 7.3 — CORS restreint (pas de credentials, méthodes/en-têtes explicites)
# ---------------------------------------------------------------------------


def test_cors_credentials_desactives_methodes_restreintes(client):
    reponse = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert reponse.status_code == 200
    assert reponse.headers.get("access-control-allow-credentials") is None
    assert "GET" in reponse.headers.get("access-control-allow-methods", "")
