"""Verrouille les détenteurs et quotités (backlog 2.L.1) :
`services/detenteurs_service.py`."""

from datetime import datetime

import pytest

from app.models import Loan
from app.services import detenteurs_service

from .conftest import ID_UTILISATEUR_TEST, make_holding


def make_detenteur(db, nom="Alice", type_="personne"):
    return detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, nom, type_)


def test_create_list_update_delete_detenteur(db):
    d = make_detenteur(db, nom="Alice", type_="personne")
    assert d.id is not None
    assert [x.nom for x in detenteurs_service.list_detenteurs(db, ID_UTILISATEUR_TEST)] == ["Alice"]

    detenteurs_service.update_detenteur(db, d, nom="Alicia")
    assert detenteurs_service.list_detenteurs(db, ID_UTILISATEUR_TEST)[0].nom == "Alicia"

    detenteurs_service.delete_detenteur(db, d)
    assert detenteurs_service.list_detenteurs(db, ID_UTILISATEUR_TEST) == []


def test_set_quotites_holding_rejette_si_somme_differente_de_100(db):
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")
    bob = make_detenteur(db, "Bob")

    with pytest.raises(ValueError, match="100"):
        detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 50.0), (bob.id, 40.0)])


def test_set_quotites_holding_rejette_un_detenteur_en_double(db):
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")

    with pytest.raises(ValueError, match="une seule fois"):
        detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 50.0), (alice.id, 50.0)])


def test_set_quotites_holding_rejette_un_detenteur_dun_autre_compte(db):
    h = make_holding(db)
    detenteur_autre_compte = detenteurs_service.create_detenteur(db, user_id=999, nom="Intrus", type_="personne")

    with pytest.raises(ValueError, match="introuvable"):
        detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(detenteur_autre_compte.id, 100.0)])


def test_set_quotites_holding_liste_vide_retire_toute_repartition(db):
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 100.0)])

    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [])

    assert detenteurs_service.compute_parts(db, h, 1000.0) == {}


def test_compute_parts_sans_quotite_renvoie_vide(db):
    h = make_holding(db)
    assert detenteurs_service.compute_parts(db, h, 1000.0) == {}


def test_compute_parts_part_detenue_simple(db):
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")
    bob = make_detenteur(db, "Bob")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 60.0), (bob.id, 40.0)])

    parts = detenteurs_service.compute_parts(db, h, 1000.0)

    assert parts[alice.id]["part_detenue"] == 600.0
    assert parts[bob.id]["part_detenue"] == 400.0
    # Pas d'emprunt rattaché : part nette == part détenue.
    assert parts[alice.id]["part_nette"] == 600.0
    assert parts[bob.id]["part_nette"] == 400.0


def test_compute_parts_part_nette_herite_de_la_quotite_de_lactif_sans_quotite_demprunt(db):
    """Un emprunt rattaché sans quotité explicite hérite de la répartition de
    l'actif — le cas courant (le même partage s'applique à l'actif et à sa dette)."""
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")
    bob = make_detenteur(db, "Bob")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 50.0), (bob.id, 50.0)])
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit",
            capital_initial=200000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            capital_restant_du_manuel=120000.0,
            holding_id=h.id,
        )
    )
    db.commit()

    parts = detenteurs_service.compute_parts(db, h, 300000.0)

    # part_nette = 50% * 300000 - 50% * 120000 = 150000 - 60000 = 90000
    assert parts[alice.id]["part_detenue"] == 150000.0
    assert parts[alice.id]["part_nette"] == 90000.0
    assert parts[bob.id]["part_nette"] == 90000.0


def test_compute_parts_part_nette_avec_quotite_demprunt_explicite_differente(db):
    """Cas « un seul conjoint a signé le prêt » : la quotité d'emprunt, quand elle
    est saisie, prime sur l'héritage depuis l'actif."""
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")
    bob = make_detenteur(db, "Bob")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 50.0), (bob.id, 50.0)])
    loan = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Crédit",
        capital_initial=200000.0,
        taux_annuel_pct=0.0,
        mensualite=1000.0,
        date_debut=datetime(2020, 1, 1),
        duree_mois=200,
        capital_restant_du_manuel=100000.0,
        holding_id=h.id,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    # Alice seule a signé le prêt : 100 % de la dette lui est imputée.
    detenteurs_service.set_quotites_loan(db, ID_UTILISATEUR_TEST, loan, [(alice.id, 100.0)])

    parts = detenteurs_service.compute_parts(db, h, 300000.0)

    # Alice : part détenue 150000 (50% de l'actif) - 100000 (100% de la dette) = 50000
    assert parts[alice.id]["part_nette"] == 50000.0
    # Bob : part détenue 150000 (50% de l'actif) - 0 (aucune dette) = 150000
    assert parts[bob.id]["part_nette"] == 150000.0


def test_delete_detenteur_supprime_ses_quotites_en_cascade(db):
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 100.0)])

    detenteurs_service.delete_detenteur(db, alice)

    # Le holding lui-même n'est pas touché, mais il n'a plus aucune répartition.
    assert detenteurs_service.compute_parts(db, h, 1000.0) == {}
