"""Correction/suppression d'un point de l'historique de valorisation (backlog
quickwin § T.3, retour utilisateur 30/08/2026, capture à l'appui) —
`PATCH`/`DELETE /holdings/{ticker}/immobilier-history/{point_id}`. Jusqu'ici,
`enregistrer_point_historique` n'ajoutait qu'en aveugle : une valeur tapée par
erreur (ex. 0 €) restait figée pour toujours, sans aucun moyen de la corriger."""

from app.services import historique_cache

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, NOM_UTILISATEUR_TEST, basculer_utilisateur, make_holding


def _point_id(client, ticker: str, date: str) -> int:
    historique = client.get(f"/api/portfolio/holdings/{ticker}/immobilier-history").json()
    return next(p["id"] for p in historique if p["date_valeur"].startswith(date))


def test_modifier_un_point_qui_nest_pas_le_plus_recent_ne_touche_pas_la_valeur_courante(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 200.0, "date": "2026-02-01"})
    point_id = _point_id(client, "AV1", "2026-01-01")

    reponse = client.patch(f"/api/portfolio/holdings/AV1/immobilier-history/{point_id}", json={"valeur": 150.0, "date": "2026-01-01"})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] == 200.0  # inchangée, le point de février reste le plus récent
    historique = client.get("/api/portfolio/holdings/AV1/immobilier-history").json()
    valeurs = sorted(p["valeur"] for p in historique)
    assert valeurs == [150.0, 200.0]


def test_modifier_le_point_le_plus_recent_met_a_jour_la_valeur_courante(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 0.0, "date": "2026-02-01"})
    point_id = _point_id(client, "AV1", "2026-02-01")

    reponse = client.patch(f"/api/portfolio/holdings/AV1/immobilier-history/{point_id}", json={"valeur": 250.0, "date": "2026-02-01"})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] == 250.0
    assert corps["date_valeur_estimee"].startswith("2026-02-01")


def test_avancer_la_date_dun_point_le_rend_le_plus_recent(client, db):
    """La resynchronisation recalcule TOUJOURS le point le plus récent restant —
    contrairement à `PUT .../valorisation`, qui ne resynchronise que si le nouveau
    point est déjà le plus récent (un rattrapage antidaté ne devant jamais écraser
    une valeur plus récente). Ici, modifier la DATE d'un point peut changer lequel
    est le plus récent dans n'importe quel sens."""
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 200.0, "date": "2026-02-01"})
    point_id = _point_id(client, "AV1", "2026-01-01")

    reponse = client.patch(f"/api/portfolio/holdings/AV1/immobilier-history/{point_id}", json={"valeur": 300.0, "date": "2026-03-01"})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] == 300.0
    assert corps["date_valeur_estimee"].startswith("2026-03-01")


def test_supprimer_un_point_qui_nest_pas_le_plus_recent_ne_touche_pas_la_valeur_courante(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 200.0, "date": "2026-02-01"})
    point_id = _point_id(client, "AV1", "2026-01-01")

    reponse = client.delete(f"/api/portfolio/holdings/AV1/immobilier-history/{point_id}")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] == 200.0
    historique = client.get("/api/portfolio/holdings/AV1/immobilier-history").json()
    assert len(historique) == 1


def test_supprimer_le_point_le_plus_recent_resynchronise_sur_le_precedent(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 0.0, "date": "2026-02-01"})
    point_id = _point_id(client, "AV1", "2026-02-01")

    reponse = client.delete(f"/api/portfolio/holdings/AV1/immobilier-history/{point_id}")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] == 100.0
    assert corps["date_valeur_estimee"].startswith("2026-01-01")


def test_supprimer_le_dernier_point_restant_vide_la_valeur_courante(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    point_id = _point_id(client, "AV1", "2026-01-01")

    reponse = client.delete(f"/api/portfolio/holdings/AV1/immobilier-history/{point_id}")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["valeur_estimee"] is None
    assert corps["date_valeur_estimee"] is None
    assert client.get("/api/portfolio/holdings/AV1/immobilier-history").json() == []


def test_point_id_inexistant_renvoie_404(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")

    assert client.patch("/api/portfolio/holdings/AV1/immobilier-history/999999", json={"valeur": 1.0, "date": "2026-01-01"}).status_code == 404
    assert client.delete("/api/portfolio/holdings/AV1/immobilier-history/999999").status_code == 404


def test_point_dun_autre_foyer_est_refuse(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    point_id = _point_id(client, "AV1", "2026-01-01")

    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    make_holding(db, ticker="AV_B", user_id=ID_UTILISATEUR_B, type_actif="LIFE_INSURANCE")

    reponse_patch = client.patch(f"/api/portfolio/holdings/AV_B/immobilier-history/{point_id}", json={"valeur": 1.0, "date": "2026-01-01"})
    reponse_delete = client.delete(f"/api/portfolio/holdings/AV_B/immobilier-history/{point_id}")

    assert reponse_patch.status_code == 404
    assert reponse_delete.status_code == 404

    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)
    historique = client.get("/api/portfolio/holdings/AV1/immobilier-history").json()
    assert len(historique) == 1 and historique[0]["valeur"] == 100.0  # point du foyer A intact


def test_valeur_negative_est_rejetee_a_la_modification(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    point_id = _point_id(client, "AV1", "2026-01-01")

    reponse = client.patch(f"/api/portfolio/holdings/AV1/immobilier-history/{point_id}", json={"valeur": -1.0, "date": "2026-01-01"})

    assert reponse.status_code == 400


def test_modifier_un_point_invalide_le_cache_du_patrimoine(client, db):
    make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE")
    client.put("/api/portfolio/holdings/AV1/valorisation", json={"valeur": 100.0, "date": "2026-01-01"})
    point_id = _point_id(client, "AV1", "2026-01-01")
    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    historique_cache.ecrire(db, cle, [{"date": "2024-01-01"}])

    client.patch(f"/api/portfolio/holdings/AV1/immobilier-history/{point_id}", json={"valeur": 150.0, "date": "2026-01-01"})

    assert historique_cache.lire(db, cle) is None
