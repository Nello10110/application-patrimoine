"""Verrouille la détection des charges récurrentes et abonnements (backlog 2.N.3) :
`services/budget_recurrences_service.py`."""

import itertools
from datetime import date

from app.models import MouvementBancaire
from app.services import budget_recurrences_service

from .conftest import ID_UTILISATEUR_TEST

_compteur_transaction_id = itertools.count(1)


def make_mouvement(db, **overrides):
    defaults = dict(
        user_id=ID_UTILISATEUR_TEST,
        transaction_id=f"tx-recur-{next(_compteur_transaction_id)}",
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


def test_detecte_une_charge_mensuelle_stable(db):
    make_mouvement(db, date="2025-12-05", libelle="Netflix", montant=-12.99)
    make_mouvement(db, date="2026-01-05", libelle="Netflix", montant=-12.99)
    make_mouvement(db, date="2026-02-05", libelle="Netflix", montant=-12.99)

    resultats = budget_recurrences_service.detect_recurrences(db, ID_UTILISATEUR_TEST, aujourdhui=date(2026, 2, 10))

    assert len(resultats) == 1
    r = resultats[0]
    assert r.libelle == "Netflix"
    assert r.montant_actuel == 12.99
    assert r.montant_precedent == 12.99
    assert r.hausse_prix is False
    assert r.occurrences == 3
    assert r.periodicite == "mensuelle"


def test_detecte_une_hausse_de_prix(db):
    make_mouvement(db, date="2026-01-05", libelle="Spotify", montant=-9.99)
    make_mouvement(db, date="2026-02-05", libelle="Spotify", montant=-11.99)  # +20%

    resultats = budget_recurrences_service.detect_recurrences(db, ID_UTILISATEUR_TEST, aujourdhui=date(2026, 2, 10))

    assert len(resultats) == 1
    assert resultats[0].hausse_prix is True
    assert resultats[0].montant_actuel == 11.99
    assert resultats[0].montant_precedent == 9.99


def test_ignore_une_variation_de_prix_sous_le_seuil(db):
    make_mouvement(db, date="2026-01-05", libelle="Assurance", montant=-50.00)
    make_mouvement(db, date="2026-02-05", libelle="Assurance", montant=-51.00)  # +2%

    resultats = budget_recurrences_service.detect_recurrences(db, ID_UTILISATEUR_TEST, aujourdhui=date(2026, 2, 10))

    assert resultats[0].hausse_prix is False


def test_ignore_un_mouvement_vu_une_seule_fois(db):
    make_mouvement(db, date="2026-02-05", libelle="Achat unique", montant=-99.0)

    resultats = budget_recurrences_service.detect_recurrences(db, ID_UTILISATEUR_TEST, aujourdhui=date(2026, 2, 10))

    assert resultats == []


def test_ignore_un_mouvement_dont_la_derniere_occurrence_est_trop_ancienne(db):
    # Récurrent par le passé mais plus vu depuis 4 mois : probablement résilié.
    make_mouvement(db, date="2025-08-05", libelle="Salle de sport", montant=-30.0)
    make_mouvement(db, date="2025-09-05", libelle="Salle de sport", montant=-30.0)
    make_mouvement(db, date="2025-10-05", libelle="Salle de sport", montant=-30.0)

    resultats = budget_recurrences_service.detect_recurrences(db, ID_UTILISATEUR_TEST, aujourdhui=date(2026, 2, 10))

    assert resultats == []


def test_classe_irreguliere_une_periodicite_non_mensuelle(db):
    make_mouvement(db, date="2025-08-05", libelle="Pressing", montant=-20.0)
    make_mouvement(db, date="2026-01-20", libelle="Pressing", montant=-20.0)
    make_mouvement(db, date="2026-02-05", libelle="Pressing", montant=-20.0)

    resultats = budget_recurrences_service.detect_recurrences(db, ID_UTILISATEUR_TEST, aujourdhui=date(2026, 2, 10))

    assert resultats[0].periodicite == "irreguliere"


def test_ignore_les_entrees_d_argent(db):
    make_mouvement(db, date="2026-01-01", libelle="Salaire", montant=2000.0)
    make_mouvement(db, date="2026-02-01", libelle="Salaire", montant=2000.0)

    resultats = budget_recurrences_service.detect_recurrences(db, ID_UTILISATEUR_TEST, aujourdhui=date(2026, 2, 10))

    assert resultats == []


def test_trie_par_montant_decroissant(db):
    make_mouvement(db, date="2026-01-05", libelle="Petit abonnement", montant=-5.0)
    make_mouvement(db, date="2026-02-05", libelle="Petit abonnement", montant=-5.0)
    make_mouvement(db, date="2026-01-06", libelle="Gros abonnement", montant=-50.0)
    make_mouvement(db, date="2026-02-06", libelle="Gros abonnement", montant=-50.0)

    resultats = budget_recurrences_service.detect_recurrences(db, ID_UTILISATEUR_TEST, aujourdhui=date(2026, 2, 10))

    assert [r.libelle for r in resultats] == ["Gros abonnement", "Petit abonnement"]
