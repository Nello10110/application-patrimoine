"""Passe de robustesse transverse (recette complète du 02/09/2026, demande
utilisateur avant démonstration) : pour CHAQUE entité saisissable par
l'utilisateur, vérifie qu'une saisie incohérente est refusée proprement (400/422
avec un message exploitable) plutôt qu'acceptée silencieusement, qu'elle produise
une 500, ou qu'elle corrompe un agrégat.

Ce fichier ne double PAS les tests fonctionnels existants (un par domaine) : il
ne verrouille que le comportement en entrée dégradée — la moitié du travail que
fait réellement une application « de qualité professionnelle », et la plus facile
à laisser passer puisqu'aucun parcours nominal ne l'exerce.

Convention : 422 = refus par Pydantic (validation de schéma), 400 = refus par une
règle métier du routeur/service. Les deux sont acceptables ; ce qui ne l'est
jamais, c'est 200 sur une donnée absurde, ou 500.
"""

from datetime import datetime, timedelta

from .conftest import (
    ID_UTILISATEUR_B,
    ID_UTILISATEUR_TEST,
    NOM_UTILISATEUR_B,
    NOM_UTILISATEUR_TEST,
    basculer_utilisateur,
    make_holding,
)

# Statuts acceptables pour un refus de saisie — cf. docstring de module.
REFUS = {400, 422}


def _payload_holding(**overrides) -> dict:
    return {"ticker": "AAA", "quantite": 10.0, "prix_revient_moyen": 100.0, **overrides}


# ---------------------------------------------------------------------------
# Portefeuille — ajout/édition d'une ligne
# ---------------------------------------------------------------------------


def test_holding_quantite_negative_refusee(client):
    assert client.post("/api/portfolio/holdings", json=_payload_holding(quantite=-5)).status_code in REFUS


def test_holding_quantite_zero_refusee(client):
    assert client.post("/api/portfolio/holdings", json=_payload_holding(quantite=0)).status_code in REFUS


def test_holding_ticker_vide_refuse(client):
    assert client.post("/api/portfolio/holdings", json=_payload_holding(ticker="   ")).status_code in REFUS


def test_holding_prix_revient_negatif_refuse(client):
    assert client.post("/api/portfolio/holdings", json=_payload_holding(prix_revient_moyen=-10)).status_code in REFUS


def test_holding_valeur_estimee_negative_refusee(client):
    reponse = client.post("/api/portfolio/holdings", json=_payload_holding(type_actif="REAL_ESTATE", valeur_estimee=-1000))
    assert reponse.status_code in REFUS


def test_holding_versement_mensuel_negatif_refuse(client):
    reponse = client.post("/api/portfolio/holdings", json=_payload_holding(type_actif="LIFE_INSURANCE", versement_mensuel=-50))
    assert reponse.status_code in REFUS


def test_holding_date_acquisition_dans_le_futur_refusee(client):
    """Un bien ne peut pas avoir été acquis demain — sans ce garde-fou, le
    rendement annualisé et les graphiques d'historique partiraient d'une date
    future, produisant des pourcentages absurdes."""
    demain = (datetime.now() + timedelta(days=1)).date().isoformat()
    reponse = client.post("/api/portfolio/holdings", json=_payload_holding(type_actif="REAL_ESTATE", date_acquisition=demain))
    assert reponse.status_code in REFUS


def test_holding_edition_quantite_negative_refusee(client):
    cree = client.post("/api/portfolio/holdings", json=_payload_holding()).json()
    assert client.patch(f"/api/portfolio/holdings/{cree['id']}", json={"quantite": -1}).status_code in REFUS


def test_holding_inexistant_renvoie_404(client):
    assert client.patch("/api/portfolio/holdings/999999", json={"quantite": 5}).status_code == 404
    assert client.delete("/api/portfolio/holdings/999999").status_code == 404


def test_holding_avec_compte_id_dun_autre_foyer_refuse(client, db):
    """IDOR : rattacher sa ligne au compte de quelqu'un d'autre ne doit jamais
    réussir silencieusement."""
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    compte_b = client.post("/api/comptes", json={"nom": "PEA de B"}).json()
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    reponse = client.post("/api/portfolio/holdings", json=_payload_holding(compte_id=compte_b["id"]))
    assert reponse.status_code in REFUS | {404}


# ---------------------------------------------------------------------------
# Comptes et établissements
# ---------------------------------------------------------------------------


def test_compte_nom_vide_refuse(client):
    assert client.post("/api/comptes", json={"nom": "   "}).status_code in REFUS


def test_compte_nom_en_doublon_refuse(client):
    """`UniqueConstraint(user_id, nom)` : le doublon doit produire un refus
    exploitable, jamais une 500 d'intégrité SQL remontée brute."""
    client.post("/api/comptes", json={"nom": "PEA"})
    reponse = client.post("/api/comptes", json={"nom": "PEA"})
    assert reponse.status_code in REFUS


def test_etablissement_nom_en_doublon_refuse(client):
    client.post("/api/comptes/etablissements", json={"nom": "Boursorama"})
    reponse = client.post("/api/comptes/etablissements", json={"nom": "Boursorama"})
    assert reponse.status_code in REFUS


def test_renommer_un_compte_vers_un_nom_deja_pris_refuse(client):
    client.post("/api/comptes", json={"nom": "PEA"})
    autre = client.post("/api/comptes", json={"nom": "CTO"}).json()
    assert client.patch(f"/api/comptes/{autre['id']}", json={"nom": "PEA"}).status_code in REFUS


def test_compte_rattache_a_un_etablissement_inexistant_refuse(client):
    assert client.post("/api/comptes", json={"nom": "PEA", "etablissement_id": 999999}).status_code == 404


# ---------------------------------------------------------------------------
# Quotités (par ligne, par compte, par emprunt)
# ---------------------------------------------------------------------------


def test_quotite_negative_refusee(client, db):
    h = make_holding(db, ticker="AAA")
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    reponse = client.put(
        f"/api/portfolio/holdings/{h.ticker}/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": -10.0}]},
    )
    assert reponse.status_code in REFUS


def test_quotite_superieure_a_100_refusee(client, db):
    h = make_holding(db, ticker="AAA")
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    reponse = client.put(
        f"/api/portfolio/holdings/{h.ticker}/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 150.0}]},
    )
    assert reponse.status_code in REFUS


def test_quotites_avec_detenteur_inexistant_refusees(client, db):
    h = make_holding(db, ticker="AAA")
    reponse = client.put(
        f"/api/portfolio/holdings/{h.ticker}/quotites",
        json={"quotites": [{"detenteur_id": 999999, "quotite_pct": 100.0}]},
    )
    assert reponse.status_code in REFUS


def test_quotites_somme_superieure_a_100_refusee(client, db):
    h = make_holding(db, ticker="AAA")
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    bob = client.post("/api/detenteurs", json={"nom": "Bob", "type": "personne"}).json()
    reponse = client.put(
        f"/api/portfolio/holdings/{h.ticker}/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 70.0}, {"detenteur_id": bob["id"], "quotite_pct": 70.0}]},
    )
    assert reponse.status_code in REFUS


def test_quotites_compte_avec_detenteur_dun_autre_foyer_refusees(client, db):
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    detenteur_b = client.post("/api/detenteurs", json={"nom": "Intrus", "type": "personne"}).json()
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)

    compte = client.post("/api/comptes", json={"nom": "CTO"}).json()
    make_holding(db, ticker="AAA", compte_id=compte["id"])
    reponse = client.put(
        f"/api/comptes/{compte['id']}/quotites",
        json={"quotites": [{"detenteur_id": detenteur_b["id"], "quotite_pct": 100.0}]},
    )
    assert reponse.status_code in REFUS


# ---------------------------------------------------------------------------
# Emprunts
# ---------------------------------------------------------------------------


def _payload_loan(**overrides) -> dict:
    return {
        "libelle": "Prêt",
        "capital_initial": 200000.0,
        "taux_annuel_pct": 3.0,
        "mensualite": 1000.0,
        "date_debut": "2020-01-01T00:00:00",
        "duree_mois": 240,
        **overrides,
    }


def test_emprunt_capital_negatif_refuse(client):
    assert client.post("/api/loans", json=_payload_loan(capital_initial=-1000)).status_code in REFUS


def test_emprunt_mensualite_zero_refusee(client):
    """Une mensualité nulle ne rembourse jamais : l'amortissement théorique ne
    converge pas, le capital restant dû resterait figé au capital initial."""
    assert client.post("/api/loans", json=_payload_loan(mensualite=0)).status_code in REFUS


def test_emprunt_duree_zero_refusee(client):
    assert client.post("/api/loans", json=_payload_loan(duree_mois=0)).status_code in REFUS


def test_emprunt_taux_negatif_refuse(client):
    assert client.post("/api/loans", json=_payload_loan(taux_annuel_pct=-2)).status_code in REFUS


def test_emprunt_libelle_vide_refuse(client):
    assert client.post("/api/loans", json=_payload_loan(libelle="  ")).status_code in REFUS


def test_emprunt_rattache_a_un_holding_dun_autre_foyer_refuse(client, db):
    """IDOR sur le rattachement d'un emprunt à un actif."""
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)
    h_b = make_holding(db, ticker="BBB", user_id=ID_UTILISATEUR_B)

    cree = client.post("/api/loans", json=_payload_loan()).json()
    assert client.patch(f"/api/loans/{cree['id']}", json={"holding_id": h_b.id}).status_code in REFUS | {404}


def test_emprunt_inexistant_renvoie_404(client):
    assert client.patch("/api/loans/999999", json={"libelle": "X"}).status_code == 404
    assert client.delete("/api/loans/999999").status_code == 404


# ---------------------------------------------------------------------------
# Valorisation datée (écran Épargne / fiche immobilier)
# ---------------------------------------------------------------------------


def test_valorisation_negative_refusee(client, db):
    h = make_holding(db, ticker="LIVRETA", type_actif="REGULATED_SAVINGS")
    reponse = client.put(f"/api/portfolio/holdings/{h.ticker}/valorisation", json={"valeur": -100.0})
    assert reponse.status_code in REFUS


def test_valorisation_a_une_date_future_refusee(client, db):
    """Saisir « au 1er mars 2030 mon livret vaudra X » n'a pas de sens dans un
    historique de valorisation : ce sont des constats, jamais des projections."""
    h = make_holding(db, ticker="LIVRETA", type_actif="REGULATED_SAVINGS")
    demain = (datetime.now() + timedelta(days=1)).date().isoformat()
    reponse = client.put(f"/api/portfolio/holdings/{h.ticker}/valorisation", json={"valeur": 1000.0, "date": demain})
    assert reponse.status_code in REFUS


def test_valorisation_sur_un_ticker_inexistant_est_refusee(client):
    """400 plutôt que 404 ici (choix existant du routeur, message explicite) : ce
    qui compte est le refus propre, pas le code exact — cf. docstring de module."""
    assert client.put("/api/portfolio/holdings/INCONNU/valorisation", json={"valeur": 1000.0}).status_code in REFUS | {404}


# ---------------------------------------------------------------------------
# Objectifs
# ---------------------------------------------------------------------------


def _payload_objectif(**overrides) -> dict:
    echeance = (datetime.now() + timedelta(days=365)).date().isoformat()
    return {"nom": "Objectif", "type": "personnalise", "montant_cible": 10000.0, "echeance": echeance, **overrides}


def test_objectif_montant_cible_negatif_refuse(client):
    assert client.post("/api/objectifs/", json=_payload_objectif(montant_cible=-100)).status_code in REFUS


def test_objectif_nom_vide_refuse(client):
    assert client.post("/api/objectifs/", json=_payload_objectif(nom="   ")).status_code in REFUS


def test_objectif_echeance_illisible_refusee(client):
    """`echeance` est typée `str` côté schéma : une chaîne non-date doit être
    refusée à la saisie, jamais propagée jusqu'au calcul de trajectoire."""
    assert client.post("/api/objectifs/", json=_payload_objectif(echeance="pas-une-date")).status_code in REFUS


def test_objectif_echeance_passee_refusee(client):
    """Un objectif déjà échu ne peut produire aucune trajectoire exploitable
    (contribution mensuelle nécessaire = division par un nombre de mois nul ou
    négatif)."""
    hier = (datetime.now() - timedelta(days=1)).date().isoformat()
    assert client.post("/api/objectifs/", json=_payload_objectif(echeance=hier)).status_code in REFUS


def test_objectif_avec_holding_dun_autre_foyer_refuse(client, db):
    h_b = make_holding(db, ticker="BBB", user_id=ID_UTILISATEUR_B)
    reponse = client.post("/api/objectifs/", json=_payload_objectif(holding_ids=[h_b.id]))
    assert reponse.status_code in REFUS | {404}


# ---------------------------------------------------------------------------
# Salaire
# ---------------------------------------------------------------------------


def _payload_salaire(**overrides) -> dict:
    return {
        "annee": datetime.now().year,
        "nom": "Salaire",
        "montant": 45000.0,
        "type_montant": "brut",
        "periodicite": "annuel",
        "statut": "cadre",
        **overrides,
    }


def test_salaire_montant_negatif_refuse(client):
    assert client.post("/api/salaire/", json=_payload_salaire(montant=-1000)).status_code in REFUS


def test_salaire_annee_aberrante_refusee(client):
    assert client.post("/api/salaire/", json=_payload_salaire(annee=1200)).status_code in REFUS


def test_salaire_type_montant_invalide_refuse(client):
    assert client.post("/api/salaire/", json=_payload_salaire(type_montant="approximatif")).status_code in REFUS


def test_salaire_taux_imposition_superieur_a_100_refuse(client):
    assert client.post("/api/salaire/", json=_payload_salaire(taux_imposition_pct=150)).status_code in REFUS


# ---------------------------------------------------------------------------
# Détenteurs
# ---------------------------------------------------------------------------


def test_detenteur_nom_vide_refuse(client):
    assert client.post("/api/detenteurs", json={"nom": "  ", "type": "personne"}).status_code in REFUS


def test_detenteur_type_invalide_refuse(client):
    assert client.post("/api/detenteurs", json={"nom": "Alice", "type": "extraterrestre"}).status_code in REFUS


def test_detenteur_en_doublon_refuse(client):
    client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"})
    assert client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).status_code in REFUS


# ---------------------------------------------------------------------------
# Préférences
# ---------------------------------------------------------------------------


def test_preference_methode_cout_invalide_refusee(client):
    assert client.put("/api/settings/preferences", json={"methode_cout": "au_pif"}).status_code in REFUS


def test_preference_taux_imposition_negatif_refuse(client):
    assert client.put("/api/settings/preferences", json={"taux_imposition_pct": -5}).status_code in REFUS


# ---------------------------------------------------------------------------
# Import — fichiers vides ou illisibles
# ---------------------------------------------------------------------------


def test_import_transactions_fichier_vide_ne_plante_pas(client):
    """Un CSV vide est une erreur d'utilisateur banale (mauvais fichier
    sélectionné) : refus explicite attendu, jamais une 500."""
    reponse = client.post("/api/transactions/import", files={"file": ("vide.csv", b"", "text/csv")})
    assert reponse.status_code in REFUS


def test_import_transactions_binaire_ne_plante_pas(client):
    """Cas réel : l'utilisateur envoie un PDF/XLSX au lieu du CSV."""
    contenu = bytes([0x00, 0x01, 0x02, 0xFF, 0xFE]) * 100
    reponse = client.post("/api/transactions/import", files={"file": ("releve.pdf", contenu, "application/pdf")})
    assert reponse.status_code in REFUS


def test_import_positions_previsualisation_fichier_vide_ne_plante_pas(client):
    reponse = client.post("/api/portfolio/import/preview", files={"file": ("vide.csv", b"", "text/csv")})
    assert reponse.status_code in REFUS


def test_import_budget_previsualisation_fichier_vide_ne_plante_pas(client):
    reponse = client.post("/api/budget/import/csv/preview", files={"file": ("vide.csv", b"", "text/csv")})
    assert reponse.status_code in REFUS


def test_creer_deux_lignes_du_meme_ticker_est_refuse(client):
    """Revue du 03/09/2026 : rien n'empêchait deux lignes du même foyer de porter le
    même ticker, alors que plusieurs agrégations indexent par ticker
    (`compute_holding_returns`) — la seconde écrasait silencieusement les chiffres
    de la première à l'export CSV. Un refus explicite vaut mieux qu'un chiffre faux :
    pour renforcer une position, on modifie la ligne existante."""
    premiere = client.post("/api/portfolio/holdings", json={"ticker": "DOUBLON", "quantite": 1, "prix_revient_moyen": 100.0})
    assert premiere.status_code == 200

    seconde = client.post("/api/portfolio/holdings", json={"ticker": "DOUBLON", "quantite": 5, "prix_revient_moyen": 200.0})

    assert seconde.status_code == 400
    assert "existe déjà" in seconde.json()["detail"]
