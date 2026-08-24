"""Verrouille les rôles et permissions (backlog 2.L.2) : propriétaire/membre/invité,
granularité grossière par type de ressource (décision validée avec l'utilisateur —
un membre peut agir sur n'importe quel actif/emprunt/transaction du foyer, pas
seulement "les siens" au sens quotité). Réutilise le pattern `client_reel`/`db_vide`
de `test_auth_router.py` (jetons réels, pas l'override `get_current_user` du reste
de la suite) — indispensable pour exercer réellement `require_role`."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import get_current_user
from app.database import Base, get_db
from app.main import app
from tests.test_auth_router import db_vide  # noqa: F401 - réutilise la fixture existante


@pytest.fixture
def client_reel(db_vide):
    def _override_get_db():
        yield db_vide

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


def _en_tete(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _fonder_foyer(client_reel) -> str:
    """Crée le compte propriétaire (premier compte, bootstrap) et renvoie son jeton."""
    return client_reel.post("/api/auth/register", json={"username": "proprio", "password": "mot-de-passe-solide"}).json()["token"]


def _creer_membre(client_reel, token_proprietaire: str, username="membre") -> str:
    client_reel.post(
        "/api/auth/household-members",
        json={"username": username, "password": "mot-de-passe-solide", "role": "membre"},
        headers=_en_tete(token_proprietaire),
    )
    return client_reel.post("/api/auth/login", json={"username": username, "password": "mot-de-passe-solide"}).json()["token"]


def _creer_invite(client_reel, token_proprietaire: str, detenteur_ids: list[int], username="invite") -> str:
    client_reel.post(
        "/api/auth/household-members",
        json={"username": username, "password": "mot-de-passe-solide", "role": "invite", "detenteur_ids": detenteur_ids},
        headers=_en_tete(token_proprietaire),
    )
    return client_reel.post("/api/auth/login", json={"username": username, "password": "mot-de-passe-solide"}).json()["token"]


# --- Propriétaire : accès total ---------------------------------------------


def test_proprietaire_peut_tout_faire(client_reel):
    token = _fonder_foyer(client_reel)

    assert client_reel.post("/api/portfolio/holdings", json={"ticker": "AAA", "quantite": 1, "prix_revient_moyen": 10}, headers=_en_tete(token)).status_code == 200
    assert client_reel.get("/api/detenteurs", headers=_en_tete(token)).status_code == 200
    assert client_reel.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}, headers=_en_tete(token)).status_code == 200
    assert client_reel.get("/api/settings/jobs", headers=_en_tete(token)).status_code == 200


# --- Membre : lecture + saisie sur les actifs/emprunts/transactions, pas le reste --


def test_membre_peut_creer_et_modifier_des_holdings(client_reel):
    token_proprio = _fonder_foyer(client_reel)
    token_membre = _creer_membre(client_reel, token_proprio)

    creation = client_reel.post(
        "/api/portfolio/holdings", json={"ticker": "AAA", "quantite": 1, "prix_revient_moyen": 10}, headers=_en_tete(token_membre)
    )
    assert creation.status_code == 200
    holding_id = creation.json()["id"]

    maj = client_reel.patch(f"/api/portfolio/holdings/{holding_id}", json={"quantite": 2}, headers=_en_tete(token_membre))
    assert maj.status_code == 200

    # Visible aussi côté propriétaire (même foyer, même `user_id` métier).
    holdings_proprio = client_reel.get("/api/portfolio/holdings", headers=_en_tete(token_proprio)).json()
    assert any(h["ticker"] == "AAA" for h in holdings_proprio)


def test_membre_refuse_sur_les_objectifs_et_detenteurs(client_reel):
    token_proprio = _fonder_foyer(client_reel)
    token_membre = _creer_membre(client_reel, token_proprio)

    assert client_reel.get("/api/targets/2026", headers=_en_tete(token_membre)).status_code == 403
    assert client_reel.get("/api/detenteurs", headers=_en_tete(token_membre)).status_code == 403
    assert client_reel.get("/api/settings/jobs", headers=_en_tete(token_membre)).status_code == 403
    # Un membre garde un accès large en lecture/écriture sur les données du foyer
    # mais ne peut pas les exposer publiquement (backlog 2.Q.1).
    assert client_reel.get("/api/partage", headers=_en_tete(token_membre)).status_code == 403
    assert client_reel.post("/api/partage", json={"nom": "Test"}, headers=_en_tete(token_membre)).status_code == 403


def test_second_foyer_isole(db_vide, client_reel):
    """Second foyer : `register` est fermé après le premier compte (2.L.2) — on crée
    donc ce second propriétaire directement en base, la mécanique de bootstrap
    elle-même étant déjà verrouillée par `test_auth_router.py`."""
    from app.services import auth_service

    token_proprio_a = _fonder_foyer(client_reel)
    client_reel.post("/api/portfolio/holdings", json={"ticker": "SECRET", "quantite": 1, "prix_revient_moyen": 10}, headers=_en_tete(token_proprio_a))

    proprio_b = auth_service.creer_utilisateur(db_vide, "proprio-b", "mot-de-passe-solide")
    token_b = auth_service.creer_token(db_vide, proprio_b).token
    membre_b_token = _creer_membre(client_reel, token_b, username="membre-b")

    holdings_membre_b = client_reel.get("/api/portfolio/holdings", headers=_en_tete(membre_b_token)).json()
    assert holdings_membre_b == []


# --- Invité : lecture seule, filtrée à son périmètre -------------------------


def test_invite_est_filtre_a_son_perimetre(client_reel):
    token_proprio = _fonder_foyer(client_reel)
    alice = client_reel.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}, headers=_en_tete(token_proprio)).json()
    bob = client_reel.post("/api/detenteurs", json={"nom": "Bob", "type": "personne"}, headers=_en_tete(token_proprio)).json()

    holding_alice = client_reel.post(
        "/api/portfolio/holdings", json={"ticker": "ALICE", "quantite": 1, "prix_revient_moyen": 10}, headers=_en_tete(token_proprio)
    ).json()
    holding_bob = client_reel.post(
        "/api/portfolio/holdings", json={"ticker": "BOB", "quantite": 1, "prix_revient_moyen": 10}, headers=_en_tete(token_proprio)
    ).json()
    client_reel.put(
        f"/api/portfolio/holdings/{holding_alice['ticker']}/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 100.0}]},
        headers=_en_tete(token_proprio),
    )
    client_reel.put(
        f"/api/portfolio/holdings/{holding_bob['ticker']}/quotites",
        json={"quotites": [{"detenteur_id": bob["id"], "quotite_pct": 100.0}]},
        headers=_en_tete(token_proprio),
    )

    token_invite = _creer_invite(client_reel, token_proprio, [alice["id"]])

    holdings_invite = client_reel.get("/api/portfolio/holdings", headers=_en_tete(token_invite)).json()

    assert [h["ticker"] for h in holdings_invite] == ["ALICE"]


def test_invite_sans_perimetre_ne_voit_rien(client_reel):
    token_proprio = _fonder_foyer(client_reel)
    client_reel.post("/api/portfolio/holdings", json={"ticker": "AAA", "quantite": 1, "prix_revient_moyen": 10}, headers=_en_tete(token_proprio))

    token_invite = _creer_invite(client_reel, token_proprio, [])

    assert client_reel.get("/api/portfolio/holdings", headers=_en_tete(token_invite)).json() == []


def test_invite_refuse_en_ecriture(client_reel):
    token_proprio = _fonder_foyer(client_reel)
    token_invite = _creer_invite(client_reel, token_proprio, [])

    reponse = client_reel.post(
        "/api/portfolio/holdings", json={"ticker": "AAA", "quantite": 1, "prix_revient_moyen": 10}, headers=_en_tete(token_invite)
    )

    assert reponse.status_code == 403


def test_invite_refuse_hors_de_son_perimetre_sur_patrimoine_net(client_reel):
    token_proprio = _fonder_foyer(client_reel)
    alice = client_reel.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}, headers=_en_tete(token_proprio)).json()
    bob = client_reel.post("/api/detenteurs", json={"nom": "Bob", "type": "personne"}, headers=_en_tete(token_proprio)).json()
    token_invite = _creer_invite(client_reel, token_proprio, [alice["id"]])

    refuse = client_reel.get(f"/api/patrimoine/net?detenteur_id={bob['id']}", headers=_en_tete(token_invite))
    sans_parametre = client_reel.get("/api/patrimoine/net", headers=_en_tete(token_invite))
    autorise = client_reel.get(f"/api/patrimoine/net?detenteur_id={alice['id']}", headers=_en_tete(token_invite))

    assert refuse.status_code == 403
    assert sans_parametre.status_code == 403
    assert autorise.status_code == 200


def test_invite_refuse_sur_les_ecrans_hors_perimetre(client_reel):
    token_proprio = _fonder_foyer(client_reel)
    token_invite = _creer_invite(client_reel, token_proprio, [])

    assert client_reel.get("/api/analysis/2026", headers=_en_tete(token_invite)).status_code == 403
    assert client_reel.get("/api/performance", headers=_en_tete(token_invite)).status_code == 403


def test_invite_refuse_sur_exposition_consolidee(client_reel):
    """Backlog 2.P.1 : `/api/patrimoine/exposition-consolidee` reste hors du
    périmètre ouvert à l'invité (Patrimoine net/Portefeuille/Emprunts seulement)."""
    token_proprio = _fonder_foyer(client_reel)
    token_invite = _creer_invite(client_reel, token_proprio, [])

    assert client_reel.get("/api/patrimoine/exposition-consolidee", headers=_en_tete(token_invite)).status_code == 403


def test_proprietaire_et_membre_accedent_a_exposition_consolidee(client_reel):
    token_proprio = _fonder_foyer(client_reel)
    token_membre = _creer_membre(client_reel, token_proprio)

    assert client_reel.get("/api/patrimoine/exposition-consolidee", headers=_en_tete(token_proprio)).status_code == 200
    assert client_reel.get("/api/patrimoine/exposition-consolidee", headers=_en_tete(token_membre)).status_code == 200


def test_lien_de_partage_public_consultable_sans_aucun_jeton(client_reel):
    """Backlog 2.Q.1 : la consultation publique d'un lien de partage fonctionne
    RÉELLEMENT sans en-tête `Authorization` (pas seulement via l'override de test
    `get_current_user` des autres fichiers, qui ne prouverait rien ici puisque ce
    routeur ne dépend même pas de cette dépendance)."""
    token_proprio = _fonder_foyer(client_reel)
    token = client_reel.post("/api/partage", json={"nom": "Public"}, headers=_en_tete(token_proprio)).json()["token"]

    meta = client_reel.get(f"/api/partage-public/{token}/meta")
    consultation = client_reel.post(f"/api/partage-public/{token}", json={})

    assert meta.status_code == 200
    assert consultation.status_code == 200
