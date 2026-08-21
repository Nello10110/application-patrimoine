"""Verrouille `GET /api/patrimoine/net` (roadmap Phase 1, `docs/ROADMAP.md`).

`/simulation` et `/fire` (roadmap Phase 2) ont été retirés lors de la fusion des
pages Simulateur et Outils côté frontend : la projection, le tableau de détail et
le calcul FIRE sont désormais calculés côté client
(`frontend/src/utils/interetsComposes.ts`, verrouillé par
`interetsComposes.test.ts`), à partir du seul `patrimoine_net` renvoyé ici."""

from datetime import datetime

from app.models import Loan

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, basculer_utilisateur, make_holding


def test_patrimoine_net_vide(client):
    reponse = client.get("/api/patrimoine/net")

    assert reponse.status_code == 200
    assert reponse.json() == {
        "actifs_totaux": 0,
        "passifs_totaux": 0,
        "patrimoine_net": 0,
        "patrimoine_financier": 0,
        "repartition_par_classe": [],
    }


def test_patrimoine_net_actifs_moins_passifs(client, db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
            capital_initial=200000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            capital_restant_du_manuel=120000.0,
        )
    )
    db.commit()

    reponse = client.get("/api/patrimoine/net")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["actifs_totaux"] == 300000.0
    assert corps["passifs_totaux"] == 120000.0
    assert corps["patrimoine_net"] == 180000.0
    assert corps["repartition_par_classe"] == [{"categorie": "Immobilier", "valeur": 300000.0}]


def test_detenteur_id_dun_autre_utilisateur_renvoie_404(client, db):
    """IDOR (backlog 2.L.1) : impossible de lire le patrimoine filtré sur le
    détenteur d'un autre compte, même en devinant son id."""
    id_detenteur_a = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()["id"]
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get(f"/api/patrimoine/net?detenteur_id={id_detenteur_a}")

    assert reponse.status_code == 404
