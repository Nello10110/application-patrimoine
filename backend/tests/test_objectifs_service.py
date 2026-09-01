"""Verrouille les objectifs suivis et les indicateurs de situation (backlog
2.O.1/2.O.2) : `services/objectifs_service.py`."""

from datetime import datetime, timedelta, timezone

import pytest

from app.models import Loan, MouvementBancaire, Objectif, ObjectifActif, ObjectifContributeur
from app.services import budget_categories_service, detenteurs_service, objectifs_service

from .conftest import ID_UTILISATEUR_TEST, make_holding


def make_objectif(db, holdings=None, detenteurs=None, jours_ecoules=0, **overrides):
    defaults = dict(
        user_id=ID_UTILISATEUR_TEST,
        nom="Apport immobilier",
        type="immobilier",
        montant_cible=50000.0,
        echeance="2030-01-01",
        rendement_hypothese_pct=0.0,
        valeur_a_la_creation=0.0,
    )
    defaults.update(overrides)
    objectif = Objectif(**defaults)
    objectif.created_at = datetime.now(timezone.utc) - timedelta(days=jours_ecoules)
    db.add(objectif)
    db.commit()
    db.refresh(objectif)
    for h in holdings or []:
        db.add(ObjectifActif(objectif_id=objectif.id, holding_id=h.id))
    for d in detenteurs or []:
        db.add(ObjectifContributeur(objectif_id=objectif.id, detenteur_id=d.id))
    db.commit()
    return objectif


class TestCrud:
    def test_create_objectif_snapshotte_la_valeur_actuelle_des_actifs_rattaches(self, db):
        h = make_holding(db, ticker="LIVRETX", quantite=1, prix_revient_moyen=5000.0, type_actif="REGULATED_SAVINGS", valeur_estimee=5000.0)

        objectif = objectifs_service.create_objectif(
            db, ID_UTILISATEUR_TEST, "Précaution", "precaution", 10000.0, "2028-01-01", 0.0, [h.id], []
        )

        assert objectif.valeur_a_la_creation == 5000.0

    def test_create_objectif_type_inconnu_leve(self, db):
        with pytest.raises(ValueError, match="Type"):
            objectifs_service.create_objectif(db, ID_UTILISATEUR_TEST, "X", "invalide", 1000.0, "2028-01-01", 0.0, [], [])

    def test_create_objectif_holding_dun_autre_foyer_leve(self, db):
        h = make_holding(db, user_id=999, ticker="INTRUS")
        with pytest.raises(ValueError, match="introuvables"):
            objectifs_service.create_objectif(db, ID_UTILISATEUR_TEST, "X", "personnalise", 1000.0, "2028-01-01", 0.0, [h.id], [])

    def test_create_objectif_detenteur_dun_autre_foyer_leve(self, db):
        d = detenteurs_service.create_detenteur(db, user_id=999, nom="Intrus", type_="personne")
        with pytest.raises(ValueError, match="introuvables"):
            objectifs_service.create_objectif(db, ID_UTILISATEUR_TEST, "X", "personnalise", 1000.0, "2028-01-01", 0.0, [], [d.id])

    def test_list_et_delete_objectif(self, db):
        objectif = objectifs_service.create_objectif(db, ID_UTILISATEUR_TEST, "X", "personnalise", 1000.0, "2028-01-01", 0.0, [], [])
        assert len(objectifs_service.list_objectifs(db, ID_UTILISATEUR_TEST)) == 1

        objectifs_service.delete_objectif(db, ID_UTILISATEUR_TEST, objectif.id)
        assert objectifs_service.list_objectifs(db, ID_UTILISATEUR_TEST) == []

    def test_delete_objectif_dun_autre_foyer_leve(self, db):
        objectif = objectifs_service.create_objectif(db, ID_UTILISATEUR_TEST, "X", "personnalise", 1000.0, "2028-01-01", 0.0, [], [])
        with pytest.raises(ValueError, match="introuvable"):
            objectifs_service.delete_objectif(db, 999, objectif.id)


class TestDiagnosticEtTrajectoire:
    def test_objectif_atteint(self, db):
        h = make_holding(db, ticker="ATT", quantite=1, prix_revient_moyen=60000.0, type_actif="CASH_ACCOUNT", valeur_estimee=60000.0)
        objectif = make_objectif(db, holdings=[h], montant_cible=50000.0, valeur_a_la_creation=40000.0, jours_ecoules=200)

        detail = objectifs_service.compute_detail(db, objectif)

        assert detail["diagnostic"] == "atteint"
        assert detail["valeur_actuelle"] == 60000.0
        assert detail["retard_mois"] is None

    def test_objectif_en_bonne_voie(self, db):
        # Échéance dans 1 an, créé il y a 6 mois : à mi-parcours, la moitié du
        # chemin doit être faite pour être "en bonne voie".
        echeance = (datetime.now(timezone.utc) + timedelta(days=180)).date().isoformat()
        h = make_holding(db, ticker="BV", quantite=1, prix_revient_moyen=6000.0, type_actif="CASH_ACCOUNT", valeur_estimee=6000.0)
        objectif = make_objectif(db, holdings=[h], montant_cible=10000.0, valeur_a_la_creation=1000.0, echeance=echeance, jours_ecoules=180)

        detail = objectifs_service.compute_detail(db, objectif)

        assert detail["diagnostic"] == "en_bonne_voie"
        assert detail["progression_pct"] == 60.0

    def test_objectif_en_retard(self, db):
        echeance = (datetime.now(timezone.utc) + timedelta(days=180)).date().isoformat()
        h = make_holding(db, ticker="RET", quantite=1, prix_revient_moyen=1500.0, type_actif="CASH_ACCOUNT", valeur_estimee=1500.0)
        objectif = make_objectif(db, holdings=[h], montant_cible=10000.0, valeur_a_la_creation=1000.0, echeance=echeance, jours_ecoules=180)

        detail = objectifs_service.compute_detail(db, objectif)

        assert detail["diagnostic"] == "en_retard"
        assert detail["retard_mois"] is not None
        assert detail["retard_mois"] > 0

    def test_objectif_aucune_progression(self, db):
        echeance = (datetime.now(timezone.utc) + timedelta(days=180)).date().isoformat()
        h = make_holding(db, ticker="ZERO", quantite=1, prix_revient_moyen=1000.0, type_actif="CASH_ACCOUNT", valeur_estimee=1000.0)
        objectif = make_objectif(db, holdings=[h], montant_cible=10000.0, valeur_a_la_creation=1000.0, echeance=echeance, jours_ecoules=180)

        detail = objectifs_service.compute_detail(db, objectif)

        assert detail["diagnostic"] == "aucune_progression"
        assert detail["retard_mois"] is None

    def test_echeance_deja_depassee(self, db):
        echeance = (datetime.now(timezone.utc) - timedelta(days=10)).date().isoformat()
        h = make_holding(db, ticker="DEP", quantite=1, prix_revient_moyen=1000.0, type_actif="CASH_ACCOUNT", valeur_estimee=1000.0)
        objectif = make_objectif(db, holdings=[h], montant_cible=10000.0, valeur_a_la_creation=1000.0, echeance=echeance, jours_ecoules=180)

        detail = objectifs_service.compute_detail(db, objectif)

        assert detail["diagnostic"] == "echeance_depassee"

    def test_rendement_requis_calcule_sans_versement(self, db):
        echeance = (datetime.now(timezone.utc) + timedelta(days=365)).date().isoformat()
        h = make_holding(db, ticker="REND", quantite=1, prix_revient_moyen=10000.0, type_actif="CASH_ACCOUNT", valeur_estimee=10000.0)
        objectif = make_objectif(db, holdings=[h], montant_cible=11000.0, valeur_a_la_creation=10000.0, echeance=echeance, jours_ecoules=0)

        detail = objectifs_service.compute_detail(db, objectif)

        # 10000 * (1+r) = 11000 sur ~1 an => r ~= 10%
        assert detail["rendement_requis_pct"] == pytest.approx(10.0, abs=1.0)

    def test_contribution_mensuelle_necessaire_a_taux_zero(self, db):
        echeance = (datetime.now(timezone.utc) + timedelta(days=365)).date().isoformat()
        h = make_holding(db, ticker="CONTRIB", quantite=1, prix_revient_moyen=0.0, type_actif="CASH_ACCOUNT", valeur_estimee=0.0)
        objectif = make_objectif(
            db, holdings=[h], montant_cible=12000.0, valeur_a_la_creation=0.0, echeance=echeance, rendement_hypothese_pct=0.0, jours_ecoules=0
        )

        detail = objectifs_service.compute_detail(db, objectif)

        # 12000 sur 12 mois à taux 0% => 1000/mois
        assert detail["contribution_mensuelle_necessaire"] == pytest.approx(1000.0, abs=50.0)

    def test_contribution_mensuelle_necessaire_nulle_si_deja_en_trajectoire(self, db):
        echeance = (datetime.now(timezone.utc) + timedelta(days=365)).date().isoformat()
        h = make_holding(db, ticker="OK", quantite=1, prix_revient_moyen=20000.0, type_actif="CASH_ACCOUNT", valeur_estimee=20000.0)
        objectif = make_objectif(db, holdings=[h], montant_cible=10000.0, valeur_a_la_creation=20000.0, echeance=echeance, jours_ecoules=0)

        detail = objectifs_service.compute_detail(db, objectif)

        assert detail["contribution_mensuelle_necessaire"] == 0.0

    def test_trajectoire_ancree_sur_deux_points_reels(self, db):
        h = make_holding(db, ticker="TRAJ", quantite=1, prix_revient_moyen=3000.0, type_actif="CASH_ACCOUNT", valeur_estimee=3000.0)
        objectif = make_objectif(db, holdings=[h], montant_cible=10000.0, valeur_a_la_creation=1000.0, jours_ecoules=30)

        detail = objectifs_service.compute_detail(db, objectif)

        assert len(detail["trajectoire_cible"]) == 2
        assert len(detail["trajectoire_reelle"]) == 2
        assert detail["trajectoire_reelle"][0]["valeur"] == 1000.0
        assert detail["trajectoire_reelle"][1]["valeur"] == 3000.0
        assert detail["trajectoire_cible"][-1]["valeur"] == 10000.0

    def test_actifs_rattaches_et_contributeurs_exposes(self, db):
        h = make_holding(db, ticker="EXPO", quantite=1, prix_revient_moyen=1000.0, type_actif="CASH_ACCOUNT", valeur_estimee=1000.0)
        alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")
        objectif = make_objectif(db, holdings=[h], detenteurs=[alice])

        detail = objectifs_service.compute_detail(db, objectif)

        assert detail["actifs_rattaches"] == [{"holding_id": h.id, "ticker": "EXPO", "nom": h.nom}]
        assert detail["contributeurs"] == [{"id": alice.id, "nom": "Alice"}]


class TestIndicateursSituation:
    def test_matelas_de_securite(self, db):
        make_holding(db, ticker="LIVRET", quantite=1, prix_revient_moyen=6000.0, type_actif="REGULATED_SAVINGS", valeur_estimee=6000.0)
        c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Loisirs", None)
        aujourdhui = datetime.now(timezone.utc).date()
        db.add(
            MouvementBancaire(
                user_id=ID_UTILISATEUR_TEST, transaction_id="t1", date=aujourdhui.isoformat(), libelle="Dépense", montant=-2000.0, categorie_id=c.id
            )
        )
        db.commit()

        indicateurs = objectifs_service.compute_indicateurs_situation(db, ID_UTILISATEUR_TEST)

        # 6000€ d'épargne dispo / 2000€ de dépenses sur 3 mois => ~666,67/mois => 9 mois de matelas
        assert indicateurs["matelas_securite_mois"] == pytest.approx(9.0, abs=0.1)

    def test_taux_endettement(self, db):
        db.add(Loan(user_id=ID_UTILISATEUR_TEST, libelle="Prêt", capital_initial=100000, taux_annuel_pct=2.0, mensualite=500.0, date_debut=datetime(2020, 1, 1), duree_mois=240))
        aujourdhui = datetime.now(timezone.utc).date()
        db.add(MouvementBancaire(user_id=ID_UTILISATEUR_TEST, transaction_id="t2", date=aujourdhui.isoformat(), libelle="Salaire", montant=3000.0))
        db.commit()

        indicateurs = objectifs_service.compute_indicateurs_situation(db, ID_UTILISATEUR_TEST)

        # 500€ de mensualité / (3000€/3 mois = 1000€/mois de revenus) = 50%
        assert indicateurs["taux_endettement_pct"] == pytest.approx(50.0, abs=0.1)

    def test_part_immobilisee(self, db):
        make_holding(db, ticker="MAISON", quantite=1, prix_revient_moyen=200000.0, type_actif="REAL_ESTATE", valeur_estimee=200000.0)
        make_holding(db, ticker="LIVRET2", quantite=1, prix_revient_moyen=50000.0, type_actif="REGULATED_SAVINGS", valeur_estimee=50000.0)

        indicateurs = objectifs_service.compute_indicateurs_situation(db, ID_UTILISATEUR_TEST)

        # 200000 non liquide / 250000 patrimoine brut = 80%
        assert indicateurs["part_immobilisee_pct"] == pytest.approx(80.0, abs=0.1)

    def test_indicateurs_none_si_aucune_donnee(self, db):
        indicateurs = objectifs_service.compute_indicateurs_situation(db, ID_UTILISATEUR_TEST)

        assert indicateurs["matelas_securite_mois"] is None
        assert indicateurs["taux_endettement_pct"] is None
        assert indicateurs["part_immobilisee_pct"] is None
