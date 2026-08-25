"""Verrouille la déclaration de patrimoine PDF paramétrable (backlog 2.Q.2) —
`services/declaration_patrimoine_service.py`. Même discipline que
`test_pdf_export_service.py` : extraction du texte réel du PDF (`pypdf`), pas
seulement une vérification d'absence de plantage."""

import io
from datetime import datetime

from pypdf import PdfReader

from app.models import Loan
from app.services import declaration_patrimoine_service, detenteurs_service, preferences_service

from .conftest import ID_UTILISATEUR_TEST, make_holding


def _texte_pdf(contenu: bytes) -> str:
    reader = PdfReader.__new__(PdfReader)
    reader.__init__(io.BytesIO(contenu))
    return "\n".join(page.extract_text() for page in reader.pages)


def _generer(db, **overrides):
    defaults = dict(holding_ids=None, loan_ids=None, detenteur_id=None, destinataire=None, inclure_profil=False)
    defaults.update(overrides)
    return declaration_patrimoine_service.generer_pdf_declaration(db, ID_UTILISATEUR_TEST, **defaults)


def test_pdf_valide_meme_sans_donnees(db):
    contenu = _generer(db)

    assert contenu.startswith(b"%PDF")
    texte = _texte_pdf(contenu)
    assert "Déclaration de patrimoine" in texte
    assert "Aucun actif sélectionné." in texte
    assert "Aucun passif déclaré." in texte
    assert "Page 1" in texte


def test_pdf_restitue_tous_les_actifs_par_defaut(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="MAISON", nom="Résidence principale", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=200000.0)

    texte = _texte_pdf(_generer(db))

    assert "Résidence principale" in texte
    assert "200 000 €" in texte
    assert "Valeur estimée déclarée le" in texte
    assert "201 000 €" in texte  # synthèse : 1 000 (AAA, coût de revient) + 200 000 (MAISON)


def test_selection_holding_ids_restreint_les_actifs_affiches(db):
    aaa = make_holding(db, ticker="AAA", nom="Action A", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="BBB", nom="Action B", type_actif="STOCK", quantite=1, prix_revient_moyen=500.0)

    texte = _texte_pdf(_generer(db, holding_ids=[aaa.id]))

    assert "Action A" in texte
    assert "Action B" not in texte


def test_selection_liste_vide_naffiche_aucun_actif(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)

    texte = _texte_pdf(_generer(db, holding_ids=[]))

    assert "Aucun actif sélectionné." in texte


def test_prix_de_revient_non_cote_sans_cours(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)

    texte = _texte_pdf(_generer(db))

    assert "Prix de revient (non coté)" in texte


def test_passifs_affiches_par_defaut(db):
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
        )
    )
    db.commit()

    texte = _texte_pdf(_generer(db))

    assert "Crédit immo" in texte
    assert "120 000 €" in texte


def test_destinataire_et_synthese(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)

    texte = _texte_pdf(_generer(db, destinataire="Banque XYZ"))

    assert "Destinataire : Banque XYZ" in texte
    assert "Patrimoine net déclaré" in texte
    assert "1 000 €" in texte


def test_filtre_detenteur_ne_montre_que_ses_quotites(db):
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")
    bob = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Bob", "personne")
    h_partage = make_holding(db, ticker="AAA", nom="Bien partagé", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="BBB", nom="Bien non reparti", type_actif="STOCK", quantite=1, prix_revient_moyen=5000.0)
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h_partage, [(alice.id, 60.0), (bob.id, 40.0)])

    texte_alice = _texte_pdf(_generer(db, detenteur_id=alice.id))

    assert "Détenteur : Alice" in texte_alice
    assert "Bien partagé" in texte_alice
    assert "600 €" in texte_alice  # 60 % de 1000
    assert "Bien non reparti" not in texte_alice  # jamais réparti = invisible en vue individuelle


def test_filtre_detenteur_affiche_la_part_dette_de_lemprunt_rattache(db):
    alice = detenteurs_service.create_detenteur(db, ID_UTILISATEUR_TEST, "Alice", "personne")
    h = make_holding(db, ticker="MAISON", nom="Maison", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=200000.0)
    detenteurs_service.set_quotites_holding(db, ID_UTILISATEUR_TEST, h, [(alice.id, 100.0)])
    loan = Loan(
        user_id=ID_UTILISATEUR_TEST,
        libelle="Crédit immo",
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

    texte = _texte_pdf(_generer(db, detenteur_id=alice.id))

    assert "Crédit immo" in texte
    assert "100 000 €" in texte  # 100 % de la quotité actif, héritée par l'emprunt


def test_inclure_profil_ajoute_la_section_avec_taux_imposition(db):
    preferences_service.enregistrer_preferences(db, ID_UTILISATEUR_TEST, "cout_moyen_pondere", 30.0)

    texte = _texte_pdf(_generer(db, inclure_profil=True))

    assert "Profil emprunteur" in texte
    assert "Taux d'endettement" in texte
    assert "Reste à vivre" in texte
    assert "30" in texte  # taux d'imposition déclaré


def test_sans_inclure_profil_pas_de_section_profil(db):
    texte = _texte_pdf(_generer(db, inclure_profil=False))

    assert "Profil emprunteur" not in texte
