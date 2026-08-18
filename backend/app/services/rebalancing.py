"""Calcul des actions de rééquilibrage mécaniques : écart entre réel et cible
(définie par l'utilisateur lui-même), traduit en montant à ajuster par catégorie.
Aucune recommandation de titre précis n'est faite ici.
"""

SEUIL_ECART_PCT = 2.0


def compute_actions(
    type_: str,
    reel_par_categorie: dict[str, float],
    cibles_par_categorie: dict[str, float],
    valeur_totale: float,
) -> list[dict]:
    if valeur_totale <= 0 or not cibles_par_categorie:
        return []

    categories = set(reel_par_categorie) | set(cibles_par_categorie)
    actions = []
    for categorie in categories:
        pct_reel = (reel_par_categorie.get(categorie, 0.0) / valeur_totale) * 100
        pct_cible = cibles_par_categorie.get(categorie, 0.0)
        ecart = pct_reel - pct_cible

        if abs(ecart) < SEUIL_ECART_PCT:
            continue

        actions.append(
            {
                "type": type_,
                "categorie": categorie,
                "ecart_pourcentage": round(ecart, 1),
                "montant_a_ajuster": round(abs(ecart) / 100 * valeur_totale, 2),
                "sens": "reduire" if ecart > 0 else "augmenter",
            }
        )

    actions.sort(key=lambda a: abs(a["ecart_pourcentage"]), reverse=True)
    return actions
