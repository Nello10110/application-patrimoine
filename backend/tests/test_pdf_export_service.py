"""Verrouille le relevé de patrimoine PDF (roadmap Phase 3, § D.1) —
`services/pdf_export_service.py`. Le contenu chiffré vient de fonctions déjà
testées ailleurs (`patrimoine_service`, `performance_service`, `analysis_service`) :
ce fichier vérifie que la mise en forme PDF les restitue fidèlement, en extrayant
le texte réel du PDF généré (`pypdf`) plutôt qu'en se contentant de vérifier
l'absence de plantage."""

from datetime import datetime

from pypdf import PdfReader

from app.models import Holding, Loan, MarketDataCache
from app.services.pdf_export_service import generer_pdf_patrimoine

from .conftest import ID_UTILISATEUR_TEST, make_holding, make_transaction


def _texte_pdf(contenu: bytes) -> str:
    reader = PdfReader.__new__(PdfReader)
    import io

    reader.__init__(io.BytesIO(contenu))
    return "\n".join(page.extract_text() for page in reader.pages)


def test_pdf_est_un_document_valide_meme_sans_donnees(db):
    contenu = generer_pdf_patrimoine(db, ID_UTILISATEUR_TEST)

    assert contenu.startswith(b"%PDF")
    texte = _texte_pdf(contenu)
    assert "Relevé de patrimoine" in texte
    assert "Patrimoine net" in texte


def test_pdf_restitue_le_patrimoine_net_et_la_repartition(db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    db.add(
        Loan(
            user_id=ID_UTILISATEUR_TEST,
            libelle="Crédit immo",
            capital_initial=200000.0,
            taux_annuel_pct=0.0,
            mensualite=1000.0,
            date_debut=datetime(2020, 1, 1),
            duree_mois=200,
            capital_restant_du_manuel=100000.0,
        )
    )
    db.commit()

    texte = _texte_pdf(generer_pdf_patrimoine(db, ID_UTILISATEUR_TEST))

    assert "250 000 €" in texte  # actifs totaux et répartition Immobilier
    assert "100 000 €" in texte  # passifs
    assert "150 000 €" in texte  # patrimoine net (250000 - 100000)
    assert "Immobilier" in texte


def test_pdf_restitue_la_rentabilite_quand_des_transactions_existent(db):
    make_transaction(db, symbol="ABC", shares=10.0, amount=-1000.0, category="TRADING", type="BUY")
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="ABC", quantite=10.0, prix_revient_moyen=100.0, type_actif="STOCK"))
    db.add(MarketDataCache(ticker="ABC", prix_actuel=150.0, derniere_maj=datetime(2026, 1, 1)))
    db.commit()

    texte = _texte_pdf(generer_pdf_patrimoine(db, ID_UTILISATEUR_TEST))

    assert "Rentabilité globale" in texte


def test_pdf_omet_la_rentabilite_sans_aucune_transaction(db):
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=200000.0, valeur_estimee=250000.0)
    db.commit()

    texte = _texte_pdf(generer_pdf_patrimoine(db, ID_UTILISATEUR_TEST))

    assert "Rentabilité globale" not in texte


def test_pdf_restitue_la_repartition_par_compte_quand_annotee(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0, compte="PEA")
    db.commit()

    texte = _texte_pdf(generer_pdf_patrimoine(db, ID_UTILISATEUR_TEST))

    assert "Répartition par compte" in texte
    assert "PEA" in texte


def test_pdf_omet_la_repartition_par_compte_sans_annotation(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=1, prix_revient_moyen=1000.0)
    db.commit()

    texte = _texte_pdf(generer_pdf_patrimoine(db, ID_UTILISATEUR_TEST))

    assert "Répartition par compte" not in texte
