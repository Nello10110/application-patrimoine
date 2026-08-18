"""Verrouille le comportement actuel du calcul des actions de rééquilibrage."""

from app.services.rebalancing import compute_actions


def test_seuil_de_deux_points_respecte():
    # Écart de 1 point (21% réel vs 20% cible) : sous le seuil, aucune action.
    actions = compute_actions("geo", {"Europe": 210.0}, {"Europe": 20.0}, valeur_totale=1000.0)
    assert actions == []

    # Écart de 3 points (23% réel vs 20% cible) : au-dessus du seuil, une action.
    actions = compute_actions("geo", {"Europe": 230.0}, {"Europe": 20.0}, valeur_totale=1000.0)
    assert len(actions) == 1


def test_sens_reduire_quand_reel_superieur_a_la_cible():
    actions = compute_actions("geo", {"Europe": 250.0}, {"Europe": 20.0}, valeur_totale=1000.0)
    assert actions[0]["sens"] == "reduire"


def test_sens_augmenter_quand_reel_inferieur_a_la_cible():
    actions = compute_actions("geo", {"Europe": 150.0}, {"Europe": 20.0}, valeur_totale=1000.0)
    assert actions[0]["sens"] == "augmenter"


def test_montant_a_ajuster_en_euros():
    # Réel 25% vs cible 20% : écart de 5 points -> 5% * 1000€ = 50€.
    actions = compute_actions("geo", {"Europe": 250.0}, {"Europe": 20.0}, valeur_totale=1000.0)
    assert actions[0]["ecart_pourcentage"] == 5.0
    assert actions[0]["montant_a_ajuster"] == 50.0


def test_aucune_action_sans_cible():
    actions = compute_actions("geo", {"Europe": 500.0}, {}, valeur_totale=1000.0)
    assert actions == []
