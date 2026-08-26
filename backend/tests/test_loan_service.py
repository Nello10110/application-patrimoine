"""Verrouille le calcul du capital restant dû d'un emprunt (Phase 1 de
`docs/ROADMAP.md`, patrimoine net) — `services/loan_service.py`."""

from datetime import datetime

import pytest

from app.models import Loan
from app.services import loan_service


def _loan(**overrides) -> Loan:
    defaults = dict(
        libelle="Prêt test",
        capital_initial=10000.0,
        taux_annuel_pct=12.0,  # 1%/mois, rond pour des vérifications à la main
        mensualite=900.0,
        date_debut=datetime(2024, 1, 1),
        duree_mois=12,
        capital_restant_du_manuel=None,
    )
    defaults.update(overrides)
    return Loan(**defaults)


# ---------------------------------------------------------------------------
# `mois_ecoules`
# ---------------------------------------------------------------------------


def test_mois_ecoules_avant_le_jour_anniversaire_ne_compte_pas_le_mois():
    assert loan_service.mois_ecoules(datetime(2024, 1, 15), datetime(2024, 2, 10)) == 0


def test_mois_ecoules_au_jour_anniversaire_compte_le_mois():
    assert loan_service.mois_ecoules(datetime(2024, 1, 15), datetime(2024, 2, 15)) == 1


def test_mois_ecoules_apres_le_jour_anniversaire():
    assert loan_service.mois_ecoules(datetime(2024, 1, 15), datetime(2024, 2, 20)) == 1


def test_mois_ecoules_jamais_negatif_avant_le_debut():
    assert loan_service.mois_ecoules(datetime(2024, 6, 1), datetime(2024, 1, 1)) == 0


# ---------------------------------------------------------------------------
# `compute_capital_restant_du` — amortissement standard
# ---------------------------------------------------------------------------


def test_capital_restant_du_avant_le_debut_vaut_le_capital_initial():
    loan = _loan()
    assert loan_service.compute_capital_restant_du(loan, datetime(2023, 12, 15)) == 10000.0


def test_capital_restant_du_apres_la_duree_totale_vaut_zero():
    loan = _loan()
    assert loan_service.compute_capital_restant_du(loan, datetime(2025, 6, 1)) == 0.0


def test_capital_restant_du_apres_un_mois():
    """Cas particulier de la formule générale à n=1 : `factor = 1+r`, donc
    `(factor-1)/r = 1` quel que soit le taux — restant(1) = P*(1+r) - M, vérifiable à
    la main indépendamment de l'implémentation. P=10000, r=1%/mois, M=900 :
    10000*1.01 - 900 = 10100 - 900 = 9200."""
    loan = _loan()
    restant = loan_service.compute_capital_restant_du(loan, datetime(2024, 2, 1))
    assert restant == pytest.approx(9200.0)


def test_capital_restant_du_apres_deux_mois():
    """factor = 1.01^2 = 1.0201, (factor-1)/r = 2.01 : restant = 10000*1.0201 -
    900*2.01 = 10201 - 1809 = 8392."""
    loan = _loan()
    restant = loan_service.compute_capital_restant_du(loan, datetime(2024, 3, 1))
    assert restant == pytest.approx(8392.0)


def test_capital_restant_du_decroit_de_facon_monotone():
    loan = _loan(duree_mois=24)
    valeurs = [loan_service.compute_capital_restant_du(loan, datetime(2024, 1 + m, 1)) for m in range(0, 12)]
    for a, b in zip(valeurs, valeurs[1:]):
        assert b < a


def test_capital_restant_du_taux_zero_amortissement_lineaire():
    loan = _loan(taux_annuel_pct=0.0, mensualite=1000.0, capital_initial=12000.0, duree_mois=12)
    assert loan_service.compute_capital_restant_du(loan, datetime(2024, 4, 1)) == pytest.approx(9000.0)


def test_capital_restant_du_manuel_prime_sur_le_calcul_theorique():
    loan = _loan(capital_restant_du_manuel=5000.0)
    assert loan_service.compute_capital_restant_du(loan, datetime(2024, 2, 1)) == 5000.0


def test_capital_restant_du_manuel_borne_entre_zero_et_capital_initial():
    trop_haut = _loan(capital_restant_du_manuel=999999.0)
    assert loan_service.compute_capital_restant_du(trop_haut) == 10000.0

    negatif = _loan(capital_restant_du_manuel=-100.0)
    assert loan_service.compute_capital_restant_du(negatif) == 0.0


def test_capital_restant_du_jamais_negatif_meme_en_toute_fin_de_pret():
    """Une mensualité légèrement surestimée par rapport à l'amortissement théorique
    ne doit jamais faire passer le restant sous 0 avant la date de fin."""
    loan = _loan(mensualite=1000.0, duree_mois=12)
    restant = loan_service.compute_capital_restant_du(loan, datetime(2024, 12, 1))
    assert restant >= 0.0


# ---------------------------------------------------------------------------
# `compute_capital_restant_du_theorique` — ignore délibérément le recalage manuel
# (backlog : historique combiné patrimoine, `patrimoine_history_service`)
# ---------------------------------------------------------------------------


def test_capital_restant_du_theorique_ignore_le_recalage_manuel():
    """Contrairement à `compute_capital_restant_du`, la version théorique doit
    reconstituer l'amortissement pur même si `capital_restant_du_manuel` est
    renseigné — sert à reconstituer un point ANTÉRIEUR à ce recalage."""
    loan = _loan(capital_restant_du_manuel=5000.0)
    assert loan_service.compute_capital_restant_du_theorique(loan, datetime(2024, 2, 1)) == pytest.approx(9200.0)


def test_capital_restant_du_theorique_coincide_avec_compute_capital_restant_du_sans_recalage():
    loan = _loan()
    for mois in range(0, 12):
        date = datetime(2024, 1 + mois, 1)
        assert loan_service.compute_capital_restant_du_theorique(loan, date) == loan_service.compute_capital_restant_du(loan, date)
