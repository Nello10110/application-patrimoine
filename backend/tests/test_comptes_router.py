"""Verrouille `GET/POST/PATCH/DELETE /api/comptes` (établissements + comptes),
`GET /api/comptes/solde` (écran Comptes, backlog X.1) et les routes de gestion des
logos d'établissement (retour utilisateur du 05/09/2026). Aucun test ne touche le
réseau : `logo_service.recuperer_*` est remplacé quand il est sollicité."""

import socket

from app.services import logo_service

from .test_logo_service import png_factice

from .conftest import (
    ID_UTILISATEUR_B,
    ID_UTILISATEUR_TEST,
    NOM_UTILISATEUR_B,
    NOM_UTILISATEUR_TEST,
    basculer_utilisateur,
    make_compte,
    make_holding,
)

# ---------------------------------------------------------------------------
# Établissements
# ---------------------------------------------------------------------------


def test_creer_et_lister_les_etablissements(client):
    client.post("/api/comptes/etablissements", json={"nom": "Caisse d'Épargne"})
    client.post("/api/comptes/etablissements", json={"nom": "Boursorama"})

    reponse = client.get("/api/comptes/etablissements")

    assert reponse.status_code == 200
    noms = {e["nom"] for e in reponse.json()}
    assert noms == {"Caisse d'Épargne", "Boursorama"}


def test_etablissement_nom_vide_refuse(client):
    reponse = client.post("/api/comptes/etablissements", json={"nom": "   "})
    assert reponse.status_code == 400


def test_renommer_un_etablissement(client):
    cree = client.post("/api/comptes/etablissements", json={"nom": "Ancien nom"}).json()

    reponse = client.patch(f"/api/comptes/etablissements/{cree['id']}", json={"nom": "Nouveau nom"})

    assert reponse.status_code == 200
    assert reponse.json()["nom"] == "Nouveau nom"


def test_supprimer_un_etablissement(client):
    cree = client.post("/api/comptes/etablissements", json={"nom": "À supprimer"}).json()

    reponse = client.delete(f"/api/comptes/etablissements/{cree['id']}")

    assert reponse.status_code == 200
    assert client.get("/api/comptes/etablissements").json() == []


def test_etablissement_introuvable_renvoie_404(client):
    assert client.patch("/api/comptes/etablissements/999", json={"nom": "X"}).status_code == 404
    assert client.delete("/api/comptes/etablissements/999").status_code == 404


def test_acceder_a_letablissement_dun_autre_foyer_renvoie_404(client, db):
    """IDOR, même garde que `test_holding_quotites.py`."""
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    autre = client.post("/api/comptes/etablissements", json={"nom": "Établissement B"}).json()
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    assert client.patch(f"/api/comptes/etablissements/{autre['id']}", json={"nom": "X"}).status_code == 404
    assert client.delete(f"/api/comptes/etablissements/{autre['id']}").status_code == 404


# ---------------------------------------------------------------------------
# Logos d'établissement (retour utilisateur, 05/09/2026)
# ---------------------------------------------------------------------------


def test_televerser_un_logo_puis_le_recuperer_et_le_supprimer(client):
    """L'image n'est jamais renvoyée par les routes CRUD (`EtablissementOut` est
    imbriqué dans chaque `CompteOut`) : seulement le drapeau `a_un_logo`, l'image
    elle-même étant servie par la route dédiée."""
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Ma banque"}).json()
    assert etablissement["a_un_logo"] is False

    reponse = client.post(
        f"/api/comptes/etablissements/{etablissement['id']}/logo/fichier",
        files={"file": ("logo.png", png_factice(), "image/png")},
    )

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert corps["a_un_logo"] is True
    assert corps["logo_source"] == "upload"
    assert "logo_png" not in corps

    logos = client.get("/api/comptes/etablissements/logos").json()
    assert logos[str(etablissement["id"])].startswith("data:image/png;base64,")

    assert client.delete(f"/api/comptes/etablissements/{etablissement['id']}/logo").json()["a_un_logo"] is False
    assert client.get("/api/comptes/etablissements/logos").json() == {}


def test_televerser_un_fichier_qui_nest_pas_une_image_refuse_en_400(client):
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Ma banque"}).json()

    reponse = client.post(
        f"/api/comptes/etablissements/{etablissement['id']}/logo/fichier",
        files={"file": ("virus.png", b"ceci n'est pas une image", "image/png")},
    )

    assert reponse.status_code == 400


def test_logo_depuis_une_url_interne_refuse_en_400(client, monkeypatch):
    """SSRF : c'est le serveur qui télécharge l'URL saisie — une adresse qui résout
    vers le réseau local doit être refusée avant toute requête."""
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
    )
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Ma banque"}).json()

    reponse = client.put(
        f"/api/comptes/etablissements/{etablissement['id']}/logo/url",
        json={"url": "https://exemple-anodin.fr/logo.png"},
    )

    assert reponse.status_code == 400
    assert "réseau local" in reponse.json()["detail"]


def test_logo_depuis_une_url_publique_est_enregistre(client, monkeypatch):
    monkeypatch.setattr(logo_service, "recuperer_depuis_url", lambda url: png_factice())
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Ma banque"}).json()

    reponse = client.put(
        f"/api/comptes/etablissements/{etablissement['id']}/logo/url",
        json={"url": "https://exemple.fr/logo.png"},
    )

    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["logo_source"] == "url"


def test_logo_catalogue_refuse_pour_un_etablissement_personnalise(client):
    """Sans clé de catalogue (établissement saisi à la main), il n'y a pas de site
    officiel connu : le message doit orienter vers le téléversement ou l'URL."""
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Ma banque perso"}).json()

    reponse = client.post(f"/api/comptes/etablissements/{etablissement['id']}/logo/catalogue")

    assert reponse.status_code == 400
    assert "catalogue" in reponse.json()["detail"]


def test_logo_catalogue_recupere_le_site_officiel(client, monkeypatch):
    domaines_appeles: list[str] = []

    def _recuperer(domaine: str) -> bytes:
        domaines_appeles.append(domaine)
        return png_factice()

    monkeypatch.setattr(logo_service, "recuperer_pour_domaine", _recuperer)
    etablissement = client.post(
        "/api/comptes/etablissements", json={"nom": "Boursorama", "logo_key": "boursorama"}
    ).json()

    reponse = client.post(f"/api/comptes/etablissements/{etablissement['id']}/logo/catalogue")

    assert reponse.status_code == 200, reponse.text
    assert domaines_appeles == ["boursobank.com"]
    assert reponse.json()["logo_source"] == "catalogue"


def test_les_logos_dun_autre_foyer_ne_sont_ni_visibles_ni_modifiables(client, db):
    """IDOR, même garde que les routes CRUD ci-dessus."""
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    autre = client.post("/api/comptes/etablissements", json={"nom": "Établissement B"}).json()
    client.post(
        f"/api/comptes/etablissements/{autre['id']}/logo/fichier",
        files={"file": ("logo.png", png_factice(), "image/png")},
    )
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    assert client.get("/api/comptes/etablissements/logos").json() == {}
    assert client.post(f"/api/comptes/etablissements/{autre['id']}/logo/catalogue").status_code == 404
    assert client.delete(f"/api/comptes/etablissements/{autre['id']}/logo").status_code == 404


# ---------------------------------------------------------------------------
# Comptes
# ---------------------------------------------------------------------------


def test_creer_un_compte_rattache_a_un_etablissement(client):
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Caisse d'Épargne"}).json()

    reponse = client.post("/api/comptes", json={"nom": "Livret A", "etablissement_id": etablissement["id"]})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["nom"] == "Livret A"
    assert corps["etablissement"]["nom"] == "Caisse d'Épargne"


def test_creer_un_compte_sans_etablissement_refuse(client):
    """`CompteCreate.etablissement_id` obligatoire depuis le 03/09/2026 (demande
    directe de l'utilisateur : « il n'est pas possible d'avoir des comptes sans
    établissement ») — un compte existant peut rester sans établissement
    (`etablissement_id: int | None` sur `CompteOut`), mais la CRÉATION l'exige.
    `400`, pas `422` : `main.py::gestion_erreurs_validation` uniformise toute
    `RequestValidationError` (y compris un champ requis absent) en `400`."""
    reponse = client.post("/api/comptes", json={"nom": "PEA"})

    assert reponse.status_code == 400


def test_creer_un_compte_avec_un_etablissement_dun_autre_foyer_est_refuse(client, db):
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    etablissement_b = client.post("/api/comptes/etablissements", json={"nom": "Banque B"}).json()
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    reponse = client.post("/api/comptes", json={"nom": "PEA", "etablissement_id": etablissement_b["id"]})

    assert reponse.status_code == 404


def test_derattacher_un_compte_de_son_etablissement(client):
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Caisse d'Épargne"}).json()
    cree = client.post("/api/comptes", json={"nom": "Livret A", "etablissement_id": etablissement["id"]}).json()

    reponse = client.patch(f"/api/comptes/{cree['id']}", json={"etablissement_id": None})

    assert reponse.status_code == 200
    assert reponse.json()["etablissement"] is None


def test_supprimer_un_compte(client, db):
    cree = make_compte(db)

    reponse = client.delete(f"/api/comptes/{cree.id}")

    assert reponse.status_code == 200
    assert client.get("/api/comptes").json() == []


def test_compte_introuvable_renvoie_404(client):
    assert client.patch("/api/comptes/999", json={"nom": "X"}).status_code == 404
    assert client.delete("/api/comptes/999").status_code == 404


# ---------------------------------------------------------------------------
# Solde par compte
# ---------------------------------------------------------------------------


def test_solde_reflete_le_holding_rattache(client, db):
    compte = make_compte(db, nom="CTO")
    client.post("/api/portfolio/holdings", json={"ticker": "AAA", "quantite": 10, "prix_revient_moyen": 100.0, "compte_id": compte.id})

    reponse = client.get("/api/comptes/solde")

    assert reponse.status_code == 200
    lignes = {r["compte"]["nom"]: r for r in reponse.json() if r["compte"] is not None}
    assert lignes["CTO"]["solde"] == 1000.0
    assert lignes["CTO"]["nombre_lignes"] == 1


def test_solde_sur_portefeuille_vide(client):
    reponse = client.get("/api/comptes/solde")
    assert reponse.status_code == 200
    assert reponse.json() == []


# ---------------------------------------------------------------------------
# Détail des lignes d'un compte
# ---------------------------------------------------------------------------


def test_lister_les_holdings_dun_compte(client, db):
    compte = make_compte(db, nom="CTO")
    client.post("/api/portfolio/holdings", json={"ticker": "AAA", "quantite": 10, "prix_revient_moyen": 100.0, "compte_id": compte.id})
    make_holding(db, ticker="BBB", quantite=5, prix_revient_moyen=50.0, compte_id=None)  # sans compte

    reponse = client.get(f"/api/comptes/{compte.id}/holdings")

    assert reponse.status_code == 200
    tickers = {h["ticker"] for h in reponse.json()}
    assert tickers == {"AAA"}


def test_la_fiche_detaillee_dune_ligne_expose_son_compte(client, db):
    """`HoldingOut.compte`/`HoldingDetail.compte` (écran Comptes, backlog X.1) :
    la relation `Holding.compte` doit être visible depuis la fiche détaillée et
    depuis la liste du portefeuille, établissement rattaché inclus — pas seulement
    depuis les endpoints `/api/comptes/*` eux-mêmes."""
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Banque Test"}).json()
    compte = client.post("/api/comptes", json={"nom": "CTO", "etablissement_id": etablissement["id"]}).json()
    client.post("/api/portfolio/holdings", json={"ticker": "AAA", "quantite": 10, "prix_revient_moyen": 100.0, "compte_id": compte["id"]})
    make_holding(db, ticker="BBB", quantite=5, prix_revient_moyen=50.0, compte_id=None)  # sans compte

    detail_avec_compte = client.get("/api/portfolio/holdings/AAA/detail").json()
    detail_sans_compte = client.get("/api/portfolio/holdings/BBB/detail").json()

    assert detail_avec_compte["compte"]["nom"] == "CTO"
    assert detail_avec_compte["compte"]["etablissement"]["nom"] == "Banque Test"
    assert detail_sans_compte["compte"] is None

    lignes = {h["ticker"]: h["compte"] for h in client.get("/api/portfolio/holdings").json()}
    assert lignes["AAA"]["nom"] == "CTO"
    assert lignes["BBB"] is None


# ---------------------------------------------------------------------------
# Quotités par compte (backlog X.1) — applique la même répartition à chaque
# ligne rattachée, sans nouvelle table de quotités.
# ---------------------------------------------------------------------------


def test_repartir_un_compte_entre_deux_detenteurs(client, db):
    compte = make_compte(db, nom="CTO")
    make_holding(db, ticker="AAA", compte_id=compte.id)
    make_holding(db, ticker="BBB", compte_id=compte.id)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    bob = client.post("/api/detenteurs", json={"nom": "Bob", "type": "personne"}).json()

    reponse = client.put(
        f"/api/comptes/{compte.id}/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 50.0}, {"detenteur_id": bob["id"], "quotite_pct": 50.0}]},
    )

    assert reponse.status_code == 200
    detail_a = client.get("/api/portfolio/holdings/AAA/detail").json()
    detail_b = client.get("/api/portfolio/holdings/BBB/detail").json()
    assert {q["detenteur_nom"] for q in detail_a["quotites"]} == {"Alice", "Bob"}
    assert {q["detenteur_nom"] for q in detail_b["quotites"]} == {"Alice", "Bob"}


def test_quotites_compte_somme_non_100_refusee(client, db):
    # Un compte sans aucune ligne rattachée n'a rien sur quoi appliquer la
    # répartition (`set_quotites_compte` ne fait alors rien, ni erreur ni effet) —
    # la validation « somme = 100 % » ne peut s'observer que sur un compte peuplé.
    compte = make_compte(db, nom="CTO")
    make_holding(db, ticker="AAA", compte_id=compte.id)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()

    reponse = client.put(f"/api/comptes/{compte.id}/quotites", json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 60.0}]})

    assert reponse.status_code == 400


def test_quotites_dun_compte_introuvable_renvoie_404(client):
    reponse = client.put("/api/comptes/999/quotites", json={"quotites": []})
    assert reponse.status_code == 404
