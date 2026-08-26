"""Verrouille l'historique combiné du patrimoine (lentille Net/Brut/Financier sur
toute la page Synthèse) : `services/patrimoine_history_service.compute_patrimoine_history`.

Volontairement sans aucune `Transaction` dans ces tests : `compute_portfolio_history`
(poche financière) renvoie `[]` sans appel réseau tant qu'aucune position financière
n'existe (cf. son propre contrat) — ces tests portent donc uniquement sur la poche
manuelle/emprunts, rapides et déterministes."""

from datetime import datetime

from app.models import Loan
from app.services import detenteurs_service, historique_cache, immobilier_service, patrimoine_history_service

from .conftest import ID_UTILISATEUR_TEST, make_holding


def test_aucune_donnee_renvoie_liste_vide(db):
    assert patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST) == []


def test_serie_manuelle_locf_entre_deux_points(db):
    holding = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 250000.0, datetime(2024, 1, 1))
    immobilier_service.enregistrer_point_historique(db, holding.id, 300000.0, datetime(2024, 6, 1))

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    avant_juin = [p for p in points if p["date"] < "2024-06-01"]
    apres_juin = [p for p in points if p["date"] >= "2024-06-01"]
    assert avant_juin and apres_juin
    assert all(p["valeur_manuelle"] == 250000.0 for p in avant_juin)
    assert all(p["valeur_manuelle"] == 300000.0 for p in apres_juin)
    # Aucune transaction financière dans ces tests : la poche financière reste à 0.
    assert all(p["valeur_financiere"] == 0.0 for p in points)


def test_serie_manuelle_sans_historique_degrade_vers_valeur_estimee_a_plat(db):
    """Une ligne créée directement (comme une ligne pré-existant à l'auto-horodatage
    de `routers/portfolio.py`) n'a aucun point `HoldingValuationHistory` — dégrade
    avec grâce vers une ligne plate à `valeur_estimee`, jamais 0 ni une exception."""
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    assert points
    assert all(p["valeur_manuelle"] == 250000.0 for p in points)


def test_emprunt_ne_contribue_pas_avant_sa_date_de_debut(db):
    """Contrairement au contrat de `compute_capital_restant_du_theorique` (qui
    renverrait `capital_initial` pour toute date <= `date_debut`), une dette qui
    n'existait pas encore ne doit jamais apparaître dans la série historique."""
    holding = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 300000.0, datetime(2020, 1, 1))
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
            capital_initial=200000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2022, 1, 1),
            duree_mois=200,
            holding_id=holding.id,
        )
    )
    db.commit()

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    avant_pret = [p for p in points if p["date"] < "2022-01-01"]
    apres_pret = [p for p in points if p["date"] >= "2022-01-01"]
    assert avant_pret and apres_pret
    assert all(p["passifs_totaux"] == 0.0 for p in avant_pret)
    assert apres_pret[0]["passifs_totaux"] == 200000.0


def test_emprunt_recalage_manuel_theorique_avant_gele_apres(db):
    holding = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 300000.0, datetime(2020, 1, 1))
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
            capital_initial=200000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            holding_id=holding.id,
            capital_restant_du_manuel=150000.0,
            derniere_maj_manuelle=datetime(2023, 1, 1),
        )
    )
    db.commit()

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    avant_recalage = [p for p in points if p["date"] < "2023-01-01"]
    apres_recalage = [p for p in points if p["date"] >= "2023-01-01"]
    assert avant_recalage and apres_recalage
    # Amortissement théorique (0 %, mensualité 1000) : au plus 36 mois écoulés avant
    # 2023-01-01, donc jamais descendu jusqu'à 150000 (atteint au 50e mois).
    assert all(p["passifs_totaux"] != 150000.0 for p in avant_recalage)
    assert all(p["passifs_totaux"] == 150000.0 for p in apres_recalage)


def test_detenteur_id_scoping_ligne_manuelle_et_emprunt_rattache_herite(db):
    holding = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 300000.0, datetime(2020, 1, 1))
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
            capital_initial=200000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            holding_id=holding.id,
            capital_restant_du_manuel=120000.0,
        )
    )
    db.commit()
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")
    bob = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Bob", "personne")
    # Alice possède 100 % de l'actif ; aucune quotité d'emprunt explicite -> hérite de
    # celle de l'actif (même règle que `detenteurs_service.compute_parts`).
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, holding, [(alice.id, 100.0)])

    points_foyer = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)
    points_alice = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST, detenteur_id=alice.id)
    points_bob = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST, detenteur_id=bob.id)

    assert points_alice[-1]["valeur_manuelle"] == points_foyer[-1]["valeur_manuelle"]
    assert points_alice[-1]["passifs_totaux"] == points_foyer[-1]["passifs_totaux"]
    # Bob n'a aucune quotité sur cette ligne : invisible dans sa propre vue.
    assert points_bob[-1]["valeur_manuelle"] == 0.0
    assert points_bob[-1]["passifs_totaux"] == 0.0


def test_emprunt_non_rattache_invisible_pour_un_detenteur_individuel(db):
    """Même règle que `detenteurs_service.compute_parts` : un emprunt sans actif
    rattaché n'a aucun cas d'usage par détenteur individuel, seulement la vue foyer."""
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Prêt perso",
            capital_initial=10000.0,
            taux_annuel_pct=0.0,
            mensualite=500.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=20,
        )
    )
    db.commit()
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")

    points_foyer = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)
    points_alice = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST, detenteur_id=alice.id)

    # Premier point de la grille = `date_debut` du prêt : capital initial encore dû
    # côté foyer (le prêt est peut-être déjà théoriquement soldé "aujourd'hui", vu la
    # courte durée choisie ici — pas ce que ce test vérifie).
    assert points_foyer[0]["passifs_totaux"] == 10000.0
    assert points_alice and all(p["passifs_totaux"] == 0.0 for p in points_alice)


def test_cache_sert_le_meme_resultat_sans_recalcul(db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    premier = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)
    deuxieme = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    assert premier == deuxieme
    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    assert historique_cache.lire(db, cle) == premier


def test_invalidation_purge_le_cache(db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)
    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    assert historique_cache.lire(db, cle) is not None

    historique_cache.invalider_historiques_patrimoine(db)

    assert historique_cache.lire(db, cle) is None
