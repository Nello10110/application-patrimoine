"""Simulateur de patrimoine et indépendance financière (roadmap Phase 2,
`docs/ROADMAP.md`) — calcul pur (intérêts composés mensuels + épargne mensuelle
régulière), aucune dépendance externe, aucun appel réseau. Projeté depuis le
patrimoine net actuel (`patrimoine_service.compute_patrimoine_net`), jamais recalculé
ici : ce module ne connaît que des nombres de départ, fournis par l'appelant.

Volontairement présenté comme une hypothèse, pas une promesse (cf. `routers/patrimoine.py`
et l'écran Simulateur) : un rendement annuel moyen constant est une simplification —
les marchés ne progressent jamais de façon aussi régulière dans la réalité."""

# Le taux de retrait "règle des 4 %" est un choix méthodologique documenté (étude
# Trinity, contexte américain, hypothèses propres), pas une vérité universelle —
# simple valeur par défaut, modifiable par l'utilisateur (cf. `routers/patrimoine.py`).
TAUX_RETRAIT_DEFAUT_PCT = 4.0

# Horizon maximal de recherche pour la date d'indépendance financière : au-delà, la
# question "combien d'années" perd son sens pratique — mieux vaut annoncer "non
# atteint dans cet horizon" qu'une date à 200 ans, mathématiquement correcte mais
# absurde à afficher.
HORIZON_MAX_ANNEES = 60


def compute_projection(
    valeur_depart: float, rendement_annuel_pct: float, epargne_mensuelle: float, annees: int
) -> list[dict]:
    """Trajectoire annuelle du patrimoine sur `annees` ans (point 0 = aujourd'hui),
    intérêts composés mensuels + épargne mensuelle constante. `rendement_annuel_pct`
    peut être négatif (scénario pessimiste) ; `epargne_mensuelle` peut être nulle
    (patrimoine existant seul, sans nouvel apport)."""
    taux_mensuel = rendement_annuel_pct / 100 / 12
    valeur = valeur_depart
    points = [{"annee": 0, "valeur": round(valeur, 2)}]
    for annee in range(1, annees + 1):
        for _ in range(12):
            valeur = valeur * (1 + taux_mensuel) + epargne_mensuelle
        points.append({"annee": annee, "valeur": round(valeur, 2)})
    return points


def compute_fire(
    valeur_depart: float,
    rendement_annuel_pct: float,
    epargne_mensuelle: float,
    depense_annuelle_cible: float,
    taux_retrait_pct: float,
) -> dict:
    """Patrimoine nécessaire pour l'indépendance financière (`depense_annuelle_cible /
    (taux_retrait_pct / 100)`) et nombre d'années estimé pour l'atteindre (mois par
    mois, même moteur que `compute_projection` mais sans construire toute la
    trajectoire — seul le mois d'atteinte compte ici). `annees_avant_independance`
    vaut `None` si le patrimoine nécessaire n'est pas atteint dans `HORIZON_MAX_ANNEES`
    ans avec ces hypothèses — jamais un nombre au-delà, qui laisserait croire à une
    précision que le calcul n'a pas sur un horizon aussi lointain."""
    patrimoine_necessaire = depense_annuelle_cible / (taux_retrait_pct / 100)

    if valeur_depart >= patrimoine_necessaire:
        return {"patrimoine_necessaire": round(patrimoine_necessaire, 2), "annees_avant_independance": 0.0}

    taux_mensuel = rendement_annuel_pct / 100 / 12
    valeur = valeur_depart
    for mois in range(1, HORIZON_MAX_ANNEES * 12 + 1):
        valeur = valeur * (1 + taux_mensuel) + epargne_mensuelle
        if valeur >= patrimoine_necessaire:
            return {"patrimoine_necessaire": round(patrimoine_necessaire, 2), "annees_avant_independance": round(mois / 12, 1)}

    return {"patrimoine_necessaire": round(patrimoine_necessaire, 2), "annees_avant_independance": None}
