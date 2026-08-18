"""Verrouille le comportement actuel du calcul de rentabilité : `xirr` et
`compute_holding_returns`."""

from datetime import datetime, timezone

import pytest

from app.models import Holding, MarketDataCache
from app.services.performance_service import compute_holding_returns, xirr
from app.services.portfolio_reconstruction import rebuild_holdings

from .conftest import make_transaction


def test_xirr_doublement_en_un_an_environ_100_pourcent():
    flux = [(datetime(2023, 1, 1), -1000.0), (datetime(2024, 1, 1), 2000.0)]
    resultat = xirr(flux)
    assert resultat == pytest.approx(100.0, abs=0.5)


def test_xirr_none_si_moins_de_deux_flux():
    assert xirr([]) is None
    assert xirr([(datetime(2024, 1, 1), 100.0)]) is None


def test_xirr_none_si_tous_les_flux_ont_le_meme_signe():
    flux = [(datetime(2023, 1, 1), 100.0), (datetime(2024, 1, 1), 200.0)]
    assert xirr(flux) is None


def test_rendement_depuis_achat_prix_actuel_sur_prix_de_revient(db):
    db.add(Holding(ticker="XYZ", nom="Titre XYZ", quantite=10.0, prix_revient_moyen=100.0))
    db.add(
        MarketDataCache(
            ticker="XYZ",
            prix_actuel=120.0,
            derniere_maj=datetime.now(timezone.utc),
        )
    )
    db.commit()

    resultats = compute_holding_returns(db)

    assert resultats["XYZ"]["rendement_depuis_achat_pct"] == 20.0


def test_pas_de_rendement_annualise_sans_prix_de_marche_reel(db):
    # Position reconstruite (donc avec des flux de trésorerie réels)...
    make_transaction(db, symbol="ABC", shares=10.0, amount=-1000.0)
    rebuild_holdings(db)

    # ... mais sans aucune cotation en cache : la ligne est valorisée à son coût
    # (`a_des_donnees=False`), donc pas de XIRR affiché même si des flux existent.
    resultats = compute_holding_returns(db)

    assert resultats["ABC"]["rendement_annualise_pct"] is None
