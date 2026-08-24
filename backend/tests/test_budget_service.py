"""Verrouille l'écran Budget (backlog 2.N.2) : `services/budget_service.py` —
indicateurs de période, répartition par catégorie, dépenses récurrentes, budget
cible."""

import itertools

import pytest

from app.models import MouvementBancaire
from app.services import budget_categories_service, budget_service

from .conftest import ID_UTILISATEUR_TEST

_compteur_transaction_id = itertools.count(1)


def make_mouvement(db, **overrides):
    defaults = dict(
        user_id=ID_UTILISATEUR_TEST,
        transaction_id=f"tx-test-{next(_compteur_transaction_id)}",
        date="2026-02-01",
        libelle="Mouvement",
        montant=-10.0,
    )
    defaults.update(overrides)
    m = MouvementBancaire(**defaults)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def test_compute_summary_entrees_sorties_disponible(db):
    make_mouvement(db, date="2026-02-01", libelle="Salaire", montant=2000.0)
    make_mouvement(db, date="2026-02-05", libelle="Loyer", montant=-800.0)
    make_mouvement(db, date="2026-02-10", libelle="Courses", montant=-150.0)
    # Hors période : ne doit pas être compté.
    make_mouvement(db, date="2026-01-15", libelle="Ancien", montant=-9999.0)

    summary = budget_service.compute_summary(db, ID_UTILISATEUR_TEST, "2026-02-01", "2026-02-28")

    assert summary["entrees"] == 2000.0
    assert summary["sorties"] == 950.0
    assert summary["disponible"] == 1050.0


def test_compute_summary_repartition_regroupe_sur_la_categorie_racine(db):
    alimentation = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Alimentation", None)
    restaurants = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Restaurants", alimentation.id)
    make_mouvement(db, date="2026-02-01", libelle="Supermarché", montant=-60.0, categorie_id=alimentation.id)
    make_mouvement(db, date="2026-02-02", libelle="Resto", montant=-40.0, categorie_id=restaurants.id)
    make_mouvement(db, date="2026-02-03", libelle="?", montant=-15.0, categorie_id=None)

    summary = budget_service.compute_summary(db, ID_UTILISATEUR_TEST, "2026-02-01", "2026-02-28")

    par_nom = {item["categorie_nom"]: item["montant"] for item in summary["repartition_sorties"]}
    assert par_nom["Alimentation"] == 100.0  # 60 (racine) + 40 (sous-catégorie) regroupés
    assert par_nom["Non catégorisé"] == 15.0


def test_compute_summary_inclut_la_cible_dans_la_repartition(db):
    c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Loisirs", None)
    make_mouvement(db, date="2026-02-01", libelle="Ciné", montant=-30.0, categorie_id=c.id)
    budget_service.set_cible(db, ID_UTILISATEUR_TEST, c.id, 100.0)

    summary = budget_service.compute_summary(db, ID_UTILISATEUR_TEST, "2026-02-01", "2026-02-28")

    item = next(i for i in summary["repartition_sorties"] if i["categorie_id"] == c.id)
    assert item["cible_mensuelle"] == 100.0


def test_depenses_recurrentes_detecte_un_couple_libelle_montant_revenant_sur_2_mois(db):
    make_mouvement(db, date="2026-01-05", libelle="Abonnement Netflix", montant=-15.0)
    make_mouvement(db, date="2026-02-05", libelle="Abonnement Netflix", montant=-15.0)
    make_mouvement(db, date="2026-02-10", libelle="Achat ponctuel", montant=-40.0)

    total = budget_service.compute_depenses_recurrentes_mensuelles(db, ID_UTILISATEUR_TEST, "2026-03-01")

    assert total == 15.0


def test_depenses_recurrentes_ignore_un_mouvement_vu_une_seule_fois(db):
    make_mouvement(db, date="2026-02-05", libelle="Une seule fois", montant=-15.0)

    total = budget_service.compute_depenses_recurrentes_mensuelles(db, ID_UTILISATEUR_TEST, "2026-03-01")

    assert total == 0.0


def test_categoriser_mouvement_pose_le_drapeau_manuel(db):
    c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Santé", None)
    m = make_mouvement(db)

    resultat = budget_service.categoriser_mouvement(db, ID_UTILISATEUR_TEST, m.id, c.id)

    assert resultat.categorie_id == c.id
    assert resultat.categorise_manuellement is True


def test_categoriser_mouvement_introuvable_leve(db):
    with pytest.raises(ValueError, match="introuvable"):
        budget_service.categoriser_mouvement(db, ID_UTILISATEUR_TEST, 999, None)


def test_set_cible_rejette_une_sous_categorie(db):
    parent = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Alimentation", None)
    enfant = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Restaurants", parent.id)

    with pytest.raises(ValueError, match="racine"):
        budget_service.set_cible(db, ID_UTILISATEUR_TEST, enfant.id, 50.0)


def test_set_cible_met_a_jour_une_cible_existante(db):
    c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Loisirs", None)
    budget_service.set_cible(db, ID_UTILISATEUR_TEST, c.id, 100.0)
    budget_service.set_cible(db, ID_UTILISATEUR_TEST, c.id, 150.0)

    cibles = budget_service.list_cibles(db, ID_UTILISATEUR_TEST)
    assert len(cibles) == 1
    assert cibles[0].montant_mensuel == 150.0
