"""Fumée : chaque route de lecture répond sur une base vide, sans appel réseau."""

import pytest

ROUTES_GET = [
    "/api/health",
    "/api/portfolio/holdings",
    "/api/performance",
    "/api/performance/history",
    "/api/analysis/2024",
    "/api/analysis/comptes",
    "/api/targets/defaults",
    "/api/targets/",
    "/api/settings/jobs",
    "/api/settings/preferences",
    "/api/market-data",
    "/api/transactions/count",
]


@pytest.mark.parametrize("route", ROUTES_GET)
def test_route_repond_200_sur_base_vide(client, route):
    reponse = client.get(route)
    assert reponse.status_code == 200
