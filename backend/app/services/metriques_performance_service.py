"""Métriques de performance de niveau professionnel (backlog 2.P.2) : rendement
pondéré par le temps (TWR), volatilité annualisée, perte maximale (max drawdown) et
durée de récupération. Composé entièrement à partir de la série déjà calculée par
`historical_performance_service.compute_portfolio_history` (hebdomadaire, mise en
cache) — aucun nouvel appel `yfinance` pour ces métriques elles-mêmes, seule la
comparaison à un indice de référence (`compute_benchmark_history`, module voisin)
en a besoin.

**TWR vs MWR** (`performance_service.compute_performance` calcule déjà le second,
sous le nom `rendement_annualise_pct`, par XIRR) : le MWR (money-weighted return)
juge la DÉCISION de l'investisseur — quand il a versé, combien — et se laisse donc
influencer par le TIMING de ses propres apports. Le TWR (time-weighted return) juge
le SUPPORT lui-même, en neutralisant l'effet des apports/retraits : deux personnes
ayant investi dans le même portefeuille au même moment mais avec des montants
différents ont le même TWR, mais potentiellement des MWR très différents. Aucun des
deux n'est "le bon" dans l'absolu — l'un mesure la performance du placement, l'autre
la performance de la stratégie de versement.

Approximation assumée (cohérente avec la granularité déjà acceptée ailleurs dans le
projet pour l'historique de portefeuille, hebdomadaire) : chaque semaine de la grille
est traitée comme UNE sous-période TWR, en retranchant de la valeur de fin le flux
net investi pendant cette semaine (`valeur_investie` cumulée, jamais décrémentée à la
vente — même série que le graphique d'évolution) avant de calculer le rendement de
cette sous-période. Un apport survenu en milieu de semaine n'est donc pas isolé à
l'heure près, seulement à la semaine près — la même limite de précision que le
graphique d'évolution lui-même, qui ne connaît la valeur du portefeuille qu'une fois
par semaine."""

NOMBRE_SEMAINES_PAR_AN = 52


def _valeur_totale(point: dict) -> float:
    """`valeur_portefeuille` seule EXCLUT toute position entièrement vendue (elle
    sort de la valorisation dès que la quantité détenue tombe à zéro, cf.
    `historical_performance_service._compute_portfolio_history`), alors que
    `valeur_investie` (le coût d'acquisition) n'est, elle, jamais décrémentée à la
    vente. Une vente fait donc chuter `valeur_portefeuille` d'un coup sans qu'aucun
    versement/retrait ne l'explique — un rendement hebdomadaire TWR calculé sur la
    seule `valeur_portefeuille` prend alors cette chute pour une perte de marché
    (bug constaté le 09/09/2026 : -100 % après la vente d'une grosse position).
    `valeur_realisee_cumulee` (produit net cumulé des ventes + revenus perçus, cf.
    `historical_performance_service._serie_cumulee_ventes_et_revenus`) comble
    exactement cet écart : l'ajouter reconstitue la valeur totale du portefeuille,
    positions ouvertes ET produit des ventes passées confondus — une vente déplace
    alors de la valeur d'une colonne à l'autre sans jamais en faire disparaître."""
    return point["valeur_portefeuille"] + point["valeur_realisee_cumulee"]


def _rendements_hebdomadaires_twr(points: list[dict]) -> list[float]:
    rendements = []
    for i in range(1, len(points)):
        v_debut = _valeur_totale(points[i - 1])
        v_fin = _valeur_totale(points[i])
        flux_semaine = points[i]["valeur_investie"] - points[i - 1]["valeur_investie"]
        if v_debut > 0:
            rendements.append((v_fin - flux_semaine) / v_debut - 1)
    return rendements


def serie_twr_cumulee_pct(points: list[dict]) -> list[float]:
    """Rendement pondéré par le temps (TWR) CUMULÉ à CHAQUE point de `points`, sous
    forme de série alignée point à point (le premier point vaut toujours 0.0) —
    contrairement à `twr_cumule_pct` de `compute_metriques_avancees` ci-dessous, qui
    ne renvoie que le chiffre final. Utilisée par
    `historical_performance_service.compute_benchmark_history` pour comparer le
    portefeuille à un indice de référence semaine par semaine : un simple ratio
    `valeur_portefeuille[i] / valeur_portefeuille[0]` se laisse fausser par tout apport
    versé entre-temps (un portefeuille qui a reçu 100x sa valeur de départ en
    versements affiche alors une « performance » de +10 000 % qui n'a rien à voir
    avec un rendement) — le TWR neutralise cet effet exactement comme pour
    `twr_cumule_pct`, cf. docstring de module.

    Contrairement à `_rendements_hebdomadaires_twr` ci-dessus, une semaine dégénérée
    (`valeur_portefeuille` nulle en début de semaine) compte ici pour un rendement de
    0 % plutôt que d'être omise : cette série doit rester de la MÊME longueur que
    `points`, point par point, pour s'aligner avec la série de l'indice de référence —
    l'omettre décalerait tous les points suivants les uns par rapport aux autres.
    Mathématiquement équivalent sur le cumul final (multiplier par `1 + 0` ne change
    rien au produit), seule la position dans la série diffère."""
    if not points:
        return []
    resultat = [0.0]
    cumule = 1.0
    for i in range(1, len(points)):
        v_debut = _valeur_totale(points[i - 1])
        v_fin = _valeur_totale(points[i])
        flux_semaine = points[i]["valeur_investie"] - points[i - 1]["valeur_investie"]
        r = (v_fin - flux_semaine) / v_debut - 1 if v_debut > 0 else 0.0
        cumule *= 1 + r
        resultat.append((cumule - 1) * 100)
    return resultat


def _max_drawdown_et_recuperation(valeurs: list[float]) -> tuple[float, bool, int | None]:
    """`max_drawdown` en fraction négative (0.0 si jamais de baisse), `recupere`
    (la valeur est-elle revenue au niveau du pic d'avant-drawdown, à date
    d'aujourd'hui), `semaines_recuperation` (délai entre le creux et la
    récupération, `None` si non récupéré ou sans drawdown)."""
    if not valeurs:
        return 0.0, True, None

    peak = valeurs[0]
    peak_idx = 0
    max_dd = 0.0
    trough_idx = 0
    peak_idx_au_creux = 0
    for i, v in enumerate(valeurs):
        if v > peak:
            peak = v
            peak_idx = i
        dd = (v - peak) / peak if peak > 0 else 0.0
        if dd < max_dd:
            max_dd = dd
            trough_idx = i
            peak_idx_au_creux = peak_idx

    if max_dd == 0.0:
        return 0.0, True, None

    peak_valeur = valeurs[peak_idx_au_creux]
    for j in range(trough_idx + 1, len(valeurs)):
        if valeurs[j] >= peak_valeur:
            return max_dd, True, j - trough_idx

    return max_dd, False, None


def compute_metriques_avancees(points: list[dict]) -> dict:
    """`points` : sortie de `historical_performance_service.compute_portfolio_history`
    (déjà calculée par l'appelant, jamais recalculée ici — pas de nouvel appel
    réseau). Toutes les métriques sont `None` si l'historique est trop court
    (< 2 points) pour signifier quoi que ce soit, plutôt qu'un chiffre trompeur."""
    if len(points) < 2:
        return {
            "twr_cumule_pct": None,
            "twr_annualise_pct": None,
            "volatilite_annualisee_pct": None,
            "max_drawdown_pct": None,
            "drawdown_recupere": None,
            "semaines_recuperation": None,
        }

    rendements = _rendements_hebdomadaires_twr(points)
    nb_semaines = len(rendements)

    twr_cumule = 1.0
    for r in rendements:
        twr_cumule *= 1 + r
    twr_cumule -= 1
    # `(1 + twr_cumule)` élevé à une puissance fractionnaire (nb_semaines n'est pas un
    # multiple exact de 52) : si la base est négative — un cumul <= -100 %, possible
    # avec cette approximation hebdomadaire quand un apport ponctuel est très grand
    # face à la valeur de départ de sa semaine (cf. docstring du module) — Python
    # renvoie un nombre complexe plutôt qu'une erreur, que `round()` ne sait pas gérer.
    # Annualiser une perte totale ou pire n'a de toute façon aucun sens mathématique
    # dans les réels : `None` plutôt qu'un calcul silencieusement faux ou un 500.
    base_annualisation = 1 + twr_cumule
    twr_annualise = base_annualisation ** (NOMBRE_SEMAINES_PAR_AN / nb_semaines) - 1 if nb_semaines > 0 and base_annualisation > 0 else None

    volatilite_annualisee = None
    if len(rendements) >= 2:
        moyenne = sum(rendements) / len(rendements)
        variance = sum((r - moyenne) ** 2 for r in rendements) / (len(rendements) - 1)
        volatilite_annualisee = (variance**0.5) * (NOMBRE_SEMAINES_PAR_AN**0.5)

    valeurs = [_valeur_totale(p) for p in points]
    max_dd, recupere, semaines_recuperation = _max_drawdown_et_recuperation(valeurs)

    return {
        "twr_cumule_pct": round(twr_cumule * 100, 2),
        "twr_annualise_pct": round(twr_annualise * 100, 2) if twr_annualise is not None else None,
        "volatilite_annualisee_pct": round(volatilite_annualisee * 100, 2) if volatilite_annualisee is not None else None,
        "max_drawdown_pct": round(max_dd * 100, 2),
        "drawdown_recupere": recupere,
        "semaines_recuperation": semaines_recuperation,
    }
