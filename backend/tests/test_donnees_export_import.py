"""Export/import de toutes les données du foyer (backlog X.6).

Le test central est l'ALLER-RETOUR : exporter, tout effacer, réimporter, et
retrouver exactement le même patrimoine — y compris les relations, qui sont la
partie fragile (les identifiants du fichier viennent d'une autre base et doivent
être réécrits, sans quoi un compte pointerait vers l'établissement de quelqu'un
d'autre, ou vers rien).
"""

import json
from datetime import datetime

import pytest

from app.models import Compte, Detenteur, Etablissement, Holding, LienPartage, Loan, Objectif, PerimetreInvite, QuotiteHolding, Salaire, User
from app.services import donnees_service

from .conftest import (
    ID_UTILISATEUR_B,
    ID_UTILISATEUR_TEST,
    NOM_UTILISATEUR_B,
    NOM_UTILISATEUR_TEST,
    basculer_utilisateur,
    make_holding,
    make_transaction,
)


def _peupler_foyer(client, db) -> dict:
    """Un foyer représentatif : au moins une ligne dans chaque famille de données,
    et surtout des RELATIONS croisées (compte→établissement, ligne→compte,
    quotité→ligne+détenteur, emprunt→ligne, objectif→ligne+détenteur)."""
    etablissement = client.post("/api/comptes/etablissements", json={"nom": "Banque Test"}).json()
    compte = client.post("/api/comptes", json={"nom": "PEA", "etablissement_id": etablissement["id"]}).json()
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    bob = client.post("/api/detenteurs", json={"nom": "Bob", "type": "societe"}).json()

    action = client.post(
        "/api/portfolio/holdings",
        json={"ticker": "AAA", "quantite": 10.0, "prix_revient_moyen": 100.0, "type_actif": "STOCK", "compte_id": compte["id"]},
    ).json()
    maison = client.post(
        "/api/portfolio/holdings",
        json={
            "ticker": "MAISON",
            "quantite": 1.0,
            "prix_revient_moyen": 280000.0,
            "type_actif": "REAL_ESTATE",
            "valeur_estimee": 300000.0,
            "date_acquisition": "2021-06-15",
        },
    ).json()
    client.put(f"/api/portfolio/holdings/{maison['ticker']}/immobilier", json={"type_location": "nue", "loyer_mensuel": 1200.0})
    client.put(f"/api/portfolio/holdings/{maison['ticker']}/valorisation", json={"valeur": 310000.0, "date": "2025-01-15"})
    client.put(
        f"/api/portfolio/holdings/{action['ticker']}/quotites",
        json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 60.0}, {"detenteur_id": bob["id"], "quotite_pct": 40.0}]},
    )

    loan = client.post(
        "/api/loans",
        json={
            "libelle": "Prêt maison",
            "capital_initial": 200000.0,
            "taux_annuel_pct": 3.0,
            "mensualite": 1000.0,
            "date_debut": "2021-06-15T00:00:00",
            "duree_mois": 240,
        },
    ).json()
    client.patch(f"/api/loans/{loan['id']}", json={"holding_id": maison["id"]})
    client.put(f"/api/loans/{loan['id']}/quotites", json={"quotites": [{"detenteur_id": alice["id"], "quotite_pct": 100.0}]})

    client.post(
        "/api/objectifs/",
        json={"nom": "Objectif", "montant_cible": 500000.0, "echeance": "2032-01-01", "holding_ids": [maison["id"]]},
    )
    client.post(
        "/api/salaire/",
        json={
            "annee": 2026,
            "nom": "Salaire Alice",
            "montant": 45000.0,
            "type_montant": "brut",
            "periodicite": "annuel",
            "statut": "cadre",
        },
    )
    make_transaction(db, symbol="AAA")
    client.put("/api/settings/preferences", json={"methode_cout": "fifo"})

    return {"compte": compte, "etablissement": etablissement, "alice": alice, "action": action, "maison": maison, "loan": loan}


def test_export_produit_un_document_complet_et_versionne(client, db):
    _peupler_foyer(client, db)

    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)

    assert document["format"] == donnees_service.FORMAT
    assert document["version"] == donnees_service.VERSION
    contenu = donnees_service.resume(document)
    for table in ("etablissements", "comptes", "detenteurs", "holdings", "loans", "objectifs", "salaires", "transactions"):
        assert contenu.get(table, 0) > 0, f"{table} absente de l'export"


def test_export_nexpose_jamais_le_user_id_ni_les_donnees_sensibles(client, db):
    """`user_id` appartient au foyer SOURCE ; les tables sensibles (mots de passe,
    jetons, journaux) ne doivent jamais se retrouver dans un fichier qui circule."""
    _peupler_foyer(client, db)

    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)

    for lignes in document["donnees"].values():
        for ligne in lignes:
            assert "user_id" not in ligne
    tables_interdites = {"users", "auth_tokens", "access_log_entries", "liens_partage", "partage_acces", "parametres"}
    assert tables_interdites.isdisjoint(document["donnees"].keys())


def test_aller_retour_complet_restitue_le_meme_patrimoine(client, db):
    """Cœur de la fonctionnalité : exporter → tout effacer → réimporter doit rendre
    un patrimoine identique, agrégats compris."""
    _peupler_foyer(client, db)
    net_avant = client.get("/api/patrimoine/net").json()
    lignes_avant = {h["ticker"] for h in client.get("/api/portfolio/holdings").json()}
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)

    donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    assert {h["ticker"] for h in client.get("/api/portfolio/holdings").json()} == lignes_avant
    assert client.get("/api/patrimoine/net").json()["patrimoine_net"] == net_avant["patrimoine_net"]


def test_aller_retour_preserve_les_relations_entre_tables(client, db):
    """Les identifiants sont réécrits à l'import : ce test vérifie que les liens
    pointent toujours vers la BONNE entité après réécriture, pas seulement qu'ils
    pointent vers quelque chose."""
    _peupler_foyer(client, db)
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)

    donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    # Ligne → compte → établissement
    action = db.query(Holding).filter(Holding.ticker == "AAA").one()
    assert action.compte is not None
    assert action.compte.nom == "PEA"
    assert action.compte.etablissement is not None
    assert action.compte.etablissement.nom == "Banque Test"

    # Quotités → bonnes personnes, bons pourcentages
    detail = client.get("/api/portfolio/holdings/AAA/detail").json()
    assert {(q["detenteur_nom"], q["quotite_pct"]) for q in detail["quotites"]} == {("Alice", 60.0), ("Bob", 40.0)}

    # Emprunt → la bonne ligne (celle de l'immobilier, pas l'action)
    maison = db.query(Holding).filter(Holding.ticker == "MAISON").one()
    loan = db.query(Loan).one()
    assert loan.holding_id == maison.id

    # Objectif → la bonne ligne rattachée
    objectif = client.get("/api/objectifs/").json()[0]
    assert [a["ticker"] for a in objectif["actifs_rattaches"]] == ["MAISON"]

    # Fiche immobilier et historique de valorisation suivent leur ligne
    fiche = client.get("/api/portfolio/holdings/MAISON/detail").json()
    assert fiche["immobilier"]["loyer_mensuel"] == 1200.0
    assert len(client.get("/api/portfolio/holdings/MAISON/immobilier-history").json()) >= 1


def test_import_remplace_integralement_lexistant(client, db):
    """Décision utilisateur : remplacement, pas fusion. Ce qui n'est pas dans le
    fichier disparaît."""
    _peupler_foyer(client, db)
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)
    # Une ligne créée APRÈS l'export ne doit pas survivre à l'import.
    client.post("/api/portfolio/holdings", json={"ticker": "ZZZ", "quantite": 1.0, "prix_revient_moyen": 1.0, "compte_nom": "Compte ZZZ"})
    assert any(h["ticker"] == "ZZZ" for h in client.get("/api/portfolio/holdings").json())

    donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    assert not any(h["ticker"] == "ZZZ" for h in client.get("/api/portfolio/holdings").json())


def test_import_ne_duplique_pas_en_cas_dimports_successifs(client, db):
    """Réimporter deux fois le même fichier doit donner le même résultat qu'une
    fois (opération idempotente) — conséquence directe du remplacement."""
    _peupler_foyer(client, db)
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)

    donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)
    apres_un = len(client.get("/api/portfolio/holdings").json())
    donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    assert len(client.get("/api/portfolio/holdings").json()) == apres_un
    assert db.query(Compte).filter(Compte.user_id == ID_UTILISATEUR_TEST).count() == 1


def test_import_ne_touche_jamais_les_donnees_dun_autre_foyer(client, db):
    """Le remplacement est strictement borné au foyer courant."""
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    make_holding(db, ticker="FOYER-B", user_id=ID_UTILISATEUR_B)
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)
    _peupler_foyer(client, db)
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)

    donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    assert db.query(Holding).filter(Holding.user_id == ID_UTILISATEUR_B).count() == 1


def test_un_export_dun_foyer_est_importable_dans_un_autre(client, db):
    """Cas d'usage « migration d'instance » : le fichier ne porte aucun `user_id`,
    il se réimporte donc sous l'identité du foyer qui l'importe."""
    _peupler_foyer(client, db)
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)

    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    donnees_service.importer_foyer(db, ID_UTILISATEUR_B, document)

    lignes_b = db.query(Holding).filter(Holding.user_id == ID_UTILISATEUR_B).all()
    assert {h.ticker for h in lignes_b} == {"AAA", "MAISON"}
    # Les quotités importées appartiennent bien au foyer B, pas au foyer source.
    quotites = db.query(QuotiteHolding).join(Holding).filter(Holding.user_id == ID_UTILISATEUR_B).count()
    assert quotites == 2


# ---------------------------------------------------------------------------
# Fichiers invalides — jamais d'effacement sur une entrée douteuse
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "document",
    [
        pytest.param({"format": "autre-chose", "version": 1, "donnees": {}}, id="format-etranger"),
        pytest.param({"format": donnees_service.FORMAT, "version": 999, "donnees": {}}, id="version-incompatible"),
        pytest.param({"format": donnees_service.FORMAT, "version": 1}, id="donnees-absentes"),
        pytest.param({"format": donnees_service.FORMAT, "version": 1, "donnees": []}, id="donnees-mal-typees"),
        pytest.param("pas un objet", id="pas-un-objet"),
    ],
)
def test_un_fichier_invalide_est_refuse(document):
    with pytest.raises(donnees_service.FichierExportInvalideError):
        donnees_service.valider(document)


def test_un_fichier_invalide_neffacce_jamais_le_patrimoine(client, db):
    """Le garde-fou le plus important : la validation passe AVANT toute écriture."""
    _peupler_foyer(client, db)
    avant = len(client.get("/api/portfolio/holdings").json())

    with pytest.raises(donnees_service.FichierExportInvalideError):
        donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, {"format": "autre", "version": 1, "donnees": {}})

    assert len(client.get("/api/portfolio/holdings").json()) == avant


# ---------------------------------------------------------------------------
# Endpoints HTTP
# ---------------------------------------------------------------------------


def test_endpoint_export_renvoie_un_fichier_json_telechargeable(client, db):
    _peupler_foyer(client, db)

    reponse = client.get("/api/donnees/export")

    assert reponse.status_code == 200
    assert "attachment" in reponse.headers["content-disposition"]
    assert ".json" in reponse.headers["content-disposition"]
    document = json.loads(reponse.content)
    assert document["format"] == donnees_service.FORMAT


def test_endpoint_apercu_decrit_le_contenu_sans_rien_modifier(client, db):
    _peupler_foyer(client, db)
    contenu = client.get("/api/donnees/export").content
    avant = len(client.get("/api/portfolio/holdings").json())

    reponse = client.post("/api/donnees/import/apercu", files={"file": ("export.json", contenu, "application/json")})

    assert reponse.status_code == 200
    assert reponse.json()["contenu"]["holdings"] == 2
    assert len(client.get("/api/portfolio/holdings").json()) == avant


def test_endpoint_import_remplace_et_renvoie_le_decompte(client, db):
    _peupler_foyer(client, db)
    contenu = client.get("/api/donnees/export").content
    client.post("/api/portfolio/holdings", json={"ticker": "ZZZ", "quantite": 1.0, "prix_revient_moyen": 1.0, "compte_nom": "Compte ZZZ"})

    reponse = client.post("/api/donnees/import", files={"file": ("export.json", contenu, "application/json")})

    assert reponse.status_code == 200
    assert reponse.json()["contenu"]["holdings"] == 2
    assert not any(h["ticker"] == "ZZZ" for h in client.get("/api/portfolio/holdings").json())


@pytest.mark.parametrize(
    ("nom", "contenu"),
    [
        ("vide.json", b""),
        ("pas-du-json.json", b"ceci n'est pas du JSON"),
        ("binaire.pdf", bytes([0x00, 0x01, 0xFF]) * 50),
        ("autre-appli.json", b'{"format": "autre-appli", "version": 1, "donnees": {}}'),
    ],
)
def test_endpoint_import_refuse_proprement_un_fichier_invalide(client, db, nom, contenu):
    _peupler_foyer(client, db)
    avant = len(client.get("/api/portfolio/holdings").json())

    reponse = client.post("/api/donnees/import", files={"file": (nom, contenu, "application/octet-stream")})

    assert reponse.status_code == 400
    assert len(client.get("/api/portfolio/holdings").json()) == avant


def test_export_dun_foyer_vide_est_importable(client, db):
    """Un foyer neuf s'exporte sans erreur, et son import remet simplement à zéro."""
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)
    assert donnees_service.resume(document) == {}

    make_holding(db, ticker="AAA")
    donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    assert client.get("/api/portfolio/holdings").json() == []


def test_les_dates_survivent_a_laller_retour(client, db):
    """`json.loads` ne rend que des chaînes : sans reconversion explicite, les
    colonnes date/datetime seraient réinsérées en texte."""
    _peupler_foyer(client, db)
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)

    donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    maison = db.query(Holding).filter(Holding.ticker == "MAISON").one()
    assert isinstance(maison.date_acquisition, datetime)
    assert maison.date_acquisition.date().isoformat() == "2021-06-15"
    loan = db.query(Loan).one()
    assert isinstance(loan.date_debut, datetime)


# --- validation des enumerations a l'import (revue du 03/09/2026) ---------------


@pytest.mark.parametrize(
    ("table", "colonne", "valeur"),
    [
        ("detenteurs", "type", "administrateur"),
        ("holdings", "origine", "n_importe_quoi"),
        ("objectifs", "type", "domination_mondiale"),
        ("salaires", "periodicite", "hebdomadaire"),
    ],
)
def test_import_refuse_une_valeur_hors_enumeration(db, table, colonne, valeur):
    """L'import écrit les lignes directement (`modele(**valeurs)`), sans passer par
    les schémas Pydantic qui valident ces champs sur les routes normales, et le
    schéma SQL ne porte aucune contrainte CHECK. Sans ce garde-fou, un fichier
    d'export édité à la main corrompt silencieusement les données du foyer et casse
    des écrans sans que rien n'explique pourquoi."""
    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)
    modele = next(t.modele for t in donnees_service.TABLES if t.nom == table)
    colonnes = {c.name for c in modele.__table__.columns} - {"user_id"}
    ligne = {c: None for c in colonnes}
    ligne["id"] = 1
    ligne[colonne] = valeur
    document["donnees"][table] = [ligne]

    with pytest.raises(donnees_service.ValeurInvalideError) as exc:
        donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    assert colonne in str(exc.value)
    assert valeur in str(exc.value)


def test_import_refuse_laisse_les_donnees_intactes(db):
    """L'import est un remplacement total : un refus en cours de route ne doit pas
    laisser le foyer à moitié vidé."""
    avant = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)
    nombre_holdings = len(avant["donnees"]["holdings"])

    document = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)
    document["donnees"]["detenteurs"] = [{"id": 1, "nom": "X", "type": "extraterrestre"}]

    with pytest.raises(donnees_service.ValeurInvalideError):
        donnees_service.importer_foyer(db, ID_UTILISATEUR_TEST, document)

    apres = donnees_service.exporter_foyer(db, ID_UTILISATEUR_TEST)
    assert len(apres["donnees"]["holdings"]) == nombre_holdings


# ---------------------------------------------------------------------------
# Remise à zéro complète du foyer (revue du 05/09/2026, gestion du foyer dans sa
# globalité) — `reinitialiser_foyer` et l'endpoint `/donnees/effacer`.
# ---------------------------------------------------------------------------


def test_reinitialiser_foyer_efface_tout_le_patrimoine(client, db):
    _peupler_foyer(client, db)
    assert db.query(Holding).filter(Holding.user_id == ID_UTILISATEUR_TEST).count() > 0

    donnees_service.reinitialiser_foyer(db, ID_UTILISATEUR_TEST, [ID_UTILISATEUR_TEST])

    assert db.query(Holding).filter(Holding.user_id == ID_UTILISATEUR_TEST).count() == 0
    assert db.query(Compte).filter(Compte.user_id == ID_UTILISATEUR_TEST).count() == 0
    assert db.query(Etablissement).filter(Etablissement.user_id == ID_UTILISATEUR_TEST).count() == 0
    assert db.query(Detenteur).filter(Detenteur.user_id == ID_UTILISATEUR_TEST).count() == 0
    assert db.query(Loan).filter(Loan.user_id == ID_UTILISATEUR_TEST).count() == 0
    assert db.query(Objectif).filter(Objectif.user_id == ID_UTILISATEUR_TEST).count() == 0
    assert db.query(Salaire).filter(Salaire.user_id == ID_UTILISATEUR_TEST).count() == 0


def test_reinitialiser_foyer_ne_touche_pas_un_autre_foyer(client, db):
    basculer_utilisateur(db, ID_UTILISATEUR_B, NOM_UTILISATEUR_B)
    make_holding(db, ticker="FOYER-B", user_id=ID_UTILISATEUR_B)
    basculer_utilisateur(db, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_TEST)
    _peupler_foyer(client, db)

    donnees_service.reinitialiser_foyer(db, ID_UTILISATEUR_TEST, [ID_UTILISATEUR_TEST])

    assert db.query(Holding).filter(Holding.user_id == ID_UTILISATEUR_B).count() == 1


def test_reinitialiser_foyer_preserve_les_comptes_utilisateurs(client, db):
    """Décision utilisateur : la remise à zéro efface les données comptables, jamais
    les comptes du foyer eux-mêmes."""
    membre = client.post(
        "/api/auth/household-members", json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"}
    ).json()
    _peupler_foyer(client, db)

    donnees_service.reinitialiser_foyer(db, ID_UTILISATEUR_TEST, [ID_UTILISATEUR_TEST, membre["id"]])

    assert db.get(User, ID_UTILISATEUR_TEST) is not None
    assert db.get(User, membre["id"]) is not None


def test_reinitialiser_foyer_efface_les_liens_de_partage(client, db):
    """`LienPartage` est volontairement exclu de `TABLES` (export/import) mais
    reste une donnée du foyer à effacer pour une remise à zéro réelle."""
    _peupler_foyer(client, db)
    client.post("/api/partage", json={"nom": "Pour la banque"})
    assert db.query(LienPartage).filter(LienPartage.user_id == ID_UTILISATEUR_TEST).count() == 1

    donnees_service.reinitialiser_foyer(db, ID_UTILISATEUR_TEST, [ID_UTILISATEUR_TEST])

    assert db.query(LienPartage).filter(LienPartage.user_id == ID_UTILISATEUR_TEST).count() == 0


def test_reinitialiser_foyer_efface_les_perimetres_invites_et_resiste_a_la_reutilisation_dun_id(client, db):
    """Cas limite critique : `PerimetreInvite.user_id` est le compte de l'invité,
    jamais l'ancre du foyer — sans nettoyage explicite, un id de détenteur réutilisé
    par SQLite après une suppression totale ferait courir le risque qu'un vieux
    périmètre d'invité donne accès à une donnée totalement différente créée après
    coup."""
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"}).json()
    invite = client.post(
        "/api/auth/household-members",
        json={"username": "invite-test", "password": "mot-de-passe-solide", "role": "invite", "detenteur_ids": [alice["id"]]},
    ).json()
    assert db.query(PerimetreInvite).filter(PerimetreInvite.user_id == invite["id"]).count() == 1

    donnees_service.reinitialiser_foyer(db, ID_UTILISATEUR_TEST, [ID_UTILISATEUR_TEST, invite["id"]])

    assert db.query(PerimetreInvite).filter(PerimetreInvite.user_id == invite["id"]).count() == 0

    # Un nouveau détenteur créé après coup ne doit jamais hériter, via un id
    # réutilisé par SQLite, d'un périmètre laissé par l'ancienne Alice.
    nouveau = client.post("/api/detenteurs", json={"nom": "Bob", "type": "personne"}).json()
    assert (
        db.query(PerimetreInvite)
        .filter(PerimetreInvite.user_id == invite["id"], PerimetreInvite.detenteur_id == nouveau["id"])
        .count()
        == 0
    )


def test_endpoint_effacer_refuse_une_confirmation_incorrecte(client, db):
    _peupler_foyer(client, db)

    reponse = client.post("/api/donnees/effacer", json={"confirmation": "mauvaise-phrase"})

    assert reponse.status_code == 400
    assert "SUPPRIMER" in reponse.json()["detail"]
    assert len(client.get("/api/portfolio/holdings").json()) > 0


def test_endpoint_effacer_avec_supprimer_sans_nom_de_foyer(client, db):
    _peupler_foyer(client, db)

    reponse = client.post("/api/donnees/effacer", json={"confirmation": "SUPPRIMER"})

    assert reponse.status_code == 200
    assert client.get("/api/portfolio/holdings").json() == []


def test_endpoint_effacer_exige_le_nom_du_foyer_sil_est_defini(client, db):
    _peupler_foyer(client, db)
    client.patch("/api/auth/foyer", json={"nom": "Famille Test"})

    refuse = client.post("/api/donnees/effacer", json={"confirmation": "SUPPRIMER"})
    assert refuse.status_code == 400

    reponse = client.post("/api/donnees/effacer", json={"confirmation": "Famille Test"})
    assert reponse.status_code == 200
    assert client.get("/api/portfolio/holdings").json() == []


def test_endpoint_effacer_preserve_les_comptes_utilisateurs(client, db):
    membre = client.post(
        "/api/auth/household-members", json={"username": "conjoint", "password": "mot-de-passe-solide", "role": "membre"}
    ).json()
    _peupler_foyer(client, db)

    reponse = client.post("/api/donnees/effacer", json={"confirmation": "SUPPRIMER"})

    assert reponse.status_code == 200
    assert db.get(User, membre["id"]) is not None
