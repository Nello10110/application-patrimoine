"""Verrouille le CRUD `GET`/`POST`/`PATCH`/`DELETE /api/loans` (Phase 1 de
`docs/ROADMAP.md`, patrimoine net) — validation des saisies, `capital_restant_du`
toujours calculé côté serveur, jamais fourni par le client."""

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, NOM_UTILISATEUR_TEST, basculer_utilisateur, make_holding


def _payload(**overrides) -> dict:
    defaults = dict(
        libelle="Crédit immobilier",
        capital_initial=200000.0,
        taux_annuel_pct=3.5,
        mensualite=1200.0,
        date_debut="2020-01-01T00:00:00",
        duree_mois=240,
    )
    defaults.update(overrides)
    return defaults


def test_creer_un_emprunt_renvoie_le_capital_restant_du_calcule(client):
    reponse = client.post("/api/loans", json=_payload())

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["libelle"] == "Crédit immobilier"
    assert corps["capital_restant_du"] < corps["capital_initial"]  # déjà quelques années d'amortissement


def test_lister_les_emprunts(client):
    client.post("/api/loans", json=_payload(libelle="Prêt A"))
    client.post("/api/loans", json=_payload(libelle="Prêt B"))

    reponse = client.get("/api/loans")

    assert reponse.status_code == 200
    libelles = {loan["libelle"] for loan in reponse.json()}
    assert libelles == {"Prêt A", "Prêt B"}


def test_recalage_manuel_du_capital_restant_du(client):
    cree = client.post("/api/loans", json=_payload()).json()

    reponse = client.patch(f"/api/loans/{cree['id']}", json={"capital_restant_du_manuel": 150000.0})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["capital_restant_du"] == 150000.0
    assert corps["derniere_maj_manuelle"] is not None


def test_modifier_un_autre_champ_ne_touche_pas_la_date_de_recalage(client):
    cree = client.post("/api/loans", json=_payload()).json()

    reponse = client.patch(f"/api/loans/{cree['id']}", json={"libelle": "Nouveau libellé"})

    assert reponse.status_code == 200
    assert reponse.json()["derniere_maj_manuelle"] is None


def test_supprimer_un_emprunt(client):
    cree = client.post("/api/loans", json=_payload()).json()

    reponse = client.delete(f"/api/loans/{cree['id']}")
    assert reponse.status_code == 200

    assert client.get("/api/loans").json() == []


def test_emprunt_introuvable_renvoie_404(client):
    assert client.patch("/api/loans/999", json={"libelle": "X"}).status_code == 404
    assert client.delete("/api/loans/999").status_code == 404


def test_capital_initial_negatif_ou_nul_refuse(client):
    assert client.post("/api/loans", json=_payload(capital_initial=0)).status_code == 400
    assert client.post("/api/loans", json=_payload(capital_initial=-100)).status_code == 400


def test_taux_negatif_refuse(client):
    assert client.post("/api/loans", json=_payload(taux_annuel_pct=-1)).status_code == 400


def test_libelle_vide_refuse(client):
    assert client.post("/api/loans", json=_payload(libelle="   ")).status_code == 400


def test_duree_nulle_refusee(client):
    assert client.post("/api/loans", json=_payload(duree_mois=0)).status_code == 400


# ---------------------------------------------------------------------------
# Rattachement à un actif (backlog 2.M.2)
# ---------------------------------------------------------------------------


def test_rattacher_un_emprunt_a_un_actif(client, db):
    h = make_holding(db, ticker="MAISON")
    cree = client.post("/api/loans", json=_payload()).json()

    reponse = client.patch(f"/api/loans/{cree['id']}", json={"holding_id": h.id})

    assert reponse.status_code == 200
    assert reponse.json()["holding_id"] == h.id


def test_derattacher_un_emprunt(client, db):
    h = make_holding(db, ticker="MAISON")
    cree = client.post("/api/loans", json=_payload()).json()
    client.patch(f"/api/loans/{cree['id']}", json={"holding_id": h.id})

    reponse = client.patch(f"/api/loans/{cree['id']}", json={"holding_id": None})

    assert reponse.status_code == 200
    assert reponse.json()["holding_id"] is None


def test_rattacher_un_emprunt_a_lactif_dun_autre_utilisateur_est_refuse(client, db):
    """IDOR (backlog 2.M.2) : impossible de rattacher son emprunt à l'actif d'un
    autre compte, même en devinant son id."""
    cree = client.post("/api/loans", json=_payload()).json()
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    h_autre_compte = make_holding(db, ticker="MAISON_B", user_id=ID_UTILISATEUR_B)
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    reponse = client.patch(f"/api/loans/{cree['id']}", json={"holding_id": h_autre_compte.id})

    assert reponse.status_code == 404
