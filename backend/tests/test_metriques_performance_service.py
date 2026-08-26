"""Verrouille `services/metriques_performance_service.py` (backlog 2.P.2) : TWR
(cumulé/annualisé), volatilité annualisée, max drawdown et récupération — sur des
séries `points` construites à la main (même forme que
`historical_performance_service.compute_portfolio_history`), sans dépendance réseau."""

from app.services import metriques_performance_service as mps


def _point(date: str, valeur_portefeuille: float, valeur_investie: float) -> dict:
    return {"date": date, "valeur_portefeuille": valeur_portefeuille, "valeur_investie": valeur_investie, "valeur_realisee_cumulee": 0.0}


def test_moins_de_deux_points_renvoie_tout_a_none():
    resultat = mps.compute_metriques_avancees([_point("2024-01-01", 1000, 1000)])

    assert resultat == {
        "twr_cumule_pct": None,
        "twr_annualise_pct": None,
        "volatilite_annualisee_pct": None,
        "max_drawdown_pct": None,
        "drawdown_recupere": None,
        "semaines_recuperation": None,
    }


def test_twr_neutralise_leffet_dun_versement_sans_gain_de_marche():
    """1000 investis, valeur stable à 1000 (aucun gain de marché), puis un
    versement de 500 amène la valeur à 1500 SANS aucune performance réelle : le
    TWR doit rester à 0 %, contrairement à un rendement brut naïf qui verrait
    +50 %."""
    points = [
        _point("2024-01-01", 1000, 1000),
        _point("2024-01-08", 1000, 1000),
        _point("2024-01-15", 1500, 1500),  # versement de 500, valeur suit exactement
    ]

    resultat = mps.compute_metriques_avancees(points)

    assert resultat["twr_cumule_pct"] == 0.0


def test_twr_cumule_capture_un_vrai_gain_de_marche():
    """+10 % puis +10 % (aucun flux entre les deux) : TWR cumulé = 1.1*1.1-1 = 21 %."""
    points = [
        _point("2024-01-01", 1000, 1000),
        _point("2024-01-08", 1100, 1000),
        _point("2024-01-15", 1210, 1000),
    ]

    resultat = mps.compute_metriques_avancees(points)

    assert resultat["twr_cumule_pct"] == 21.0


def test_twr_annualise_extrapole_sur_52_semaines():
    """+10 % sur UNE seule semaine -> annualisé = 1.1^52 - 1, un nombre très
    supérieur au cumulé (extrapolation, pas une moyenne)."""
    points = [_point("2024-01-01", 1000, 1000), _point("2024-01-08", 1100, 1000)]

    resultat = mps.compute_metriques_avancees(points)

    assert resultat["twr_cumule_pct"] == 10.0
    assert resultat["twr_annualise_pct"] == round((1.1**52 - 1) * 100, 2)


def test_twr_annualise_none_plutot_quun_500_si_le_cumul_derape_sous_moins_100_pourcent():
    """Bug réel observé en conditions réelles (25/08/2026) : un dépôt ponctuel très
    grand face à la valeur de la semaine (`flux_semaine`) peut, avec cette
    approximation hebdomadaire, produire un rendement de sous-période très négatif
    (`1 + r < 0`). Si le TWR cumulé sur TOUTE la période finit à -100 % ou pire,
    `(1 + twr_cumule)` devient négatif ; l'élever à une puissance fractionnaire
    (`52 / nb_semaines` n'est pas toujours un entier) renvoie un nombre COMPLEXE en
    Python plutôt qu'une erreur — `round()` levait alors `TypeError: type complex
    doesn't define __round__ method`, jamais rattrapée, d'où un 500 générique sur
    `GET /api/performance/metriques-avancees`. `None` est la seule réponse sensée :
    annualiser une perte totale (ou pire) n'a de toute façon aucun sens mathématique
    dans les réels."""
    points = [_point("2024-01-01", 1000, 1000), _point("2024-01-08", 100, 5000)]
    # 9 semaines supplémentaires sans aucun mouvement, pour que l'exposant
    # d'annualisation (52 / nb_semaines) soit fractionnaire (52 / 10 = 5.2), pas un
    # entier — sans quoi Python n'aurait jamais renvoyé de complexe ici.
    for jour in (15, 22, 29):
        points.append(_point(f"2024-01-{jour}", 100, 5000))
    for jour in (5, 12, 19, 26):
        points.append(_point(f"2024-02-{jour}", 100, 5000))
    points.append(_point("2024-03-04", 100, 5000))
    points.append(_point("2024-03-11", 100, 5000))

    resultat = mps.compute_metriques_avancees(points)

    assert resultat["twr_annualise_pct"] is None
    # Le reste des métriques doit rester calculable normalement — seule
    # l'annualisation, mathématiquement indéfinie ici, doit se replier sur `None`.
    assert resultat["twr_cumule_pct"] is not None


def test_volatilite_nulle_sur_rendements_hebdomadaires_identiques():
    points = [_point(f"2024-01-{d:02d}", 1000 * (1.01 ** (i)), 1000) for i, d in enumerate([1, 8, 15, 22], start=0)]

    resultat = mps.compute_metriques_avancees(points)

    assert resultat["volatilite_annualisee_pct"] == 0.0


def test_max_drawdown_et_recuperation_detectes():
    """Pic à 1000, creux à 800 (-20 %), puis retour à 1000 : drawdown de -20 %,
    récupéré 2 semaines après le creux."""
    points = [
        _point("2024-01-01", 1000, 1000),
        _point("2024-01-08", 900, 1000),
        _point("2024-01-15", 800, 1000),  # creux
        _point("2024-01-22", 950, 1000),
        _point("2024-01-29", 1000, 1000),  # récupéré ici
    ]

    resultat = mps.compute_metriques_avancees(points)

    assert resultat["max_drawdown_pct"] == -20.0
    assert resultat["drawdown_recupere"] is True
    assert resultat["semaines_recuperation"] == 2


def test_drawdown_non_recupere_a_ce_jour():
    points = [
        _point("2024-01-01", 1000, 1000),
        _point("2024-01-08", 800, 1000),
        _point("2024-01-15", 850, 1000),  # toujours sous le pic de 1000
    ]

    resultat = mps.compute_metriques_avancees(points)

    assert resultat["max_drawdown_pct"] == -20.0
    assert resultat["drawdown_recupere"] is False
    assert resultat["semaines_recuperation"] is None


def test_aucun_drawdown_si_la_valeur_ne_baisse_jamais():
    points = [_point("2024-01-01", 1000, 1000), _point("2024-01-08", 1100, 1000), _point("2024-01-15", 1200, 1000)]

    resultat = mps.compute_metriques_avancees(points)

    assert resultat["max_drawdown_pct"] == 0.0
    assert resultat["drawdown_recupere"] is True
    assert resultat["semaines_recuperation"] is None
