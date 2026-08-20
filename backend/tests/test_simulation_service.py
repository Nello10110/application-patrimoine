"""Verrouille le simulateur de patrimoine et le calcul d'indépendance financière
(roadmap Phase 2) — `services/simulation_service.py`, calcul pur sans dépendance
externe."""

import pytest

from app.services import simulation_service

# ---------------------------------------------------------------------------
# `compute_projection`
# ---------------------------------------------------------------------------


def test_projection_point_zero_est_la_valeur_de_depart():
    points = simulation_service.compute_projection(10000.0, 5.0, 200.0, 10)
    assert points[0] == {"annee": 0, "valeur": 10000.0}


def test_projection_croissance_pure_sans_epargne():
    """Référence indépendante : capitalisation composée sans apport,
    FV = P*(1+r)^12 (r mensuel) — formule fermée, pas la boucle testée."""
    points = simulation_service.compute_projection(1000.0, 12.0, 0.0, 1)
    r = 0.12 / 12
    attendu = 1000.0 * (1 + r) ** 12
    assert points[1]["valeur"] == pytest.approx(attendu, abs=0.01)


def test_projection_epargne_pure_sans_rendement():
    """Sans rendement, l'épargne mensuelle s'accumule linéairement."""
    points = simulation_service.compute_projection(0.0, 0.0, 1000.0, 1)
    assert points[1]["valeur"] == pytest.approx(12000.0)


def test_projection_epargne_avec_rendement():
    """Référence indépendante : valeur future d'une suite de versements de fin de
    période, FV = P*(1+r)^n + M*((1+r)^n - 1)/r — même formule que l'amortissement
    d'emprunt (LOT loan_service), appliquée ici en sens inverse (capitalisation)."""
    points = simulation_service.compute_projection(0.0, 12.0, 100.0, 1)
    r = 0.12 / 12
    facteur = (1 + r) ** 12
    attendu = 100.0 * (facteur - 1) / r
    assert points[1]["valeur"] == pytest.approx(attendu, abs=0.01)


def test_projection_rendement_negatif_decroit():
    points = simulation_service.compute_projection(10000.0, -10.0, 0.0, 1)
    assert points[1]["valeur"] < points[0]["valeur"]


def test_projection_renvoie_un_point_par_annee_plus_le_depart():
    points = simulation_service.compute_projection(1000.0, 5.0, 100.0, 5)
    assert [p["annee"] for p in points] == [0, 1, 2, 3, 4, 5]


def test_projection_croissante_annee_apres_annee_avec_epargne_positive():
    points = simulation_service.compute_projection(1000.0, 5.0, 100.0, 10)
    valeurs = [p["valeur"] for p in points]
    assert valeurs == sorted(valeurs)


# ---------------------------------------------------------------------------
# `compute_fire`
# ---------------------------------------------------------------------------


def test_fire_patrimoine_necessaire_regle_des_4_pourcent():
    resultat = simulation_service.compute_fire(0.0, 0.0, 0.0, 40000.0, 4.0)
    assert resultat["patrimoine_necessaire"] == pytest.approx(1_000_000.0)


def test_fire_deja_independant_renvoie_zero_annee():
    resultat = simulation_service.compute_fire(1_500_000.0, 5.0, 0.0, 40000.0, 4.0)
    assert resultat["patrimoine_necessaire"] == pytest.approx(1_000_000.0)
    assert resultat["annees_avant_independance"] == 0.0


def test_fire_calcul_exact_sans_rendement():
    """Sans rendement, 10 000 €/mois pour atteindre 1 000 000 € : exactement 100
    mois, soit 100/12 ≈ 8,3 ans — cas hand-checké, rendement nul pour isoler l'effet
    de l'épargne seule."""
    resultat = simulation_service.compute_fire(0.0, 0.0, 10000.0, 40000.0, 4.0)
    assert resultat["annees_avant_independance"] == pytest.approx(8.3)


def test_fire_non_atteint_dans_lhorizon_renvoie_none():
    resultat = simulation_service.compute_fire(0.0, 0.0, 0.0, 1_000_000.0, 4.0)
    assert resultat["annees_avant_independance"] is None


def test_fire_taux_de_retrait_plus_bas_augmente_le_patrimoine_necessaire():
    """Un taux de retrait plus prudent (3 % au lieu de 4 %) exige un patrimoine plus
    important pour la même dépense annuelle cible."""
    resultat_4 = simulation_service.compute_fire(0.0, 5.0, 0.0, 40000.0, 4.0)
    resultat_3 = simulation_service.compute_fire(0.0, 5.0, 0.0, 40000.0, 3.0)
    assert resultat_3["patrimoine_necessaire"] > resultat_4["patrimoine_necessaire"]
