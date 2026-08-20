"""Verrouille l'isolation des données entre utilisateurs (Milestone 2a, multi-
utilisateur — cf. `docs/BACKLOG.md` § 2.I.1) : pour chaque endroit scopé par
`user_id`, crée une ligne pour l'utilisateur A (compte de test par défaut, cf.
`client`), bascule sur l'utilisateur B (`basculer_utilisateur`, second compte
partageant la même base jetable) et vérifie que B ne voit, ne peut modifier, ni
supprimer aucune donnée de A. C'est le verrou central de ce milestone : une
requête oubliée y apparaîtrait comme un test qui échoue, pas comme une fuite
découverte en production."""

from datetime import datetime

from app.models import AllocationTarget, Holding, Loan

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B, basculer_utilisateur, make_holding, make_transaction

EN_TETE_TRANSACTIONS = (
    "transaction_id,datetime,date,category,type,asset_class,symbol,name,shares,price,amount,fee,tax,description,mcc_code"
)


def _csv_transaction(transaction_id: str, symbol: str = "US0378331005") -> bytes:
    ligne = (
        f"{transaction_id},2024-01-15T10:30:00.000Z,2024-01-15,TRADING,BUY,STOCK,{symbol},Apple Inc,"
        "10,150.5,-1505.00,1.00,0.00,Achat,"
    )
    return "\n".join([EN_TETE_TRANSACTIONS, ligne]).encode("utf-8")


# ---------------------------------------------------------------------------
# Portefeuille : liste, fiche détail, update/delete (IDOR)
# ---------------------------------------------------------------------------


def test_liste_holdings_ne_montre_pas_les_lignes_dun_autre_utilisateur(client, db):
    make_holding(db, ticker="AAA", user_id=ID_UTILISATEUR_TEST)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get("/api/portfolio/holdings")

    assert reponse.status_code == 200
    assert reponse.json() == []


def test_fiche_detail_dun_ticker_dun_autre_utilisateur_renvoie_404(client, db):
    make_holding(db, ticker="AAA", user_id=ID_UTILISATEUR_TEST)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get("/api/portfolio/holdings/AAA/detail")

    assert reponse.status_code == 404


def test_meme_ticker_chez_deux_utilisateurs_reste_deux_lignes_distinctes(client, db):
    """Deux utilisateurs peuvent détenir le même titre sans jamais se mélanger —
    verrou explicite du risque de collision par ticker relevé pendant l'audit."""
    make_holding(db, ticker="AAA", user_id=ID_UTILISATEUR_TEST, quantite=10.0)
    make_holding(db, ticker="AAA", user_id=ID_UTILISATEUR_B, quantite=99.0)

    reponse_a = client.get("/api/portfolio/holdings")
    assert [h["quantite"] for h in reponse_a.json()] == [10.0]

    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    reponse_b = client.get("/api/portfolio/holdings")
    assert [h["quantite"] for h in reponse_b.json()] == [99.0]


def test_update_holding_dun_autre_utilisateur_renvoie_404_sans_le_modifier(client, db):
    ligne = make_holding(db, ticker="AAA", user_id=ID_UTILISATEUR_TEST, quantite=10.0)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.patch(f"/api/portfolio/holdings/{ligne.id}", json={"quantite": 999.0})

    assert reponse.status_code == 404
    db.refresh(ligne)
    assert ligne.quantite == 10.0


def test_delete_holding_dun_autre_utilisateur_renvoie_404_sans_le_supprimer(client, db):
    ligne = make_holding(db, ticker="AAA", user_id=ID_UTILISATEUR_TEST)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.delete(f"/api/portfolio/holdings/{ligne.id}")

    assert reponse.status_code == 404
    assert db.get(Holding, ligne.id) is not None


# ---------------------------------------------------------------------------
# Emprunts (même patron que Holding : liste + IDOR)
# ---------------------------------------------------------------------------


def test_liste_emprunts_ne_montre_pas_ceux_dun_autre_utilisateur(client, db):
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit A",
            capital_initial=10000.0,
            taux_annuel_pct=1.0,
            mensualite=100.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=100,
        )
    )
    db.commit()
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get("/api/loans")

    assert reponse.status_code == 200
    assert reponse.json() == []


def test_delete_emprunt_dun_autre_utilisateur_renvoie_404(client, db):
    emprunt = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Crédit A",
        capital_initial=10000.0,
        taux_annuel_pct=1.0,
        mensualite=100.0,
        date_debut=datetime(2020, 1, 1),
        duree_mois=100,
    )
    db.add(emprunt)
    db.commit()
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.delete(f"/api/loans/{emprunt.id}")

    assert reponse.status_code == 404
    assert db.get(Loan, emprunt.id) is not None


# ---------------------------------------------------------------------------
# Objectifs (Répartition)
# ---------------------------------------------------------------------------


def test_objectifs_dun_utilisateur_invisibles_pour_un_autre(client, db):
    db.add(AllocationTarget(user_id=ID_UTILISATEUR_TEST, annee=2026, type="geo", categorie="Europe", pourcentage_cible=50.0))
    db.commit()
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get("/api/targets/2026")

    assert reponse.status_code == 200
    assert reponse.json() == []


def test_sauvegarder_ses_objectifs_necrase_pas_ceux_dun_autre_utilisateur(client, db):
    client.put(
        "/api/targets/2026",
        json={"annee": 2026, "geo": [{"categorie": "Europe", "pourcentage_cible": 100.0}], "sector": []},
    )
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    client.put(
        "/api/targets/2026",
        json={"annee": 2026, "geo": [{"categorie": "Amérique du Nord", "pourcentage_cible": 100.0}], "sector": []},
    )

    lignes_a = db.query(AllocationTarget).filter(AllocationTarget.user_id == ID_UTILISATEUR_TEST).all()
    assert [l.categorie for l in lignes_a] == ["Europe"]
    lignes_b = db.query(AllocationTarget).filter(AllocationTarget.user_id == ID_UTILISATEUR_B).all()
    assert [l.categorie for l in lignes_b] == ["Amérique du Nord"]


# ---------------------------------------------------------------------------
# Export CSV
# ---------------------------------------------------------------------------


def test_export_positions_omet_les_lignes_dun_autre_utilisateur(client, db):
    make_holding(db, ticker="SECRET", user_id=ID_UTILISATEUR_TEST)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get("/api/export/positions")

    assert reponse.status_code == 200
    assert "SECRET" not in reponse.content.decode("utf-8-sig")


# ---------------------------------------------------------------------------
# Import de transactions : le dédoublonnage ne doit jamais traverser les comptes
# ---------------------------------------------------------------------------


def test_meme_transaction_id_importe_par_deux_utilisateurs_nest_jamais_un_doublon(client, db):
    """Deux comptes courtier différents peuvent, par coïncidence, produire le même
    `transaction_id` — sans ce test, un import ultérieur de l'un pourrait être
    silencieusement ignoré parce que l'AUTRE utilisateur a déjà ce même identifiant."""
    reponse_a = client.post(
        "/api/transactions/import", files={"file": ("grand_livre.csv", _csv_transaction("tx-collision"), "text/csv")}
    )
    assert reponse_a.status_code == 200
    assert reponse_a.json()["importees"] == 1
    assert reponse_a.json()["doublons_ignores"] == 0

    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    reponse_b = client.post(
        "/api/transactions/import", files={"file": ("grand_livre.csv", _csv_transaction("tx-collision"), "text/csv")}
    )

    assert reponse_b.status_code == 200
    assert reponse_b.json()["importees"] == 1  # PAS un doublon, malgré le même transaction_id
    assert reponse_b.json()["doublons_ignores"] == 0


def test_reimporter_le_meme_transaction_id_pour_le_meme_utilisateur_reste_un_doublon(client):
    """Non-régression : le dédoublonnage doit toujours fonctionner À L'INTÉRIEUR d'un
    même compte, seul le comportement INTER-comptes a changé."""
    client.post("/api/transactions/import", files={"file": ("grand_livre.csv", _csv_transaction("tx-x"), "text/csv")})

    reponse = client.post("/api/transactions/import", files={"file": ("grand_livre.csv", _csv_transaction("tx-x"), "text/csv")})

    assert reponse.json()["importees"] == 0
    assert reponse.json()["doublons_ignores"] == 1


def test_reconstruction_dun_utilisateur_ne_touche_pas_le_portefeuille_dun_autre(client, db):
    """Le grand livre de B ne doit jamais entrer dans la reconstruction du
    portefeuille de A (`portfolio_reconstruction.compute_positions`)."""
    make_transaction(db, symbol="AAA", user_id=ID_UTILISATEUR_TEST, shares=10.0, amount=-1000.0, transaction_id="tx-a")
    make_transaction(db, symbol="AAA", user_id=ID_UTILISATEUR_B, shares=999.0, amount=-999000.0, transaction_id="tx-b")

    reponse = client.post("/api/transactions/reconstruct")

    assert reponse.status_code == 200
    ligne_a = db.query(Holding).filter(Holding.user_id == ID_UTILISATEUR_TEST, Holding.ticker == "AAA").one()
    assert ligne_a.quantite == 10.0  # jamais mélangé avec les 999 titres de B


# ---------------------------------------------------------------------------
# Patrimoine net et rentabilité
# ---------------------------------------------------------------------------


def test_patrimoine_net_ne_compte_pas_les_actifs_dun_autre_utilisateur(client, db):
    make_holding(db, ticker="MAISON", user_id=ID_UTILISATEUR_TEST, type_actif="REAL_ESTATE", valeur_estimee=250000.0, quantite=1)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get("/api/patrimoine/net")

    assert reponse.status_code == 200
    assert reponse.json()["actifs_totaux"] == 0


def test_performance_dun_utilisateur_ignore_les_transactions_dun_autre(client, db):
    make_transaction(db, symbol="AAA", user_id=ID_UTILISATEUR_TEST, shares=10.0, amount=-1000.0)
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)

    reponse = client.get("/api/performance")

    assert reponse.status_code == 200
    assert reponse.json()["nombre_transactions"] == 0
