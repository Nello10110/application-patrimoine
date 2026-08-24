"""LOT 6.7 : `GET /api/portfolio/holdings` renvoie une `valeur` par ligne calculée
côté serveur (au lieu que le frontend ne refasse `prix * quantite`), avec exactement
la règle de `analysis_service.value_holdings` : prix de marché, à défaut prix de
revient, `None` si ni l'un ni l'autre n'est connu."""

from datetime import datetime, timezone

from app.models import MarketDataCache
from app.services.analysis_service import value_holdings

from .conftest import make_holding


def test_valeur_coherente_avec_value_holdings_ligne_cotee_non_cotee_et_sans_prix(db, client):
    maintenant = datetime.now(timezone.utc)

    # Ligne cotée : la valeur doit utiliser le prix de marché.
    cotee = make_holding(db, ticker="COTEE", quantite=10.0, prix_revient_moyen=50.0)
    db.add(MarketDataCache(ticker="COTEE", prix_actuel=120.0, derniere_maj=maintenant))

    # Ligne non cotée (pas de MarketDataCache) : repli sur le prix de revient.
    non_cotee = make_holding(db, ticker="NONCOTEE", quantite=5.0, prix_revient_moyen=80.0)

    # Ligne sans aucun prix connu (ni marché, ni revient).
    sans_prix = make_holding(db, ticker="SANSPRIX", quantite=3.0, prix_revient_moyen=None)

    db.commit()

    attendu = {v.holding.ticker: v.valeur for v in value_holdings([cotee, non_cotee, sans_prix])}
    assert attendu["COTEE"] == 1200.0
    assert attendu["NONCOTEE"] == 400.0
    assert attendu["SANSPRIX"] == 0.0  # `value_holdings` retombe sur 0, cf. son usage dans les sommes d'analyse.

    reponse = client.get("/api/portfolio/holdings")
    assert reponse.status_code == 200
    par_ticker = {h["ticker"]: h["valeur"] for h in reponse.json()}

    assert par_ticker["COTEE"] == attendu["COTEE"]
    assert par_ticker["NONCOTEE"] == attendu["NONCOTEE"]
    # Contrairement à `value_holdings` (0 par convention interne), l'API distingue
    # l'absence totale de prix : `None`, pas 0, pour ne pas afficher une valeur fausse.
    assert par_ticker["SANSPRIX"] is None


def test_valeur_connue_pour_une_ligne_valorisee_manuellement_sans_prix_de_revient(db, client):
    """Bug corrigé en marge du backlog § 2.M.1 : un compte courant ou une épargne
    réglementée n'a normalement PAS de `prix_revient_moyen` (ce n'est pas un achat à
    un prix donné) — seule `valeur_estimee` est renseignée. `prix_connu` (routeur)
    l'ignorait avant ce correctif et renvoyait `None` malgré une valeur réellement
    connue et déjà calculée correctement par `value_holdings`."""
    make_holding(db, ticker="LIVRETA", quantite=1.0, prix_revient_moyen=None, type_actif="REGULATED_SAVINGS", valeur_estimee=10000.0)
    db.commit()

    reponse = client.get("/api/portfolio/holdings")

    assert reponse.status_code == 200
    par_ticker = {h["ticker"]: h["valeur"] for h in reponse.json()}
    assert par_ticker["LIVRETA"] == 10000.0
