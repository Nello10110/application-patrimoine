"""Verrouille l'import de mouvements bancaires (backlog 2.N.1) :
`services/budget_import_service.py` — CSV mappé, OFX, QIF, déduplication,
réapplication des règles."""

import pandas as pd

from app.models import MouvementBancaire
from app.services import budget_categories_service, budget_import_service

from .conftest import ID_UTILISATEUR_TEST


def test_mouvements_depuis_dataframe_colonne_montant_signee():
    df = pd.DataFrame(
        [
            {"Date": "01/02/2026", "Libellé": "Salaire", "Montant": "2000,00"},
            {"Date": "02/02/2026", "Libellé": "Loyer", "Montant": "-800,00"},
        ]
    )
    mouvements, ignorees = budget_import_service.mouvements_depuis_dataframe(df, "Date", "Libellé", "Montant", None, None)

    assert ignorees == 0
    assert len(mouvements) == 2
    assert mouvements[0] == budget_import_service.MouvementBrut(date="2026-02-01", libelle="Salaire", montant=2000.0)
    assert mouvements[1].montant == -800.0


def test_mouvements_depuis_dataframe_colonnes_debit_credit_separees():
    df = pd.DataFrame(
        [
            {"Date": "2026-02-01", "Libellé": "Virement reçu", "Débit": "", "Crédit": "500"},
            {"Date": "2026-02-02", "Libellé": "Carte", "Débit": "42.50", "Crédit": ""},
        ]
    )
    mouvements, ignorees = budget_import_service.mouvements_depuis_dataframe(df, "Date", "Libellé", None, "Débit", "Crédit")

    assert ignorees == 0
    assert mouvements[0].montant == 500.0
    assert mouvements[1].montant == -42.5


def test_mouvements_depuis_dataframe_ignore_les_lignes_avec_date_ou_montant_illisible():
    df = pd.DataFrame(
        [
            {"Date": "pas une date", "Libellé": "?", "Montant": "10"},
            {"Date": "2026-02-01", "Libellé": "ok", "Montant": "pas un montant"},
            {"Date": "2026-02-02", "Libellé": "ok2", "Montant": "10"},
        ]
    )
    mouvements, ignorees = budget_import_service.mouvements_depuis_dataframe(df, "Date", "Libellé", "Montant", None, None)

    assert ignorees == 2
    assert len(mouvements) == 1


OFX_EXEMPLE = b"""OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260201120000[0:GMT]
<TRNAMT>-42.50
<FITID>OFX-001
<NAME>CARTE ACHAT
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260203
<TRNAMT>1500.00
<FITID>OFX-002
<NAME>VIREMENT SALAIRE
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""


def test_parse_ofx_extrait_les_mouvements():
    mouvements = budget_import_service.parse_ofx(OFX_EXEMPLE)

    assert len(mouvements) == 2
    assert mouvements[0].date == "2026-02-01"
    assert mouvements[0].montant == -42.5
    assert mouvements[0].transaction_id == "OFX-001"
    assert mouvements[0].libelle == "CARTE ACHAT"
    assert mouvements[1].date == "2026-02-03"
    assert mouvements[1].montant == 1500.0


QIF_EXEMPLE = b"""!Type:Bank
D02/01/2026
T-42.50
PCARTE ACHAT
^
D02/03/2026
U1500.00
PVIREMENT SALAIRE
^
"""


def test_parse_qif_extrait_les_mouvements():
    mouvements = budget_import_service.parse_qif(QIF_EXEMPLE)

    assert len(mouvements) == 2
    assert mouvements[0].date == "2026-02-01"
    assert mouvements[0].montant == -42.5
    assert mouvements[0].libelle == "CARTE ACHAT"
    assert mouvements[1].montant == 1500.0


def test_parse_qif_gere_le_bloc_final_sans_separateur_terminal():
    contenu = b"D02/01/2026\nT-10.00\nPSans separateur final"
    mouvements = budget_import_service.parse_qif(contenu)
    assert len(mouvements) == 1


def test_importer_mouvements_deduplique_et_categorise_automatiquement(db):
    c = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Transport", None)
    budget_categories_service.create_regle(db, ID_UTILISATEUR_TEST, "sncf", c.id)

    mouvements = [
        budget_import_service.MouvementBrut(date="2026-02-01", libelle="SNCF Connect", montant=-50.0),
        budget_import_service.MouvementBrut(date="2026-02-02", libelle="Boulangerie", montant=-5.0),
    ]
    resultat = budget_import_service.importer_mouvements(db, ID_UTILISATEUR_TEST, mouvements)

    assert resultat.importees == 2
    assert resultat.doublons_ignores == 0
    assert resultat.categorisees_automatiquement == 1

    lignes = db.query(MouvementBancaire).order_by(MouvementBancaire.date).all()
    assert lignes[0].categorie_id == c.id
    assert lignes[1].categorie_id is None

    # Ré-importer exactement le même relevé : tout doit être détecté comme doublon.
    resultat2 = budget_import_service.importer_mouvements(db, ID_UTILISATEUR_TEST, mouvements)
    assert resultat2.importees == 0
    assert resultat2.doublons_ignores == 2


def test_importer_mouvements_avec_transaction_id_fourni_deduplique_dessus(db):
    m1 = budget_import_service.MouvementBrut(date="2026-02-01", libelle="A", montant=-1.0, transaction_id="FIXE-1")
    budget_import_service.importer_mouvements(db, ID_UTILISATEUR_TEST, [m1])
    # Même transaction_id, libellé/montant différents (ex. re-export corrigé par la
    # banque) : doit tout de même être vu comme le même mouvement.
    m2 = budget_import_service.MouvementBrut(date="2026-02-01", libelle="A corrigé", montant=-1.0, transaction_id="FIXE-1")
    resultat = budget_import_service.importer_mouvements(db, ID_UTILISATEUR_TEST, [m2])

    assert resultat.doublons_ignores == 1


def test_reappliquer_regles_ne_touche_pas_une_categorisation_manuelle(db):
    c1 = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Auto", None)
    c2 = budget_categories_service.create_categorie(db, ID_UTILISATEUR_TEST, "Manuelle", None)
    budget_categories_service.create_regle(db, ID_UTILISATEUR_TEST, "sncf", c1.id)

    db.add(MouvementBancaire(user_id=ID_UTILISATEUR_TEST, transaction_id="t1", date="2026-02-01", libelle="SNCF Connect", montant=-10.0))
    db.add(
        MouvementBancaire(
            user_id=ID_UTILISATEUR_TEST,
            transaction_id="t2",
            date="2026-02-02",
            libelle="SNCF Connect",
            montant=-10.0,
            categorie_id=c2.id,
            categorise_manuellement=True,
        )
    )
    db.commit()

    modifies = budget_import_service.reappliquer_regles(db, ID_UTILISATEUR_TEST)

    assert modifies == 1
    lignes = {m.transaction_id: m.categorie_id for m in db.query(MouvementBancaire).all()}
    assert lignes["t1"] == c1.id
    assert lignes["t2"] == c2.id  # inchangé, malgré la règle qui matche aussi
