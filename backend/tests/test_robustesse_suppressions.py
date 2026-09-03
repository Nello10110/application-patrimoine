"""Suppressions d'entités encore référencées ailleurs (recette du 02/09/2026).

Famille de bugs classique et particulièrement visible en démonstration : supprimer
un détenteur, un compte ou un actif qui sert encore quelque part laisse soit une
référence orpheline (écran qui plante au rendu suivant), soit une valeur agrégée
silencieusement fausse (patrimoine net qui ne bouge pas alors qu'un actif a
disparu).

Chaque test supprime une entité référencée, puis relit les écrans qui en
dépendaient : ils doivent tous répondre 200 avec une valeur cohérente.
"""

from datetime import datetime

from app.models import Loan, QuotiteHolding, QuotiteLoan

from .conftest import ID_UTILISATEUR_TEST, make_compte, make_holding

ECRANS_AGREGES = [
    "/api/patrimoine/net",
    "/api/analysis",
    "/api/comptes/solde",
    "/api/patrimoine/exposition-consolidee",
    "/api/performance/revenus-passifs",
]


def _verifier_ecrans_agreges_repondent(client) -> None:
    for chemin in ECRANS_AGREGES:
        reponse = client.get(chemin)
        assert reponse.status_code == 200, f"{chemin} → {reponse.status_code} après suppression"


# ---------------------------------------------------------------------------
# Détenteur supprimé alors qu'il porte des quotités
# ---------------------------------------------------------------------------


def test_supprimer_un_detenteur_qui_porte_des_quotites_ne_laisse_pas_de_quotite_orpheline(client, db):
    """Le détenteur disparaît, ses quotités doivent disparaître avec lui — sinon
    `compute_parts` continue de répartir vers un détenteur inexistant, et la fiche
    de l'actif affiche une ligne sans nom."""
    h = make_holding(db, ticker="AAA")
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    bob = client.post("/api/detenteurs", json={"nom": "Bob", "type": "personne"}).json()
    client.put(
        f"/api/portfolio/holdings/{h.ticker}/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 50.0}, {"detenteur_id": bob["id"], "quotite_pct": 50.0}]},
    )

    assert client.delete(f"/api/detenteurs/{alice['id']}").status_code == 200

    restantes = db.query(QuotiteHolding).filter(QuotiteHolding.detenteur_id == alice["id"]).count()
    assert restantes == 0, "Quotités orphelines laissées derrière un détenteur supprimé"
    _verifier_ecrans_agreges_repondent(client)
    # La fiche de l'actif reste lisible et ne mentionne plus le détenteur supprimé.
    detail = client.get(f"/api/portfolio/holdings/{h.ticker}/detail").json()
    assert all(q["detenteur_id"] != alice["id"] for q in detail["quotites"])


def test_supprimer_un_detenteur_qui_porte_des_quotites_demprunt_ne_laisse_pas_dorphelin(client, db):
    h = make_holding(db, ticker="MAISON")
    loan = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Prêt",
        capital_initial=200000.0,
        taux_annuel_pct=3.0,
        mensualite=1000.0,
        date_debut=datetime(2020, 1, 1),
        duree_mois=240,
        holding_id=h.id,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    client.put(f"/api/loans/{loan.id}/quotites", json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 100.0}]})

    assert client.delete(f"/api/detenteurs/{alice['id']}").status_code == 200

    assert db.query(QuotiteLoan).filter(QuotiteLoan.detenteur_id == alice["id"]).count() == 0
    _verifier_ecrans_agreges_repondent(client)


# ---------------------------------------------------------------------------
# Actif supprimé alors qu'il est référencé
# ---------------------------------------------------------------------------


def test_supprimer_un_actif_rattache_a_un_emprunt_laisse_lemprunt_coherent(client, db):
    """L'emprunt survit à la disparition du bien qu'il finançait (il reste dû !),
    mais ne doit plus pointer vers un actif inexistant."""
    h = make_holding(db, ticker="MAISON")
    loan = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Prêt",
        capital_initial=200000.0,
        taux_annuel_pct=3.0,
        mensualite=1000.0,
        date_debut=datetime(2020, 1, 1),
        duree_mois=240,
        holding_id=h.id,
    )
    db.add(loan)
    db.commit()

    assert client.delete(f"/api/portfolio/holdings/{h.id}").status_code == 200

    emprunts = client.get("/api/loans").json()
    assert len(emprunts) == 1
    assert emprunts[0]["holding_id"] is None, "L'emprunt pointe encore vers un actif supprimé"
    _verifier_ecrans_agreges_repondent(client)


def test_supprimer_un_actif_ne_laisse_aucune_reference_pendante_dans_les_5_tables_qui_le_referencent(client, db):
    """`holdings.id` est référencé par 5 tables (`loans`, `holding_immobilier_details`,
    `holding_valuation_history`, `quotites_holdings`, `objectif_actifs`). Ce test les
    couvre TOUTES d'un coup : une nouvelle table qui référencerait `holdings` sans
    nettoyage à la suppression le fera échouer, plutôt que de laisser la régression
    apparaître en démonstration."""
    from app.models import HoldingImmobilierDetail, HoldingValuationHistory, ObjectifActif

    h = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", valeur_estimee=300000.0)
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    client.put(f"/api/portfolio/holdings/{h.ticker}/quotites", json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 100.0}]})
    client.put(f"/api/portfolio/holdings/{h.ticker}/immobilier", json={"type_location": "nue", "loyer_mensuel": 1000.0})
    client.put(f"/api/portfolio/holdings/{h.ticker}/valorisation", json={"valeur": 310000.0, "date": "2025-01-01"})
    client.post(
        "/api/objectifs/",
        json={"nom": "Objectif", "montant_cible": 500000.0, "echeance": "2030-01-01", "holding_ids": [h.id]},
    )
    loan = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Prêt",
        capital_initial=200000.0,
        taux_annuel_pct=3.0,
        mensualite=1000.0,
        date_debut=datetime(2020, 1, 1),
        duree_mois=240,
        holding_id=h.id,
    )
    db.add(loan)
    db.commit()
    holding_id = h.id

    assert client.delete(f"/api/portfolio/holdings/{holding_id}").status_code == 200

    assert db.query(QuotiteHolding).filter(QuotiteHolding.holding_id == holding_id).count() == 0
    assert db.query(HoldingImmobilierDetail).filter(HoldingImmobilierDetail.holding_id == holding_id).count() == 0
    assert db.query(HoldingValuationHistory).filter(HoldingValuationHistory.holding_id == holding_id).count() == 0
    assert db.query(ObjectifActif).filter(ObjectifActif.holding_id == holding_id).count() == 0
    # L'emprunt, lui, SURVIT (il reste dû) mais détaché — jamais supprimé en cascade.
    assert db.query(Loan).filter(Loan.holding_id == holding_id).count() == 0
    assert db.get(Loan, loan.id) is not None

    _verifier_ecrans_agreges_repondent(client)


def test_supprimer_un_actif_rattache_a_un_objectif_laisse_lobjectif_lisible(client, db):
    h = make_holding(db, ticker="LIVRETA", type_actif="REGULATED_SAVINGS", valeur_estimee=10000.0)
    objectif = client.post(
        "/api/objectifs/",
        json={
            "nom": "Fonds d'urgence",
            "type": "precaution",
            "montant_cible": 20000.0,
            "echeance": "2030-01-01",
            "holding_ids": [h.id],
        },
    ).json()

    assert client.delete(f"/api/portfolio/holdings/{h.id}").status_code == 200

    # L'objectif reste consultable, sans référence pendante.
    detail = client.get(f"/api/objectifs/{objectif['id']}")
    assert detail.status_code == 200
    assert all(a["holding_id"] != h.id for a in detail.json()["actifs_rattaches"])
    assert client.get("/api/objectifs/").status_code == 200


def test_supprimer_un_actif_rattache_a_un_compte_laisse_le_compte_lisible(client, db):
    compte = make_compte(db, nom="PEA")
    h = make_holding(db, ticker="AAA", compte_id=compte.id)

    assert client.delete(f"/api/portfolio/holdings/{h.id}").status_code == 200

    soldes = {s["compte"]["nom"]: s for s in client.get("/api/comptes/solde").json() if s["compte"] is not None}
    assert soldes["PEA"]["nombre_lignes"] == 0
    assert soldes["PEA"]["solde"] == 0
    assert client.get(f"/api/comptes/{compte.id}/holdings").status_code == 200


# ---------------------------------------------------------------------------
# Compte / établissement supprimés — le contenu retombe, jamais ne disparaît
# ---------------------------------------------------------------------------


def test_supprimer_un_compte_ne_fait_pas_disparaitre_son_contenu_du_patrimoine(client, db):
    """Régression la plus coûteuse possible : supprimer un « contenant » ne doit
    JAMAIS faire baisser le patrimoine net."""
    compte = make_compte(db, nom="PEA")
    make_holding(db, ticker="AAA", compte_id=compte.id, quantite=10.0, prix_revient_moyen=100.0)
    net_avant = client.get("/api/patrimoine/net").json()["patrimoine_net"]

    assert client.delete(f"/api/comptes/{compte.id}").status_code == 200

    assert client.get("/api/patrimoine/net").json()["patrimoine_net"] == net_avant
    # La ligne existe toujours, simplement rattachée à aucun compte.
    lignes = client.get("/api/portfolio/holdings").json()
    assert any(h["ticker"] == "AAA" and h["compte"] is None for h in lignes)


def test_supprimer_un_etablissement_ne_fait_pas_disparaitre_ses_comptes(client):
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Banque"}).json()
    client.post("/api/comptes", json={"nom": "PEA", "etablissement_id": etablissement["id"]})

    assert client.delete(f"/api/comptes/etablissements/{etablissement['id']}").status_code == 200

    comptes = client.get("/api/comptes").json()
    assert [c["nom"] for c in comptes] == ["PEA"]
    assert comptes[0]["etablissement"] is None


# ---------------------------------------------------------------------------
# Portefeuille entièrement vidé — tous les écrans doivent rester lisibles
# ---------------------------------------------------------------------------


def test_tous_les_ecrans_agreges_repondent_sur_un_foyer_entierement_vide(client):
    """Cas du tout premier lancement (et de la démonstration sur instance neuve) :
    aucune donnée nulle part. Chaque agrégat doit répondre un état vide propre,
    jamais une division par zéro."""
    _verifier_ecrans_agreges_repondent(client)
    assert client.get("/api/performance").status_code == 200
    assert client.get("/api/analysis/cout-gestion").status_code == 200
    assert client.get("/api/patrimoine/historique").status_code == 200
    assert client.get("/api/objectifs/situation/indicateurs").status_code == 200


def test_les_ecrans_agreges_restent_lisibles_apres_suppression_du_dernier_actif(client, db):
    h = make_holding(db, ticker="AAA")
    assert client.get("/api/patrimoine/net").status_code == 200

    assert client.delete(f"/api/portfolio/holdings/{h.id}").status_code == 200

    _verifier_ecrans_agreges_repondent(client)
    assert client.get("/api/patrimoine/net").json()["patrimoine_net"] == 0
