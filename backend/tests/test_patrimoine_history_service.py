"""Verrouille l'historique combiné du patrimoine (lentille Net/Brut/Financier sur
toute la page Synthèse) : `services/patrimoine_history_service.compute_patrimoine_history`.

Volontairement sans aucune `Transaction` dans ces tests : `compute_portfolio_history`
(poche financière) renvoie `[]` sans appel réseau tant qu'aucune position financière
n'existe (cf. son propre contrat) — ces tests portent donc uniquement sur la poche
manuelle/emprunts, rapides et déterministes. Les tests sur la part financière du mode
étagé (§ U.4) monkeypatchent directement `compute_portfolio_history`, même pattern que
`test_rapport_service_epargne.py::test_compute_rapport_periode_inclut_le_bloc_epargne`,
pour rester sans appel réseau."""

from datetime import datetime

from app.models import Loan
from app.services import detenteurs_service, historical_performance_service, historique_cache, immobilier_service, patrimoine_history_service

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


def test_ligne_epargne_interpolee_lineairement_entre_deux_points(db):
    """Backlog § U.2 (retour utilisateur 30/08/2026) : contrairement à l'immobilier
    ci-dessus (`test_serie_manuelle_locf_entre_deux_points`, en escalier), une ligne
    `TYPES_EPARGNE` est INTERPOLÉE entre deux points connus — la grille hebdomadaire
    démarre exactement au premier point ici (seule donnée du foyer), donc le point à
    J+7 (exactement à mi-chemin entre J+0 et J+14) doit valoir la moyenne des deux
    valeurs connues, pas la valeur du premier point plaquée platement."""
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1)
    immobilier_service.enregistrer_point_historique(db, holding.id, 1000.0, datetime(2024, 1, 1))
    immobilier_service.enregistrer_point_historique(db, holding.id, 1200.0, datetime(2024, 1, 15))

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    point_mi_chemin = next(p for p in points if p["date"] == "2024-01-08")
    assert point_mi_chemin["valeur_manuelle"] == 1100.0  # (1000 + 1200) / 2, pile à mi-chemin
    assert points[0]["valeur_manuelle"] == 1000.0  # au tout premier point, pas d'interpolation à faire
    assert points[-1]["valeur_manuelle"] == 1200.0  # plaqué au dernier point connu, jamais extrapolé au-delà


def test_immobilier_reste_en_escalier_meme_a_cote_dune_ligne_epargne_interpolee(db):
    """Garde-fou de non-régression : le choix interpolation/escalier se fait ligne
    par ligne selon `type_actif`, pas globalement dès qu'une ligne épargne existe
    dans le foyer."""
    bien = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0)
    av = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1)
    immobilier_service.enregistrer_point_historique(db, bien.id, 250000.0, datetime(2024, 1, 1))
    immobilier_service.enregistrer_point_historique(db, bien.id, 300000.0, datetime(2024, 1, 15))
    immobilier_service.enregistrer_point_historique(db, av.id, 1000.0, datetime(2024, 1, 1))
    immobilier_service.enregistrer_point_historique(db, av.id, 1200.0, datetime(2024, 1, 15))

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    point_mi_chemin = next(p for p in points if p["date"] == "2024-01-08")
    # 250000 (immobilier, encore plaqué au premier point) + 1100 (épargne, interpolée)
    assert point_mi_chemin["valeur_manuelle"] == 251100.0


def test_valeur_investie_ne_bouge_quaux_points_ou_un_versement_est_declare(db):
    """Backlog § U.4 (retour utilisateur 30/08/2026, mode étagé hors lentille
    Financier) : l'investi cumulé démarre à la valeur du tout premier point connu,
    puis ne progresse qu'aux points portant un `versement` explicitement déclaré
    (§ U.2) — un point sans versement déclaré est traité comme du gain pur, jamais
    ajouté à l'investi."""
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1)
    immobilier_service.enregistrer_point_historique(db, holding.id, 1000.0, datetime(2024, 1, 1))
    immobilier_service.enregistrer_point_historique(db, holding.id, 1300.0, datetime(2024, 2, 1), versement=250.0)
    immobilier_service.enregistrer_point_historique(db, holding.id, 1500.0, datetime(2024, 3, 1))  # pas de versement déclaré

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    point_avant_versement = next(p for p in points if p["date"] == "2024-01-01")
    point_apres_versement = next(p for p in points if p["date"] == "2024-02-05")
    point_final = points[-1]
    assert point_avant_versement["valeur_investie"] == 1000.0
    assert point_apres_versement["valeur_investie"] == 1250.0  # 1000 + 250 déclarés
    assert point_final["valeur_investie"] == 1250.0  # inchangé : le +200 de mars n'est pas déclaré, pur gain
    assert point_final["valeur_manuelle"] == 1500.0  # la valeur brute, elle, suit bien le dernier point connu


def test_valeur_investie_reste_en_escalier_meme_pour_une_ligne_epargne_interpolee(db):
    """Contrairement à la valeur brute (interpolée pour `TYPES_EPARGNE`, § U.2),
    l'investi reste TOUJOURS en escalier : un versement est un événement ponctuel,
    jamais une progression continue à lisser."""
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1)
    immobilier_service.enregistrer_point_historique(db, holding.id, 1000.0, datetime(2024, 1, 1))
    immobilier_service.enregistrer_point_historique(db, holding.id, 1200.0, datetime(2024, 1, 15), versement=200.0)

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    point_mi_chemin = next(p for p in points if p["date"] == "2024-01-08")
    assert point_mi_chemin["valeur_manuelle"] == 1100.0  # brute : interpolée à mi-chemin
    assert point_mi_chemin["valeur_investie"] == 1000.0  # investi : encore plaqué au premier point (escalier)


def test_ancrage_cout_dacquisition_definit_linvesti_initial(db):
    """Quand un coût d'acquisition (§ S.3) est connu et antérieur au premier point
    réel, l'investi part de `prix_revient_moyen` — pas de la valeur du premier point
    réel, qui peut déjà inclure une performance depuis l'achat."""
    holding = make_holding(
        db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, date_acquisition=datetime(2019, 1, 1)
    )
    immobilier_service.enregistrer_point_historique(db, holding.id, 250000.0, datetime(2024, 1, 1))  # pas de versement déclaré

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    assert points[0]["valeur_investie"] == 200000.0  # l'ancrage, pas 250000
    assert points[-1]["valeur_investie"] == 200000.0  # la hausse de 2024 n'est pas déclarée : pur gain
    assert points[-1]["valeur_manuelle"] == 250000.0


def test_valeur_investie_combine_poche_financiere_et_manuelle(db, monkeypatch):
    """L'investi total (§ U.4) additionne la part financière (grand livre de
    transactions, inchangée) et la part manuelle (versements déclarés)."""
    monkeypatch.setattr(
        historical_performance_service,
        "compute_portfolio_history",
        lambda db_, user_id_: [
            {"date": "2024-01-01", "valeur_portefeuille": 5000.0, "valeur_investie": 4000.0, "valeur_realisee_cumulee": 100.0},
        ],
    )
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1)
    immobilier_service.enregistrer_point_historique(db, holding.id, 1000.0, datetime(2024, 1, 1))

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    dernier = points[-1]
    assert dernier["valeur_investie"] == 5000.0  # 4000 (financier) + 1000 (manuel, premier point)
    assert dernier["valeur_realisee_cumulee"] == 100.0  # exclusivement financier


def test_valeur_investie_nette_est_nettee_des_passifs(db):
    """Retour utilisateur (31/08/2026) : le mode étagé Net comparait `patrimoine_net`
    (déjà netté des emprunts) à `valeur_investie` BRUTE (jamais nettée) — la dette était
    ainsi soustraite deux fois, sous-comptant massivement les gains d'un bien financé à
    crédit. `valeur_investie_nette = valeur_investie - passifs_totaux` (même netting
    global que `patrimoine_net`) restaure l'invariant attendu : Gains (portefeuille +
    réalisé − investi) doit valoir EXACTEMENT le même montant en Brut et en Net, la
    dette ne déplaçant jamais une performance d'investissement, seulement le capital
    investi affiché."""
    h = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=300000.0, valeur_estimee=300000.0)
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
            capital_initial=250000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            capital_restant_du_manuel=250000.0,
            holding_id=h.id,
        )
    )
    db.commit()

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    dernier = points[-1]
    assert dernier["valeur_investie"] == 300000.0  # ancrage sur le coût d'acquisition, jamais nettée
    assert dernier["passifs_totaux"] == 250000.0
    assert dernier["valeur_investie_nette"] == 50000.0  # 300000 - 250000

    gains_brut = dernier["actifs_totaux"] + dernier["valeur_realisee_cumulee"] - dernier["valeur_investie"]
    gains_net = dernier["patrimoine_net"] + dernier["valeur_realisee_cumulee"] - dernier["valeur_investie_nette"]
    assert gains_brut == gains_net  # l'invariant : la dette ne crée/ne détruit jamais de gain


def test_valeur_realisee_cumulee_reste_exclusivement_financiere(db):
    """Aucun équivalent « réalisé » pour une ligne manuelle — jamais de contribution
    de la poche manuelle à `valeur_realisee_cumulee`, même avec un historique riche."""
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1)
    immobilier_service.enregistrer_point_historique(db, holding.id, 1000.0, datetime(2024, 1, 1))
    immobilier_service.enregistrer_point_historique(db, holding.id, 1500.0, datetime(2024, 2, 1), versement=100.0)

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    assert all(p["valeur_realisee_cumulee"] == 0.0 for p in points)


def test_valeur_investie_scoping_detenteur(db):
    holding = make_holding(db, ticker="AV1", type_actif="LIFE_INSURANCE", quantite=1)
    immobilier_service.enregistrer_point_historique(db, holding.id, 1000.0, datetime(2024, 1, 1))
    immobilier_service.enregistrer_point_historique(db, holding.id, 1300.0, datetime(2024, 2, 1), versement=300.0)
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")
    bob = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Bob", "personne")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, holding, [(alice.id, 100.0)])

    points_foyer = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)
    points_alice = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST, detenteur_id=alice.id)
    points_bob = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST, detenteur_id=bob.id)

    assert points_alice[-1]["valeur_investie"] == points_foyer[-1]["valeur_investie"] == 1300.0
    assert points_bob[-1]["valeur_investie"] == 0.0


def test_serie_manuelle_sans_historique_degrade_vers_valeur_estimee_a_plat(db):
    """Une ligne créée directement (comme une ligne pré-existant à l'auto-horodatage
    de `routers/portfolio.py`) n'a aucun point `HoldingValuationHistory` — dégrade
    avec grâce vers une ligne plate à `valeur_estimee`, jamais 0 ni une exception."""
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    assert points
    assert all(p["valeur_manuelle"] == 250000.0 for p in points)


def test_serie_manuelle_ancree_sur_le_cout_dacquisition_avant_le_premier_point_connu(db):
    """Retour utilisateur (26/08/2026) : une date d'acquisition antérieure au premier
    point d'historique connu ancre la courbe sur `prix_revient_moyen` (coût
    d'acquisition) à cette date, plutôt que de démarrer artificiellement tard."""
    holding = make_holding(
        db,
        ticker="MAISON",
        type_actif="REAL_ESTATE",
        quantite=1,
        prix_revient_moyen=200000.0,
        valeur_estimee=300000.0,
        date_acquisition=datetime(2019, 1, 1),
    )
    immobilier_service.enregistrer_point_historique(db, holding.id, 300000.0, datetime(2024, 6, 1))

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    avant_2024 = [p for p in points if p["date"] < "2024-06-01"]
    apres_2024 = [p for p in points if p["date"] >= "2024-06-01"]
    assert avant_2024 and apres_2024
    assert points[0]["date"] == "2019-01-01"
    assert all(p["valeur_manuelle"] == 200000.0 for p in avant_2024)
    assert all(p["valeur_manuelle"] == 300000.0 for p in apres_2024)


def test_serie_manuelle_ignore_la_date_dacquisition_si_posterieure_au_premier_point_connu(db):
    """Une date d'acquisition plus RÉCENTE que le premier point d'historique connu ne
    doit jamais raccourcir la série ni écraser une donnée déjà plus ancienne et plus
    fiable."""
    holding = make_holding(
        db,
        ticker="MAISON",
        type_actif="REAL_ESTATE",
        quantite=1,
        prix_revient_moyen=200000.0,
        valeur_estimee=300000.0,
        date_acquisition=datetime(2024, 6, 1),
    )
    immobilier_service.enregistrer_point_historique(db, holding.id, 250000.0, datetime(2020, 1, 1))

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    assert points[0]["date"] == "2020-01-01"
    assert points[0]["valeur_manuelle"] == 250000.0


def test_serie_manuelle_ancree_sur_le_cout_dacquisition_sans_aucun_historique_ni_valeur(db):
    """Cas dégradé : ni `HoldingValuationHistory` ni `valeur_estimee`, mais une date
    d'acquisition et un prix de revient suffisent à donner un point de départ."""
    make_holding(
        db,
        ticker="MAISON",
        type_actif="REAL_ESTATE",
        quantite=1,
        prix_revient_moyen=200000.0,
        valeur_estimee=None,
        date_acquisition=datetime(2019, 1, 1),
    )

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    assert points
    assert points[0]["date"] == "2019-01-01"
    assert all(p["valeur_manuelle"] == 200000.0 for p in points)


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


def test_cache_ecrit_avec_un_schema_anterieur_est_ignore_et_recalcule(db):
    """Reproduit le bug constaté le 30/08/2026 : une entrée de cache écrite AVANT
    l'ajout de valeur_investie/valeur_realisee_cumulee à PatrimoineHistoryPoint (§ U.4)
    était servie telle quelle (moins de 24h), provoquant une erreur de validation
    Pydantic sur la réponse de l'API — graphique vide en lentille Net/Brut."""
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    ancien_point = {
        "date": "2026-01-01",
        "valeur_financiere": 0.0,
        "valeur_manuelle": 250000.0,
        "actifs_totaux": 250000.0,
        "passifs_totaux": 0.0,
        "patrimoine_net": 250000.0,
        "patrimoine_financier": 0.0,
    }
    historique_cache.ecrire(db, cle, [ancien_point])

    points = patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)

    assert points
    assert "valeur_investie" in points[0]
    assert "valeur_realisee_cumulee" in points[0]


def test_invalidation_purge_le_cache(db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    patrimoine_history_service.compute_patrimoine_history(db, ID_UTILISATEUR_TEST)
    cle = historique_cache.cle_historique_patrimoine(ID_UTILISATEUR_TEST)
    assert historique_cache.lire(db, cle) is not None

    historique_cache.invalider_historiques_patrimoine(db)

    assert historique_cache.lire(db, cle) is None
