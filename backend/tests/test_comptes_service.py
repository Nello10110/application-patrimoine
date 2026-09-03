"""Verrouille `services/comptes_service.py` (écran Comptes, backlog X.1) : CRUD
établissements/comptes, résolution à la volée, répartition par détenteur portée par
le compte (bouclée sur `detenteurs_service.set_quotites_holding`, jamais une nouvelle
table de quotités), solde tous types d'actifs confondus."""

from datetime import datetime

import pytest

from app.models import Compte, Holding, Loan, QuotiteHolding, QuotiteLoan
from app.services import comptes_service, detenteurs_service

from .conftest import ID_UTILISATEUR_TEST, make_holding


def test_create_et_list_etablissements(db):
    comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Caisse d'Épargne")
    comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Boursorama")

    noms = {e.nom for e in comptes_service.list_etablissements(db, ID_UTILISATEUR_TEST)}
    assert noms == {"Caisse d'Épargne", "Boursorama"}


def test_delete_etablissement_ne_supprime_pas_les_comptes_rattaches(db):
    etablissement = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Caisse d'Épargne")
    compte = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "Livret A", etablissement.id)

    comptes_service.delete_etablissement(db, etablissement)

    db.refresh(compte)
    assert db.get(Compte, compte.id) is not None
    assert compte.etablissement_id is None


def test_delete_compte_ne_supprime_pas_les_holdings_rattaches(db):
    compte = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "PEA", None)
    holding = make_holding(db, ticker="AAA", compte_id=compte.id)

    comptes_service.delete_compte(db, compte)

    db.refresh(holding)
    assert db.get(Holding, holding.id) is not None
    assert holding.compte_id is None


def test_get_or_create_compte_reutilise_un_compte_existant(db):
    premier = comptes_service.get_or_create_compte(db, ID_UTILISATEUR_TEST, "PEA")
    second = comptes_service.get_or_create_compte(db, ID_UTILISATEUR_TEST, "PEA")

    assert premier.id == second.id
    assert db.query(Compte).filter(Compte.user_id == ID_UTILISATEUR_TEST, Compte.nom == "PEA").count() == 1


def test_get_or_create_compte_cree_si_absent(db):
    compte = comptes_service.get_or_create_compte(db, ID_UTILISATEUR_TEST, "Nouveau compte")

    assert compte.nom == "Nouveau compte"
    assert compte.etablissement_id is None


def test_set_quotites_compte_applique_la_meme_repartition_a_chaque_ligne(db):
    """Cœur de la fonctionnalité (retour utilisateur) : dire une fois « ce compte
    est à 50/50 » plutôt que ligne par ligne — sans nouvelle table de quotités,
    juste `QuotiteHolding` écrite sur chaque ligne du compte."""
    compte = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "CTO", None)
    alice_id = _creer_detenteur(db, "Alice")
    bob_id = _creer_detenteur(db, "Bob")
    h1 = make_holding(db, ticker="AAA", compte_id=compte.id)
    h2 = make_holding(db, ticker="BBB", compte_id=compte.id)
    # Ligne d'un autre compte : ne doit jamais être touchée.
    autre_compte = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "PEA", None)
    h3 = make_holding(db, ticker="CCC", compte_id=autre_compte.id)

    comptes_service.set_quotites_compte(db, ID_UTILISATEUR_TEST, compte, [(alice_id, 50.0), (bob_id, 50.0)])

    for h in (h1, h2):
        quotites = {q.detenteur_id: q.quotite_pct for q in db.query(QuotiteHolding).filter(QuotiteHolding.holding_id == h.id).all()}
        assert quotites == {alice_id: 50.0, bob_id: 50.0}
    assert db.query(QuotiteHolding).filter(QuotiteHolding.holding_id == h3.id).count() == 0


def test_set_quotites_compte_applique_aussi_aux_emprunts_rattaches(db):
    """Demande explicite de l'utilisateur (backlog X.4) : « pareil pour un compte
    courant, un compte titre, un immobilier, une dette » — un emprunt rattaché
    (`Loan.holding_id`) à une ligne du compte doit suivre la même répartition que
    la ligne elle-même, sans étape séparée sur la carte Dettes et emprunts."""
    compte = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "Compte immobilier", None)
    alice_id = _creer_detenteur(db, "Alice")
    bob_id = _creer_detenteur(db, "Bob")
    appartement = make_holding(db, ticker="MAISON", compte_id=compte.id)
    loan = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Prêt immobilier",
        capital_initial=200000.0,
        taux_annuel_pct=3.0,
        mensualite=1000.0,
        date_debut=datetime(2020, 1, 1),
        duree_mois=240,
        holding_id=appartement.id,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    # Emprunt sans rattachement : ne doit jamais être touché.
    loan_orphelin = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Prêt conso",
        capital_initial=5000.0,
        taux_annuel_pct=2.0,
        mensualite=200.0,
        date_debut=datetime(2021, 1, 1),
        duree_mois=24,
        holding_id=None,
    )
    db.add(loan_orphelin)
    db.commit()
    db.refresh(loan_orphelin)

    comptes_service.set_quotites_compte(db, ID_UTILISATEUR_TEST, compte, [(alice_id, 50.0), (bob_id, 50.0)])

    quotites_pret = {q.detenteur_id: q.quotite_pct for q in db.query(QuotiteLoan).filter(QuotiteLoan.loan_id == loan.id).all()}
    assert quotites_pret == {alice_id: 50.0, bob_id: 50.0}
    assert db.query(QuotiteLoan).filter(QuotiteLoan.loan_id == loan_orphelin.id).count() == 0


def test_set_quotites_compte_sur_un_compte_vide_ne_leve_pas(db):
    compte = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "Vide", None)
    alice_id = _creer_detenteur(db, "Alice")

    comptes_service.set_quotites_compte(db, ID_UTILISATEUR_TEST, compte, [(alice_id, 100.0)])  # ne lève pas


def test_solde_par_compte_couvre_tous_les_types_actif(db):
    """Contrairement à `analysis_service.repartition_par_compte` (portefeuille
    financier seul), `solde_par_compte` doit couvrir aussi l'immobilier/l'épargne —
    c'est exactement le trou que l'écran Comptes comble."""
    compte_financier = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "CTO", None)
    compte_immo = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "Résidence", None)
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0, compte_id=compte_financier.id)
    make_holding(
        db,
        ticker="MAISON",
        type_actif="REAL_ESTATE",
        quantite=1,
        prix_revient_moyen=200000.0,
        valeur_estimee=250000.0,
        compte_id=compte_immo.id,
    )
    make_holding(db, ticker="SANS_COMPTE", type_actif="STOCK", quantite=1, prix_revient_moyen=50.0)

    resultats = comptes_service.solde_par_compte(db, ID_UTILISATEUR_TEST)

    par_id = {r["compte"].id if r["compte"] else None: r for r in resultats}
    assert par_id[compte_financier.id]["solde"] == 1000.0
    assert par_id[compte_immo.id]["solde"] == 250000.0
    assert par_id[None]["solde"] == 50.0


def test_solde_par_compte_inclut_un_compte_vide_a_zero(db):
    compte = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "Tout juste créé", None)

    resultats = comptes_service.solde_par_compte(db, ID_UTILISATEUR_TEST)

    assert len(resultats) == 1
    assert resultats[0]["compte"].id == compte.id
    assert resultats[0]["solde"] == 0.0
    assert resultats[0]["nombre_lignes"] == 0


def test_solde_par_compte_avec_perimetre_invite_omet_les_comptes_sans_ligne_visible(db):
    compte_visible = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "Visible", None)
    compte_invisible = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "Invisible", None)
    h_visible = make_holding(db, ticker="AAA", quantite=1, prix_revient_moyen=100.0, compte_id=compte_visible.id)
    make_holding(db, ticker="BBB", quantite=1, prix_revient_moyen=100.0, compte_id=compte_invisible.id)

    resultats = comptes_service.solde_par_compte(db, ID_UTILISATEUR_TEST, holdings_visibles_ids={h_visible.id})

    noms = {r["compte"].nom for r in resultats if r["compte"] is not None}
    assert noms == {"Visible"}


def _creer_detenteur(db, nom: str) -> int:
    from app.models import Detenteur

    detenteur = Detenteur(user_id=ID_UTILISATEUR_TEST, nom=nom, type="personne")
    db.add(detenteur)
    db.commit()
    db.refresh(detenteur)
    return detenteur.id


def test_repartir_un_compte_est_atomique(db, monkeypatch):
    """Revue du 03/09/2026 : chaque ligne committait pour son compte, donc un échec
    à mi-parcours laissait le compte à moitié réparti — sans que rien n'indique où.
    Du point de vue de l'utilisateur, « répartir ce compte » est UNE action : elle
    aboutit, ou elle ne change rien."""
    compte = comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "Compte atomique", None)
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Atomique Alice", "personne")
    lignes = [make_holding(db, ticker=f"ATOM{i}") for i in range(3)]
    for h in lignes:
        h.compte_id = compte.id
    db.commit()

    # Échec provoqué sur la DERNIÈRE ligne : les deux premières sont déjà écrites en
    # session au moment où ça casse.
    vrai = detenteurs_service.set_quotites_holding
    appels = {"n": 0}

    def _echoue_a_la_troisieme(*args, **kwargs):
        appels["n"] += 1
        if appels["n"] == 3:
            raise ValueError("panne simulée")
        return vrai(*args, **kwargs)

    monkeypatch.setattr(detenteurs_service, "set_quotites_holding", _echoue_a_la_troisieme)

    with pytest.raises(ValueError, match="panne simulée"):
        comptes_service.set_quotites_compte(db, ID_UTILISATEUR_TEST, compte, [(alice.id, 100.0)])

    # Aucune des trois lignes ne doit porter de répartition.
    for h in lignes:
        assert detenteurs_service.compute_pourcentages(db, h) == {}, f"{h.ticker} a été réparti malgré l'échec"
