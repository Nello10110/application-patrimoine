"""Verrouille le service justETF (backlog 2.4) : extraction du HTML statique de la
fiche ETF (`fetch_composition`), remplacement complet des lignes `FundComposition`
existantes en cas de succès (`refresh_all`), non-régression en cas d'échec, et
throttling entre deux ISIN — sans aucun appel réseau réel (`_fetch_page_html`,
seul point d'entrée réseau du module, est monkeypatché dans chaque test qui en a
besoin, sur le même principe que `yf.Ticker`/`yf.Search` dans
`test_market_data_service.py`)."""

import pytest

from app.models import SOURCE_COMPOSITION, SOURCE_JUSTETF, FundComposition
from app.services import justetf_service
from app.services.reference_indices import SECTEUR_AUTRES, ZONE_AMERIQUE_DU_NORD, ZONE_AUTRES, ZONE_JAPON

from .conftest import make_holding

# Fragment HTML mimant la structure réelle repérée sur la fiche justETF
# (`data-testid="etf-holdings_countries_row"`/`"etf-holdings_sectors_row"` et leurs
# enfants `..._value_name`/`..._value_percentage`) : deux pays connus + une ligne
# résiduelle "Other", deux secteurs connus + une ligne résiduelle "Other".
HTML_FICHE_VALIDE = """
<html><body>
<div data-testid="etf-holdings_countries_row">
  <span data-testid="tl_etf-holdings_countries_value_name">United States</span>
  <span data-testid="tl_etf-holdings_countries_value_percentage">65.00%</span>
</div>
<div data-testid="etf-holdings_countries_row">
  <span data-testid="tl_etf-holdings_countries_value_name">Japan</span>
  <span data-testid="tl_etf-holdings_countries_value_percentage">10.00%</span>
</div>
<div data-testid="etf-holdings_countries_row">
  <span data-testid="tl_etf-holdings_countries_value_name">Other</span>
  <span data-testid="tl_etf-holdings_countries_value_percentage">25.00%</span>
</div>
<div data-testid="etf-holdings_sectors_row">
  <span data-testid="tl_etf-holdings_sectors_value_name">Technology</span>
  <span data-testid="tl_etf-holdings_sectors_value_percentage">40.00%</span>
</div>
<div data-testid="etf-holdings_sectors_row">
  <span data-testid="tl_etf-holdings_sectors_value_name">Finance</span>
  <span data-testid="tl_etf-holdings_sectors_value_percentage">30.00%</span>
</div>
<div data-testid="etf-holdings_sectors_row">
  <span data-testid="tl_etf-holdings_sectors_value_name">Other</span>
  <span data-testid="tl_etf-holdings_sectors_value_percentage">30.00%</span>
</div>
</body></html>
"""

HTML_PAYS_INCONNU = """
<html><body>
<div data-testid="etf-holdings_countries_row">
  <span data-testid="tl_etf-holdings_countries_value_name">Atlantis</span>
  <span data-testid="tl_etf-holdings_countries_value_percentage">100.00%</span>
</div>
</body></html>
"""

HTML_SANS_DONNEES = "<html><body><p>Page inattendue, aucune donnée pays/secteurs.</p></body></html>"


# ---------------------------------------------------------------------------
# `fetch_composition` — extraction HTML
# ---------------------------------------------------------------------------


def test_fetch_composition_parse_le_html_et_normalise_les_poids(monkeypatch):
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: HTML_FICHE_VALIDE)

    resultat = justetf_service.fetch_composition("IE00B4L5Y983")

    assert resultat is not None
    geo_rows, sector_rows = resultat

    geo_par_categorie = {row["categorie"]: row["poids"] for row in geo_rows}
    assert geo_par_categorie[ZONE_AMERIQUE_DU_NORD] == pytest.approx(0.65)
    assert geo_par_categorie[ZONE_JAPON] == pytest.approx(0.10)
    # La ligne "Other" bascule sur ZONE_AUTRES, pas sur `region_for_country("Other")`.
    assert geo_par_categorie[ZONE_AUTRES] == pytest.approx(0.25)
    assert sum(row["poids"] for row in geo_rows) == pytest.approx(1.0, abs=1e-9)

    secteur_par_categorie = {row["categorie"]: row["poids"] for row in sector_rows}
    assert secteur_par_categorie["Technologies de l'information"] == pytest.approx(0.40)
    assert secteur_par_categorie["Financières"] == pytest.approx(0.30)
    assert secteur_par_categorie[SECTEUR_AUTRES] == pytest.approx(0.30)
    assert sum(row["poids"] for row in sector_rows) == pytest.approx(1.0, abs=1e-9)

    # Aucun champ `source` : posé par l'appelant (`refresh_all`) à la persistance.
    assert all("source" not in row for row in geo_rows + sector_rows)


def test_fetch_composition_pays_hors_table_bascule_sur_zone_autres(monkeypatch):
    """Un pays réel mais absent de `COUNTRY_TO_REGION` ne doit pas planter
    l'extraction : `region_for_country` route déjà ce cas vers `ZONE_AUTRES` (pas
    "Non catégorisé", puisque le pays est bien renseigné) — ce test confirme que
    l'intégration avec `fetch_composition` respecte ce comportement existant."""
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: HTML_PAYS_INCONNU)

    resultat = justetf_service.fetch_composition("FR0000000000")

    assert resultat is not None
    geo_rows, _sector_rows = resultat
    assert geo_rows == [{"categorie": ZONE_AUTRES, "poids": pytest.approx(1.0)}]


def test_fetch_composition_echec_reseau_renvoie_none(monkeypatch):
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: None)

    assert justetf_service.fetch_composition("IE00B4L5Y983") is None


def test_fetch_composition_html_sans_donnees_renvoie_none(monkeypatch):
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: HTML_SANS_DONNEES)

    assert justetf_service.fetch_composition("IE00B4L5Y983") is None


def test_fetch_page_html_erreur_requests_ne_leve_jamais(monkeypatch):
    """Vérifie l'isolation réseau elle-même (`_fetch_page_html`), pas seulement le
    comportement déjà couvert au-dessus via son monkeypatch direct."""
    import app.services.justetf_service as module

    class SessionDefaillante:
        def get(self, *args, **kwargs):
            raise ConnectionError("panne réseau simulée")

    monkeypatch.setattr(module.requests, "get", SessionDefaillante().get)

    assert module._fetch_page_html("https://www.justetf.com/en/etf-profile.html?isin=X") is None


def test_fetch_page_html_statut_non_200_renvoie_none(monkeypatch):
    import app.services.justetf_service as module

    class FausseReponse:
        status_code = 404
        text = "Not Found"

    monkeypatch.setattr(module.requests, "get", lambda *a, **k: FausseReponse())

    assert module._fetch_page_html("https://www.justetf.com/en/etf-profile.html?isin=X") is None


# ---------------------------------------------------------------------------
# `refresh_all` — remplacement complet / non-régression / throttling
# ---------------------------------------------------------------------------


def test_refresh_all_remplace_toutes_les_lignes_existantes_en_cas_de_succes(db, monkeypatch):
    make_holding(db, ticker="IE00B4L5Y983", type_actif="FUND")
    db.add(FundComposition(ticker="IE00B4L5Y983", type="geo", categorie="Ancienne zone", poids=1.0, source=SOURCE_COMPOSITION))
    db.commit()

    nouvelles_lignes = (
        [{"categorie": ZONE_AMERIQUE_DU_NORD, "poids": 1.0}],
        [{"categorie": "Financières", "poids": 1.0}],
    )
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: nouvelles_lignes)

    resume = justetf_service.refresh_all(db)

    assert resume == {"traites": 1, "reussis": 1}
    lignes = db.query(FundComposition).filter(FundComposition.ticker == "IE00B4L5Y983").all()
    assert len(lignes) == 2
    assert all(ligne.source == SOURCE_JUSTETF for ligne in lignes)
    categories = {ligne.categorie for ligne in lignes}
    assert categories == {ZONE_AMERIQUE_DU_NORD, "Financières"}


def test_refresh_all_echec_laisse_les_lignes_existantes_intactes(db, monkeypatch):
    make_holding(db, ticker="IE00B4L5Y983", type_actif="FUND")
    db.add(FundComposition(ticker="IE00B4L5Y983", type="geo", categorie="Ancienne zone", poids=1.0, source=SOURCE_COMPOSITION))
    db.commit()

    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: None)

    resume = justetf_service.refresh_all(db)

    assert resume == {"traites": 1, "reussis": 0}
    lignes = db.query(FundComposition).filter(FundComposition.ticker == "IE00B4L5Y983").all()
    assert len(lignes) == 1
    assert lignes[0].categorie == "Ancienne zone"
    assert lignes[0].source == SOURCE_COMPOSITION


def test_refresh_all_ignore_les_holdings_non_fund(db, monkeypatch):
    make_holding(db, ticker="AAPL", type_actif="STOCK")

    appels = []
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: appels.append(isin) or None)

    resume = justetf_service.refresh_all(db)

    assert resume == {"traites": 0, "reussis": 0}
    assert appels == []


def test_delai_entre_appels_justetf_neutralise_sous_test():
    """`backend/conftest.py` pose `PATRIMOINE_TESTING` avant tout import de
    l'application : le module doit avoir lu cette variable à l'import, comme
    `market_data_service.DELAI_ENTRE_APPELS_SECONDES`."""
    assert justetf_service.DELAI_ENTRE_APPELS_JUSTETF_SECONDES == 0.0


def test_refresh_all_temporise_entre_deux_isin(db, monkeypatch):
    make_holding(db, ticker="AAA", type_actif="FUND")
    make_holding(db, ticker="BBB", type_actif="FUND")
    make_holding(db, ticker="CCC", type_actif="FUND")

    appels_sleep = []
    monkeypatch.setattr(justetf_service, "DELAI_ENTRE_APPELS_JUSTETF_SECONDES", 2.0)
    monkeypatch.setattr(justetf_service.time, "sleep", lambda s: appels_sleep.append(s))
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: None)

    justetf_service.refresh_all(db)

    # Une temporisation entre chaque paire d'ISIN consécutifs, jamais avant le
    # tout premier — même garde que `market_data_service.refresh_tickers`.
    assert appels_sleep == [2.0, 2.0]


def test_refresh_all_ne_temporise_pas_si_delai_nul(db, monkeypatch):
    make_holding(db, ticker="AAA", type_actif="FUND")
    make_holding(db, ticker="BBB", type_actif="FUND")

    appels_sleep = []
    monkeypatch.setattr(justetf_service, "DELAI_ENTRE_APPELS_JUSTETF_SECONDES", 0.0)
    monkeypatch.setattr(justetf_service.time, "sleep", lambda s: appels_sleep.append(s))
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: None)

    justetf_service.refresh_all(db)

    assert appels_sleep == []
