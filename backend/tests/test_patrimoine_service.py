"""Verrouille le patrimoine net global (Phase 1 de `docs/ROADMAP.md`) :
`services/patrimoine_service.compute_patrimoine_net` — actifs (portefeuille financier
+ immobilier/SCPI/assurance-vie/PER) moins passifs (emprunts)."""

from datetime import datetime

from app.models import Loan
from app.services import detenteurs_service, patrimoine_service

from .conftest import ID_UTILISATEUR_TEST, make_holding


def test_actifs_totaux_couvre_le_portefeuille_financier_et_le_patrimoine_manuel(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    # AAA sans cours en base : valorisée à son coût de revient (1000 €), comme
    # `analysis_service.value_holdings` le fait déjà pour toute ligne sans cotation.
    assert resultat["actifs_totaux"] == 1000.0 + 250000.0


def test_passifs_totaux_somme_les_emprunts(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
    db.add(Loan(user_id=ID_UTILISATEUR_TEST, libelle="Prêt A", capital_initial=50000.0, taux_annuel_pct=0.0, mensualite=1000.0, date_debut=datetime(2020, 1, 1), duree_mois=60, capital_restant_du_manuel=30000.0))
    db.add(Loan(user_id=ID_UTILISATEUR_TEST, libelle="Prêt B", capital_initial=20000.0, taux_annuel_pct=0.0, mensualite=500.0, date_debut=datetime(2020, 1, 1), duree_mois=40, capital_restant_du_manuel=5000.0))
    db.commit()

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    assert resultat["passifs_totaux"] == 35000.0


def test_patrimoine_net_est_actifs_moins_passifs(db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    db.add(Loan(user_id=ID_UTILISATEUR_TEST, libelle="Crédit immo", capital_initial=200000.0, taux_annuel_pct=0.0, mensualite=1000.0, date_debut=datetime(2020, 1, 1), duree_mois=200, capital_restant_du_manuel=120000.0))
    db.commit()

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    assert resultat["actifs_totaux"] == 300000.0
    assert resultat["passifs_totaux"] == 120000.0
    assert resultat["patrimoine_net"] == 180000.0


def test_repartition_par_classe_groupe_par_type_actif_avec_libelles_francais(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
    make_holding(db, ticker="BBB", type_actif="STOCK", quantite=1, prix_revient_moyen=500.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=100000.0, valeur_estimee=150000.0)
    make_holding(db, ticker="SANS_TYPE", type_actif=None, quantite=1, prix_revient_moyen=200.0)

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    par_categorie = {item["categorie"]: item["valeur"] for item in resultat["repartition_par_classe"]}
    assert par_categorie["Actions"] == 1500.0
    assert par_categorie["Immobilier"] == 150000.0
    assert par_categorie["Non renseigné"] == 200.0
    # Triée par valeur décroissante — l'immobilier (150000) doit passer avant les
    # actions (1500), elles-mêmes avant la catégorie non renseignée (200).
    categories_triees = [item["categorie"] for item in resultat["repartition_par_classe"]]
    assert categories_triees == ["Immobilier", "Actions", "Non renseigné"]


def test_repartition_par_classe_omet_les_categories_a_valeur_nulle(db):
    make_holding(db, ticker="PE", type_actif="PRIVATE_FUND", quantite=1, prix_revient_moyen=0.0)

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    assert resultat["repartition_par_classe"] == []


def test_aucune_donnee_renvoie_des_totaux_nuls(db):
    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    assert resultat == {
        "actifs_totaux": 0,
        "passifs_totaux": 0,
        "patrimoine_net": 0,
        "patrimoine_financier": 0,
        "repartition_par_classe": [],
        "repartition_par_classe_financiere": [],
        "repartition_par_classe_nette": [],
    }


def test_patrimoine_financier_exclut_le_patrimoine_manuel(db):
    """Lentille "financier" (backlog 2.K.3) : réutilise `holdings_financiers`, qui
    exclut déjà immobilier/SCPI/assurance-vie/PER partout ailleurs dans l'app."""
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    assert resultat["actifs_totaux"] == 1000.0 + 250000.0
    assert resultat["patrimoine_financier"] == 1000.0


def test_repartition_par_classe_financiere_exclut_le_patrimoine_manuel(db):
    """Feature Net/Brut/Financier sur toute la page Synthèse : le camembert/liste en
    lentille "financier" doit filtrer aux seules catégories financières, sans deviner
    la frontière depuis le libellé côté frontend."""
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="BBB", type_actif="FUND", quantite=1, prix_revient_moyen=500.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    par_categorie = {item["categorie"]: item["valeur"] for item in resultat["repartition_par_classe_financiere"]}
    assert par_categorie == {"Actions": 1000.0, "ETF / Fonds": 500.0}
    # La répartition tous-actifs, elle, garde l'immobilier — les deux champs coexistent.
    assert "Immobilier" in {item["categorie"] for item in resultat["repartition_par_classe"]}


def test_repartition_par_classe_financiere_filtree_par_detenteur(db):
    h_action = make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h_action, [(alice.id, 100.0)])

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST, detenteur_id=alice.id)

    par_categorie = {item["categorie"]: item["valeur"] for item in resultat["repartition_par_classe_financiere"]}
    assert par_categorie == {"Actions": 1000.0}


# ---------------------------------------------------------------------------
# Lentille "net" du camembert/liste : chaque ligne nettée de SON emprunt rattaché
# (retour utilisateur : l'actif net d'un bien, c'est sa valeur moins ce qu'il reste à
# rembourser à la banque dessus, pas la valeur brute du bien)
# ---------------------------------------------------------------------------


def test_repartition_par_classe_nette_soustrait_lemprunt_rattache_a_sa_propre_ligne(db):
    h = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)  # 1000, sans emprunt
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
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

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    par_categorie = {item["categorie"]: item["valeur"] for item in resultat["repartition_par_classe_nette"]}
    # Immobilier : 300000 - 120000 (son propre emprunt). Actions : 1000, jamais touché
    # (aucun emprunt qui lui est rattaché) — comportement "brut" inchangé pour cette ligne.
    assert par_categorie == {"Immobilier": 180000.0, "Actions": 1000.0}
    # La somme correspond toujours exactement au patrimoine net global.
    assert sum(par_categorie.values()) == resultat["patrimoine_net"]


def test_repartition_par_classe_nette_peut_etre_negative_si_lemprunt_depasse_la_valeur(db):
    """Jamais masqué ni clampé à 0 — une équité négative reste une donnée réelle."""
    h = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=100000.0)
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
            capital_initial=200000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            capital_restant_du_manuel=150000.0,
            holding_id=h.id,
        )
    )
    db.commit()

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    par_categorie = {item["categorie"]: item["valeur"] for item in resultat["repartition_par_classe_nette"]}
    assert par_categorie == {"Immobilier": -50000.0}


def test_repartition_par_classe_nette_bucket_dettes_non_rattachees(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)  # 1000
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Prêt perso",
            capital_initial=10000.0,
            taux_annuel_pct=0.0,
            mensualite=500.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            capital_restant_du_manuel=8000.0,
        )
    )
    db.commit()

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    par_categorie = {item["categorie"]: item["valeur"] for item in resultat["repartition_par_classe_nette"]}
    assert par_categorie == {"Actions": 1000.0, "Dettes non rattachées": -8000.0}
    assert sum(par_categorie.values()) == resultat["patrimoine_net"]


def test_repartition_par_classe_nette_detenteur_reutilise_part_nette(db):
    h = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
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
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 100.0)])

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST, detenteur_id=alice.id)

    par_categorie = {item["categorie"]: item["valeur"] for item in resultat["repartition_par_classe_nette"]}
    assert par_categorie == {"Immobilier": 180000.0}
    assert par_categorie["Immobilier"] == resultat["patrimoine_net"]


# ---------------------------------------------------------------------------
# Filtre détenteur (backlog 2.L.1/2.K.3)
# ---------------------------------------------------------------------------


def test_detenteur_id_none_reproduit_exactement_la_vue_foyer(db):
    """Non-régression explicite : le comportement par défaut (aucun filtre) ne doit
    strictement rien changer, même après l'ajout du paramètre `detenteur_id`."""
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    db.add(Loan(user_id=ID_UTILISATEUR_TEST, libelle="Prêt", capital_initial=50000.0, taux_annuel_pct=0.0, mensualite=1000.0, date_debut=datetime(2020, 1, 1), duree_mois=60, capital_restant_du_manuel=30000.0))
    db.commit()

    sans_filtre = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)
    avec_filtre_explicite = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST, detenteur_id=None)

    assert sans_filtre == avec_filtre_explicite


def test_actif_non_reparti_est_invisible_dans_la_vue_dun_detenteur(db):
    """Un actif jamais réparti reste 100 % foyer implicite (K.1/L.1) — il n'apparaît
    dans la vue d'AUCUN détenteur individuel, seulement dans la vue foyer."""
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")

    resultat = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST, detenteur_id=alice.id)

    assert resultat == {
        "actifs_totaux": 0,
        "passifs_totaux": 0,
        "patrimoine_net": 0,
        "patrimoine_financier": 0,
        "repartition_par_classe": [],
        "repartition_par_classe_financiere": [],
        "repartition_par_classe_nette": [],
    }


def test_detenteur_id_filtre_a_la_part_de_ce_detenteur(db):
    h = make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=300000.0)
    loan = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Crédit immo",
        capital_initial=200000.0,
        taux_annuel_pct=0.0,
        mensualite=1000.0,
        date_debut=datetime(2020, 1, 1),
        duree_mois=200,
        capital_restant_du_manuel=120000.0,
        holding_id=h.id,
    )
    db.add(loan)
    db.commit()
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")
    bob = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Bob", "personne")
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 50.0), (bob.id, 50.0)])

    vue_alice = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST, detenteur_id=alice.id)
    vue_foyer = patrimoine_service.compute_patrimoine_net(db, ID_UTILISATEUR_TEST)

    assert vue_alice["actifs_totaux"] == 150000.0  # 50 % de 300000
    assert vue_alice["passifs_totaux"] == 60000.0  # 50 % de 120000
    assert vue_alice["patrimoine_net"] == 90000.0
    # Alice + Bob (parts symétriques ici) reconstituent exactement la vue foyer.
    assert vue_alice["patrimoine_net"] * 2 == vue_foyer["patrimoine_net"]


class TestExpositionConsolidee:
    """Backlog 2.P.1 : `patrimoine_service.compute_exposition_consolidee`."""

    def test_repartition_classe_couvre_tous_les_types(self, db):
        make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
        make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=200000.0)

        resultat = patrimoine_service.compute_exposition_consolidee(db, ID_UTILISATEUR_TEST)

        par_nom = {item["categorie"]: item["valeur"] for item in resultat["repartition_classe"]}
        assert par_nom["Actions"] == 1000.0
        assert par_nom["Immobilier"] == 200000.0
        assert resultat["valeur_totale"] == 201000.0

    def test_repartition_geo_utilise_zone_geo_pour_le_manuel_defaut_europe(self, db):
        make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=200000.0)

        resultat = patrimoine_service.compute_exposition_consolidee(db, ID_UTILISATEUR_TEST)

        par_zone = {item["categorie"]: item["valeur"] for item in resultat["repartition_geo"]}
        assert par_zone["Europe"] == 200000.0

    def test_repartition_geo_respecte_zone_geo_explicite(self, db):
        make_holding(
            db, ticker="APPART_US", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=100000.0, valeur_estimee=100000.0, zone_geo="Amérique du Nord"
        )

        resultat = patrimoine_service.compute_exposition_consolidee(db, ID_UTILISATEUR_TEST)

        par_zone = {item["categorie"]: item["valeur"] for item in resultat["repartition_geo"]}
        assert par_zone["Amérique du Nord"] == 100000.0
        assert "Europe" not in par_zone

    def test_concentration_plus_grosse_ligne_et_top5(self, db):
        make_holding(db, ticker="GROS", type_actif="STOCK", quantite=1, prix_revient_moyen=6000.0)
        make_holding(db, ticker="PETIT1", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
        make_holding(db, ticker="PETIT2", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
        make_holding(db, ticker="PETIT3", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
        make_holding(db, ticker="PETIT4", type_actif="STOCK", quantite=1, prix_revient_moyen=500.0)
        make_holding(db, ticker="PETIT5", type_actif="STOCK", quantite=1, prix_revient_moyen=500.0)

        resultat = patrimoine_service.compute_exposition_consolidee(db, ID_UTILISATEUR_TEST)

        # Total = 10000. Plus grosse ligne = 6000 (60%). Top5 = 6000+1000+1000+1000+500 = 9500 (95%).
        assert resultat["plus_grosse_ligne_ticker"] == "GROS"
        assert resultat["plus_grosse_ligne_pct"] == 60.0
        assert resultat["top5_lignes_pct"] == 95.0

    def test_part_estimee_manuelle_pct(self, db):
        make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)  # 1000
        make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=9000.0, valeur_estimee=9000.0)  # 9000

        resultat = patrimoine_service.compute_exposition_consolidee(db, ID_UTILISATEUR_TEST)

        assert resultat["part_estimee_manuelle_pct"] == 90.0

    def test_portefeuille_vide(self, db):
        resultat = patrimoine_service.compute_exposition_consolidee(db, ID_UTILISATEUR_TEST)

        assert resultat["valeur_totale"] == 0.0
        assert resultat["repartition_geo"] == []
        assert resultat["repartition_classe"] == []
        assert resultat["plus_grosse_ligne_ticker"] is None
        assert resultat["part_estimee_manuelle_pct"] == 0.0
