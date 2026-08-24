"""Verrouille les routes `GET`/`PUT /api/settings/preferences` (LOT 5B) : valeurs
par défaut, écriture, validation, et déclenchement d'une reconstruction du
portefeuille quand la méthode de calcul du coût de revient change réellement."""

from datetime import datetime

from app.services.portfolio_reconstruction import rebuild_holdings

from .conftest import ID_UTILISATEUR_TEST, make_transaction


def test_get_preferences_renvoie_les_defauts(client):
    reponse = client.get("/api/settings/preferences")

    assert reponse.status_code == 200
    assert reponse.json() == {
        "methode_cout": "cout_moyen_pondere",
        "seuil_alerte_ecart_pct": 5.0,
        "taux_imposition_pct": None,
    }


def test_put_preferences_enregistre_puis_relecture_coherente(client):
    reponse = client.put("/api/settings/preferences", json={"methode_cout": "fifo", "seuil_alerte_ecart_pct": 12.0})

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["methode_cout"] == "fifo"
    assert corps["seuil_alerte_ecart_pct"] == 12.0

    relue = client.get("/api/settings/preferences").json()
    assert relue == {"methode_cout": "fifo", "seuil_alerte_ecart_pct": 12.0, "taux_imposition_pct": None}


def test_put_preferences_avec_taux_imposition_puis_relecture(client):
    reponse = client.put(
        "/api/settings/preferences", json={"methode_cout": "fifo", "seuil_alerte_ecart_pct": 12.0, "taux_imposition_pct": 30.0}
    )

    assert reponse.status_code == 200
    assert reponse.json()["taux_imposition_pct"] == 30.0
    assert client.get("/api/settings/preferences").json()["taux_imposition_pct"] == 30.0


def test_put_preferences_refuse_un_taux_imposition_hors_bornes(client):
    reponse = client.put(
        "/api/settings/preferences", json={"methode_cout": "fifo", "seuil_alerte_ecart_pct": 5.0, "taux_imposition_pct": 150.0}
    )
    assert reponse.status_code == 400


def test_put_preferences_refuse_une_methode_inconnue(client):
    reponse = client.put("/api/settings/preferences", json={"methode_cout": "lifo", "seuil_alerte_ecart_pct": 5.0})
    assert reponse.status_code == 400


def test_put_preferences_refuse_un_seuil_hors_bornes(client):
    reponse = client.put("/api/settings/preferences", json={"methode_cout": "fifo", "seuil_alerte_ecart_pct": 150.0})
    assert reponse.status_code == 400

    reponse = client.put("/api/settings/preferences", json={"methode_cout": "fifo", "seuil_alerte_ecart_pct": -1.0})
    assert reponse.status_code == 400


def test_put_preferences_sans_changement_de_methode_ne_reconstruit_pas(client, db):
    make_transaction(db, symbol="AAA", shares=10.0, amount=-1000.0)
    client.put("/api/settings/preferences", json={"methode_cout": "cout_moyen_pondere", "seuil_alerte_ecart_pct": 5.0})

    reponse = client.put("/api/settings/preferences", json={"methode_cout": "cout_moyen_pondere", "seuil_alerte_ecart_pct": 9.0})

    assert reponse.status_code == 200
    assert reponse.json()["positions_recalculees"] is None


def test_put_preferences_changement_de_methode_declenche_la_reconstruction(client, db):
    """Scénario chiffré de `test_portfolio_reconstruction.py` (section LOT 5.6) :
    3 achats de 10 titres à 100/200/300€, puis vente de 20 titres à 250€. Position
    d'abord reconstruite en coût moyen pondéré (prix de revient 200€), puis la
    méthode bascule en FIFO via l'API : la position doit être recalculée avec un
    prix de revient différent (300€, cf. calcul détaillé dans l'autre fichier)."""
    make_transaction(db, transaction_id="tx-1", symbol="AAA", shares=10.0, amount=-1000.0, datetime_utc=datetime(2024, 1, 1))
    make_transaction(db, transaction_id="tx-2", symbol="AAA", shares=10.0, amount=-2000.0, datetime_utc=datetime(2024, 2, 1))
    make_transaction(db, transaction_id="tx-3", symbol="AAA", shares=10.0, amount=-3000.0, datetime_utc=datetime(2024, 3, 1))
    make_transaction(
        db, transaction_id="tx-4", symbol="AAA", type="SELL", shares=-20.0, amount=5000.0, datetime_utc=datetime(2024, 4, 1)
    )

    rebuild_holdings(db, ID_UTILISATEUR_TEST)  # position initiale, méthode par défaut (coût moyen pondéré)
    avant = client.get("/api/portfolio/holdings").json()
    assert len(avant) == 1
    assert avant[0]["prix_revient_moyen"] == 200.0

    reponse = client.put("/api/settings/preferences", json={"methode_cout": "fifo", "seuil_alerte_ecart_pct": 5.0})

    assert reponse.status_code == 200
    assert reponse.json()["positions_recalculees"] == 1

    apres = client.get("/api/portfolio/holdings").json()
    assert len(apres) == 1
    assert apres[0]["prix_revient_moyen"] == 300.0
