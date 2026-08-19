"""Verrouille les alertes de rééquilibrage (LOT 5.5) : sous-ensemble des
recommandations dont l'écart absolu dépasse le seuil réglable (défaut 5 points),
distinct du seuil fixe de 2 points qui décide, lui, si une recommandation existe."""

from datetime import datetime, timezone

from app.models import AllocationTarget, Holding, MarketDataCache


def _construire_portefeuille(db):
    """Portefeuille de 1000€ : 300€ (30%) en Europe, 700€ (70%) en Amérique du Nord.
    Cibles : Europe 20% (écart de 10 points), Amérique du Nord 67% (écart de 3
    points) — le premier dépasse le seuil d'alerte par défaut (5 points), pas le
    second (recommandation simple, > seuil de 2 points mais < 5)."""
    now = datetime.now(timezone.utc)
    db.add(Holding(ticker="EU1", quantite=1.0, prix_revient_moyen=300.0))
    db.add(MarketDataCache(ticker="EU1", prix_actuel=300.0, region="Europe", derniere_maj=now))
    db.add(Holding(ticker="US1", quantite=1.0, prix_revient_moyen=700.0))
    db.add(MarketDataCache(ticker="US1", prix_actuel=700.0, region="Amérique du Nord", derniere_maj=now))
    db.add(AllocationTarget(annee=2024, type="geo", categorie="Europe", pourcentage_cible=20.0))
    db.add(AllocationTarget(annee=2024, type="geo", categorie="Amérique du Nord", pourcentage_cible=67.0))
    db.commit()


def test_alerte_seulement_au_dessus_du_seuil_par_defaut(client, db):
    _construire_portefeuille(db)

    corps = client.get("/api/analysis/2024").json()

    categories_recommandees = {a["categorie"] for a in corps["recommandations"]}
    assert categories_recommandees == {"Europe", "Amérique du Nord"}  # les deux dépassent le seuil de 2 points

    categories_alertees = {a["categorie"] for a in corps["alertes"]}
    assert categories_alertees == {"Europe"}  # seule Europe dépasse le seuil d'alerte par défaut (5 points)


def test_seuil_d_alerte_reduit_fait_apparaitre_une_alerte_supplementaire(client, db):
    _construire_portefeuille(db)
    client.put("/api/settings/preferences", json={"methode_cout": "cout_moyen_pondere", "seuil_alerte_ecart_pct": 2.5})

    corps = client.get("/api/analysis/2024").json()

    categories_alertees = {a["categorie"] for a in corps["alertes"]}
    assert categories_alertees == {"Europe", "Amérique du Nord"}  # écart de 3 points dépasse maintenant 2.5


def test_aucune_alerte_sans_ecart_au_dessus_du_seuil(client, db):
    now = datetime.now(timezone.utc)
    db.add(Holding(ticker="EU1", quantite=1.0, prix_revient_moyen=1000.0))
    db.add(MarketDataCache(ticker="EU1", prix_actuel=1000.0, region="Europe", derniere_maj=now))
    db.add(AllocationTarget(annee=2024, type="geo", categorie="Europe", pourcentage_cible=100.0))
    db.commit()

    corps = client.get("/api/analysis/2024").json()

    assert corps["recommandations"] == []
    assert corps["alertes"] == []
