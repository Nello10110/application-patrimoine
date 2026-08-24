"""Verrouille l'arbre de catégories et les règles de catégorisation (backlog 2.N.1) :
`services/budget_categories_service.py`."""

import pytest

from app.models import BudgetCible, MouvementBancaire, RegleCategorisation
from app.services import budget_categories_service

from .conftest import ID_UTILISATEUR_TEST


def test_assurer_categories_par_defaut_cree_l_arbre_une_seule_fois(db):
    categories = budget_categories_service.assurer_categories_par_defaut(db, ID_UTILISATEUR_TEST)
    assert [c.nom for c in categories] == budget_categories_service.DEFAULT_CATEGORIES

    # Un utilisateur qui a tout supprimé volontairement ne doit pas les voir
    # réapparaître au prochain appel.
    for c in categories:
        db.delete(c)
    db.commit()
    assert budget_categories_service.assurer_categories_par_defaut(db, ID_UTILISATEUR_TEST) == []


def test_create_rename_delete_categorie(db):
    c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Vacances", None)
    assert c.id is not None

    renommee = budget_categories_service.rename_categorie(db, ID_UTILISATEUR_TEST, c.id, "Voyages")
    assert renommee.nom == "Voyages"

    budget_categories_service.delete_categorie(db, ID_UTILISATEUR_TEST, c.id)
    assert budget_categories_service.list_categories(db, ID_UTILISATEUR_TEST) == []


def test_delete_categorie_nullifie_les_mouvements_et_supprime_cibles_et_regles_associees(db):
    c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Loisirs", None)
    m = MouvementBancaire(user_id=ID_UTILISATEUR_TEST, transaction_id="tx-1", date="2026-01-01", libelle="Ciné", montant=-15.0, categorie_id=c.id)
    db.add(m)
    db.add(BudgetCible(user_id=ID_UTILISATEUR_TEST, categorie_id=c.id, montant_mensuel=50.0))
    db.add(RegleCategorisation(user_id=ID_UTILISATEUR_TEST, motif="cine", categorie_id=c.id))
    db.commit()

    budget_categories_service.delete_categorie(db, ID_UTILISATEUR_TEST, c.id)

    db.refresh(m)
    assert m.categorie_id is None
    assert db.query(BudgetCible).count() == 0
    assert db.query(RegleCategorisation).count() == 0


def test_delete_categorie_cascade_ses_sous_categories(db):
    parent = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Alimentation", None)
    enfant = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Restaurants", parent.id)

    budget_categories_service.delete_categorie(db, ID_UTILISATEUR_TEST, parent.id)

    assert budget_categories_service.list_categories(db, ID_UTILISATEUR_TEST) == []
    assert db.get(type(enfant), enfant.id) is None


def test_create_categorie_avec_parent_dun_autre_utilisateur_leve(db):
    parent_autre = budget_categories_service.create_categorie(db, user_id=999, nom="Intrus", parent_id=None)
    with pytest.raises(ValueError, match="introuvable"):
        budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Sous-intrus", parent_autre.id)


def test_regle_create_list_delete(db):
    c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Transport", None)
    r = budget_categories_service.create_regle(db, ID_UTILISATEUR_TEST, "SNCF", c.id)
    assert [x.motif for x in budget_categories_service.list_regles(db, ID_UTILISATEUR_TEST)] == ["SNCF"]

    budget_categories_service.delete_regle(db, ID_UTILISATEUR_TEST, r.id)
    assert budget_categories_service.list_regles(db, ID_UTILISATEUR_TEST) == []


def test_create_regle_categorie_introuvable_leve(db):
    with pytest.raises(ValueError, match="introuvable"):
        budget_categories_service.create_regle(db, ID_UTILISATEUR_TEST, "SNCF", 999)


def test_categorie_correspondante_insensible_casse_et_accents(db):
    c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Santé", None)
    regles = [budget_categories_service.create_regle(db, ID_UTILISATEUR_TEST, "pharmacie", c.id)]

    assert budget_categories_service.categorie_correspondante("PHARMACIE CENTRALE", regles) == c.id
    assert budget_categories_service.categorie_correspondante("Virement Pharmacie du Marché", regles) == c.id
    assert budget_categories_service.categorie_correspondante("Boulangerie", regles) is None


def test_categorie_correspondante_premiere_regle_gagne(db):
    c1 = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "A", None)
    c2 = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "B", None)
    regles = [
        budget_categories_service.create_regle(db, ID_UTILISATEUR_TEST, "carrefour", c1.id),
        budget_categories_service.create_regle(db, ID_UTILISATEUR_TEST, "carrefour city", c2.id),
    ]
    assert budget_categories_service.categorie_correspondante("CARREFOUR CITY PARIS", regles) == c1.id
