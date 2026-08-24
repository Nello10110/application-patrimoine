"""Verrouille `routers/budget.py` : catégories, règles, import CSV/OFX/QIF,
mouvements, cibles, résumé — et l'isolation entre utilisateurs (IDOR)."""

from datetime import date, timedelta

from app.services import budget_categories_service

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, basculer_utilisateur


def test_list_categories_cree_l_arbre_par_defaut_au_premier_appel(client):
    reponse = client.get("/api/budget/categories")
    assert reponse.status_code == 200
    assert [c["nom"] for c in reponse.json()] == budget_categories_service.DEFAULT_CATEGORIES


def test_create_rename_delete_categorie(client):
    reponse = client.post("/api/budget/categories", json={"nom": "Vacances"})
    assert reponse.status_code == 200
    categorie_id = reponse.json()["id"]

    reponse = client.patch(f"/api/budget/categories/{categorie_id}", json={"nom": "Voyages"})
    assert reponse.status_code == 200
    assert reponse.json()["nom"] == "Voyages"

    reponse = client.delete(f"/api/budget/categories/{categorie_id}")
    assert reponse.status_code == 204


def test_regles_create_reappliquer_delete(client, db):
    categorie = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Transport", None)

    reponse = client.post("/api/budget/regles", json={"motif": "sncf", "categorie_id": categorie.id})
    assert reponse.status_code == 200
    regle_id = reponse.json()["id"]

    reponse = client.post("/api/budget/regles/reappliquer")
    assert reponse.status_code == 200
    assert "mouvements_modifies" in reponse.json()

    reponse = client.delete(f"/api/budget/regles/{regle_id}")
    assert reponse.status_code == 204


CSV_BANCAIRE = "Date;Libellé;Montant\n01/02/2026;Salaire;2000,00\n02/02/2026;Loyer;-800,00\n"


def test_import_csv_preview_puis_confirm(client):
    reponse = client.post(
        "/api/budget/import/csv/preview",
        files={"file": ("releve.csv", CSV_BANCAIRE.encode("utf-8"), "text/csv")},
    )
    assert reponse.status_code == 200
    aperçu = reponse.json()
    assert set(aperçu["columns"]) == {"Date", "Libellé", "Montant"}

    reponse = client.post(
        "/api/budget/import/csv/confirm",
        json={
            "file_token": aperçu["file_token"],
            "date_col": "Date",
            "libelle_col": "Libellé",
            "montant_col": "Montant",
        },
    )
    assert reponse.status_code == 200, reponse.text
    resultat = reponse.json()
    assert resultat["importees"] == 2
    assert resultat["doublons_ignores"] == 0


def test_import_csv_confirm_colonne_inconnue_renvoie_400(client):
    reponse = client.post(
        "/api/budget/import/csv/preview",
        files={"file": ("releve.csv", CSV_BANCAIRE.encode("utf-8"), "text/csv")},
    )
    file_token = reponse.json()["file_token"]

    reponse = client.post(
        "/api/budget/import/csv/confirm",
        json={"file_token": file_token, "date_col": "Date", "libelle_col": "Colonne inexistante", "montant_col": "Montant"},
    )
    assert reponse.status_code == 400


def test_import_ofx(client):
    contenu = (
        b"<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>"
        b"<STMTTRN><DTPOSTED>20260201<TRNAMT>-42.50<FITID>OFX-1<NAME>ACHAT</STMTTRN>"
        b"</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"
    )
    reponse = client.post("/api/budget/import/ofx", files={"file": ("releve.ofx", contenu, "application/x-ofx")})
    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["importees"] == 1


def test_import_qif(client):
    contenu = b"!Type:Bank\nD02/01/2026\nT-42.50\nPACHAT\n^\n"
    reponse = client.post("/api/budget/import/qif", files={"file": ("releve.qif", contenu, "text/plain")})
    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["importees"] == 1


def test_mouvements_list_et_categoriser(client, db):
    categorie = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Santé", None)
    client.post("/api/budget/import/qif", files={"file": ("r.qif", b"D01/02/2026\nT-10.00\nPPharmacie\n^\n", "text/plain")})

    reponse = client.get("/api/budget/mouvements")
    assert reponse.status_code == 200
    mouvement_id = reponse.json()[0]["id"]

    reponse = client.patch(f"/api/budget/mouvements/{mouvement_id}", json={"categorie_id": categorie.id})
    assert reponse.status_code == 200
    assert reponse.json()["categorie_id"] == categorie.id
    assert reponse.json()["categorise_manuellement"] is True


def test_cibles_set_list_delete(client, db):
    categorie = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Loisirs", None)

    reponse = client.put(f"/api/budget/cibles/{categorie.id}", json={"montant_mensuel": 100.0})
    assert reponse.status_code == 200
    assert reponse.json()["montant_mensuel"] == 100.0

    reponse = client.get("/api/budget/cibles")
    assert len(reponse.json()) == 1

    reponse = client.delete(f"/api/budget/cibles/{categorie.id}")
    assert reponse.status_code == 204


def test_summary_indicateurs(client):
    # QIF vient de Quicken (US) : "MM/DD/YYYY" — 1er et 2 février, pas janvier.
    client.post(
        "/api/budget/import/qif",
        files={"file": ("r.qif", b"D02/01/2026\nT2000.00\nPSalaire\n^\nD02/02/2026\nT-800.00\nPLoyer\n^\n", "text/plain")},
    )
    reponse = client.get("/api/budget/summary", params={"date_debut": "2026-02-01", "date_fin": "2026-02-28"})
    assert reponse.status_code == 200
    body = reponse.json()
    assert body["entrees"] == 2000.0
    assert body["sorties"] == 800.0
    assert body["disponible"] == 1200.0


def test_isolation_entre_utilisateurs(client, db):
    """Un second foyer ne doit voir ni les catégories, ni les mouvements, ni les
    règles, ni les cibles créées par le premier — même pattern que
    `tests/test_isolation_utilisateurs.py`."""
    categorie = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Perso", None)
    client.post("/api/budget/import/qif", files={"file": ("r.qif", b"D01/02/2026\nT-10.00\nPAchat\n^\n", "text/plain")})

    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    # Un nouveau foyer démarre avec son propre arbre par défaut, pas celui de A.
    reponse = client.get("/api/budget/categories")
    noms = [c["nom"] for c in reponse.json()]
    assert "Perso" not in noms

    reponse = client.get("/api/budget/mouvements")
    assert reponse.json() == []

    # IDOR : renommer/supprimer la catégorie de A depuis B échoue en 404.
    reponse = client.patch(f"/api/budget/categories/{categorie.id}", json={"nom": "Volé"})
    assert reponse.status_code == 404


def test_recurrences(client):
    # Dates relatives à aujourd'hui (pas de paramètre `aujourdhui` exposé par
    # l'API, à dessein — jamais une fausse date acceptée du client) : un mois pile
    # et deux mois pile en arrière, pour tomber dans la fenêtre de récence réelle.
    aujourdhui = date.today()
    il_y_a_1_mois = aujourdhui - timedelta(days=30)
    il_y_a_2_mois = aujourdhui - timedelta(days=60)
    qif = (
        f"D{il_y_a_2_mois.month:02d}/{il_y_a_2_mois.day:02d}/{il_y_a_2_mois.year}\nT-12.99\nPNetflix\n^\n"
        f"D{il_y_a_1_mois.month:02d}/{il_y_a_1_mois.day:02d}/{il_y_a_1_mois.year}\nT-12.99\nPNetflix\n^\n"
    ).encode("utf-8")
    client.post("/api/budget/import/qif", files={"file": ("r.qif", qif, "text/plain")})
    reponse = client.get("/api/budget/recurrences")
    assert reponse.status_code == 200
    body = reponse.json()
    assert len(body) == 1
    assert body[0]["libelle"] == "Netflix"
    assert body[0]["occurrences"] == 2


def test_jonction_patrimoine(client, db):
    epargne = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Épargne", None)
    client.post(
        "/api/budget/import/qif",
        files={"file": ("r.qif", b"D01/02/2026\nT2000.00\nPSalaire\n^\n", "text/plain")},
    )
    mouvement_id = client.get("/api/budget/mouvements").json()[0]["id"]
    client.patch(f"/api/budget/mouvements/{mouvement_id}", json={"categorie_id": epargne.id})

    reponse = client.get("/api/budget/jonction-patrimoine", params={"date_debut": "2026-02-01", "date_fin": "2026-02-28"})
    assert reponse.status_code == 200
    body = reponse.json()
    assert "taux_epargne_reel_pct" in body
    assert "reste_a_vivre" in body
    assert "versement_mensuel_suggere" in body
