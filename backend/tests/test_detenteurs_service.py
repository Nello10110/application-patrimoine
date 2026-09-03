"""Verrouille les détenteurs et quotités (backlog 2.L.1) :
`services/detenteurs_service.py`."""

from datetime import datetime

import pytest

from app.models import Holding, Loan
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


def test_compute_parts_somme_le_crd_de_plusieurs_emprunts_sur_le_meme_bien(db):
    """`Loan.holding_id` n'est pas unique : un bien peut porter plusieurs emprunts
    (ex. prêt principal + prêt travaux). `compute_parts` doit déduire le CRD de
    CHACUN, pas seulement du premier trouvé (même règle que
    `patrimoine_service._crd_par_ligne`)."""
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 100.0)])
    for capital_restant_du_manuel in (100000.0, 50000.0):
        db.add(
            Loan(
                user_id=ID_UTILISATEUR_TEST,
                libelle="Crédit",
                capital_initial=capital_restant_du_manuel,
                taux_annuel_pct=0.0,
                mensualite=1000.0,
                date_debut=datetime(2020, 1, 1),
                duree_mois=200,
                capital_restant_du_manuel=capital_restant_du_manuel,
                holding_id=h.id,
            )
        )
    db.commit()

    parts = detenteurs_service.compute_parts(db, h, 500000.0)

    # part_nette = 500000 - (100000 + 50000) = 350000, pas 500000 - 100000 = 400000.
    assert parts[alice.id]["part_nette"] == 350000.0


def test_delete_detenteur_supprime_ses_quotites_en_cascade(db):
    h = make_holding(db)
    alice = make_detenteur(db, "Alice")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 100.0)])

    detenteurs_service.delete_detenteur(db, alice)

    # Le holding lui-même n'est pas touché, mais il n'a plus aucune répartition.
    assert detenteurs_service.compute_parts(db, h, 1000.0) == {}


# --- compute_parts_bulk (revue du 03/09/2026) -----------------------------------


def test_compute_parts_bulk_donne_exactement_le_meme_resultat_que_ligne_a_ligne(db):
    """LE test qui compte pour cette optimisation. `compute_parts_bulk` a été
    introduite pour remplacer N appels à `compute_parts` ; si les deux divergeaient,
    ne serait-ce que d'un arrondi, la même ligne afficherait deux montants
    différents selon l'écran qui la demande.

    On couvre volontairement les cas tordus : plusieurs emprunts sur un même bien,
    un emprunt avec ses propres quotités (qui priment) et un autre sans (qui hérite
    de celles de l'actif), et une ligne sans aucune quotité."""
    d1 = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Bulk Alice", "personne")
    d2 = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Bulk Bob", "personne")

    reparti = make_holding(db, ticker="REPARTI", quantite=1, prix_revient_moyen=100_000.0)
    non_reparti = make_holding(db, ticker="NONREPARTI", quantite=1, prix_revient_moyen=50_000.0)
    detenteurs_service.set_quotites_holding(
        db, ID_UTILISATEUR_TEST, reparti, [(d1.id, 60.0), (d2.id, 40.0)]
    )

    # Deux emprunts sur le même bien : l'un hérite des quotités de l'actif, l'autre
    # a les siennes.
    herite = Loan(
        user_id=ID_UTILISATEUR_TEST, libelle="Hérité", holding_id=reparti.id, capital_initial=40_000.0,
        taux_annuel_pct=1.5, mensualite=300.0, date_debut=datetime(2024, 1, 1), duree_mois=180,
        capital_restant_du_manuel=30_000.0,
    )
    propre = Loan(
        user_id=ID_UTILISATEUR_TEST, libelle="Propre", holding_id=reparti.id, capital_initial=20_000.0,
        taux_annuel_pct=2.0, mensualite=200.0, date_debut=datetime(2024, 1, 1), duree_mois=120,
        capital_restant_du_manuel=10_000.0,
    )
    db.add_all([herite, propre])
    db.commit()
    detenteurs_service.set_quotites_loan(
        db, ID_UTILISATEUR_TEST, propre, [(d1.id, 100.0)]
    )

    couples = [(reparti, 100_000.0), (non_reparti, 50_000.0)]
    groupe = detenteurs_service.compute_parts_bulk(db, couples)
    ligne_a_ligne = {h.id: detenteurs_service.compute_parts(db, h, v) for h, v in couples}

    # Une ligne sans quotité est absente du groupé et rend `{}` en unitaire :
    # `.get(id, {})` doit réconcilier les deux exactement.
    for holding, _ in couples:
        assert groupe.get(holding.id, {}) == ligne_a_ligne[holding.id], f"divergence sur {holding.ticker}"

    # Et le résultat n'est pas vide, sinon le test ne prouverait rien.
    assert groupe[reparti.id][d1.id]["part_detenue"] == 60_000.0
    assert groupe.get(non_reparti.id, {}) == {}


def test_compute_parts_bulk_ne_fait_pas_de_requete_par_ligne(db):
    """Le point de la manœuvre : un nombre de requêtes constant. Mesuré avant
    correctif sur base réelle : 207 requêtes pour 51 lignes."""
    from sqlalchemy import event

    d1 = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Compteur Alice", "personne")
    couples = []
    for i in range(12):
        h = make_holding(db, ticker=f"BULK{i}", quantite=1, prix_revient_moyen=1000.0)
        detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(d1.id, 100.0)])
        couples.append((h, 1000.0))

    # Le vrai appelant (`patrimoine_service`) charge ses lignes puis appelle
    # aussitôt : on reproduit cet état. Sans ce rechargement, les objets expirés par
    # les `commit()` de la préparation feraient compter un SELECT par accès à `.id`,
    # qui n'existe pas dans le flux réel.
    db.expire_all()
    couples = [(h, v) for h, v in zip(db.query(Holding).filter(Holding.ticker.like("BULK%")).all(), [1000.0] * 12, strict=False)]

    compteur = {"n": 0}

    def _compter(conn, cursor, stmt, params, ctx, many):
        compteur["n"] += 1

    event.listen(db.get_bind(), "before_cursor_execute", _compter)
    try:
        detenteurs_service.compute_parts_bulk(db, couples)
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", _compter)

    assert compteur["n"] <= 3, f"{compteur['n']} requêtes pour 12 lignes — le préchargement ne fonctionne plus"
