"""Verrouille le service justETF (backlog 2.4) : extraction du HTML statique de la
fiche ETF (`fetch_composition`), l'API JSON de cotation (`fetch_price`),
remplacement complet des lignes `FundComposition`/`FundCompositionBrute`
existantes en cas de succès (`refresh_all`), non-régression en cas d'échec, et
throttling entre deux ISIN — sans aucun appel réseau réel (`requests.get`, seul
point d'entrée réseau du module, est neutralisé par défaut par la fixture
autouse `no_network_justetf`, et `_fetch_page_html` est directement monkeypatché
dans les tests qui n'ont besoin que de contrôler le HTML retourné — même principe
que `yf.Ticker`/`yf.Search` dans `test_market_data_service.py`)."""

import pytest

from app.models import SOURCE_COMPOSITION, SOURCE_JUSTETF, FundComposition, FundCompositionBrute, FundTopHolding, MarketDataCache
from app.services import justetf_service
from app.services.reference_indices import JUSTETF_SECTOR_LABELS, SECTEUR_AUTRES, ZONE_AMERIQUE_DU_NORD, ZONE_AUTRES, ZONE_JAPON

from .conftest import make_holding

# Fragment HTML mimant la structure réelle repérée sur la fiche justETF
# (`data-testid="etf-holdings_countries_row"`/`"etf-holdings_sectors_row"` et leurs
# enfants `..._value_name`/`..._value_percentage`, plus la description complète) :
# deux pays connus + une ligne résiduelle "Other", deux secteurs connus + une
# ligne résiduelle "Other", et une description avec espaces/retours à la ligne
# multiples (pour vérifier leur réduction à un seul espace).
HTML_FICHE_VALIDE = """
<html><body>
<div data-testid="etf-quote-section_description-content-inner">
  This ETF   tracks
  the MSCI World Index.
</div>
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

# Fiche en français (2.5/2.6, retour utilisateur du 19/08/2026) : description en
# français (structure identique à la page anglaise, texte différent) + les 10
# principales positions (`data-testid` réels repérés sur FR0010361683).
HTML_FICHE_FR = """
<html><body>
<div data-testid="etf-quote-section_description-content-inner">
  Cet ETF suit l'indice MSCI India.
</div>
<div data-testid="etf-holdings_top-holdings_row">
  <a data-testid="tl_etf-holdings_top-holdings_link_name">HDFC Bank Ltd.</a>
  <span data-testid="tl_etf-holdings_top-holdings_value_percentage">6,79%</span>
</div>
<div data-testid="etf-holdings_top-holdings_row">
  <a data-testid="tl_etf-holdings_top-holdings_link_name">Reliance Industries Ltd.</a>
  <span data-testid="tl_etf-holdings_top-holdings_value_percentage">6,05%</span>
</div>
</body></html>
"""

# Fiche justETF d'un ETF à réplication synthétique/ETC (pas d'onglet Holdings,
# ex. LU1681048630 vérifié en conditions réelles) : la description est présente
# alors qu'aucune ligne pays/secteur ne l'est — verrouille le découplage décrit
# dans la docstring de `fetch_composition` (Increment 9).
HTML_DESCRIPTION_SANS_HOLDINGS = """
<html><body>
<div data-testid="etf-quote-section_description-content-inner">
  This ETC provides exposure to gold bullion via a synthetic swap structure.
</div>
</body></html>
"""


# ---------------------------------------------------------------------------
# `fetch_composition` — extraction HTML
# ---------------------------------------------------------------------------


def test_fetch_composition_parse_le_html_et_normalise_les_poids(monkeypatch):
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: HTML_FICHE_VALIDE)

    fiche = justetf_service.fetch_composition("IE00B4L5Y983")

    assert fiche is not None
    geo_rows, sector_rows = fiche.geo_rows, fiche.sector_rows

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

    # Description : texte complet, espaces/retours à la ligne multiples réduits.
    assert fiche.description == "This ETF tracks the MSCI World Index."


def test_fetch_composition_geo_brut_et_sector_brut_gardent_les_noms_bruts(monkeypatch):
    """`geo_brut`/`sector_brut` (2.4, Increment 9) exposent les noms tels
    qu'affichés par justETF (ex. "United States", pas "Amérique du Nord"), pour la
    section détaillée de la fiche position — poids renormalisés à 1,0 comme les
    lignes zone-mappées."""
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: HTML_FICHE_VALIDE)

    fiche = justetf_service.fetch_composition("IE00B4L5Y983")

    assert fiche is not None
    geo_brut_par_nom = {row["categorie"]: row["poids"] for row in fiche.geo_brut}
    assert geo_brut_par_nom == {
        "United States": pytest.approx(0.65),
        "Japan": pytest.approx(0.10),
        "Other": pytest.approx(0.25),
    }
    assert sum(row["poids"] for row in fiche.geo_brut) == pytest.approx(1.0, abs=1e-9)

    sector_brut_par_nom = {row["categorie"]: row["poids"] for row in fiche.sector_brut}
    assert sector_brut_par_nom == {
        "Technology": pytest.approx(0.40),
        "Finance": pytest.approx(0.30),
        "Other": pytest.approx(0.30),
    }
    assert sum(row["poids"] for row in fiche.sector_brut) == pytest.approx(1.0, abs=1e-9)


def test_fetch_composition_pays_hors_table_bascule_sur_zone_autres(monkeypatch):
    """Un pays réel mais absent de `COUNTRY_TO_REGION` ne doit pas planter
    l'extraction : `region_for_country` route déjà ce cas vers `ZONE_AUTRES` (pas
    "Non catégorisé", puisque le pays est bien renseigné) — ce test confirme que
    l'intégration avec `fetch_composition` respecte ce comportement existant."""
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: HTML_PAYS_INCONNU)

    fiche = justetf_service.fetch_composition("FR0000000000")

    assert fiche is not None
    assert fiche.geo_rows == [{"categorie": ZONE_AUTRES, "poids": pytest.approx(1.0)}]


def test_fetch_composition_echec_reseau_renvoie_none(monkeypatch):
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: None)

    assert justetf_service.fetch_composition("IE00B4L5Y983") is None


def test_fetch_composition_html_sans_donnees_renvoie_fiche_vide(monkeypatch):
    """La page a bien été récupérée et parsée sans erreur : ce n'est pas un échec
    (`None`), seulement une fiche sans aucune donnée exploitable — distinction
    introduite par l'Increment 9 (cf. docstring de `fetch_composition`)."""
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: HTML_SANS_DONNEES)

    fiche = justetf_service.fetch_composition("IE00B4L5Y983")

    assert fiche is not None
    assert fiche.geo_rows == []
    assert fiche.sector_rows == []
    assert fiche.geo_brut == []
    assert fiche.sector_brut == []
    assert fiche.description is None


def test_fetch_composition_renvoie_la_description_meme_sans_holdings(monkeypatch):
    """Verrouille le point clé de l'Increment 9 (2.4) : un ETF sans onglet
    Holdings (réplication synthétique/ETC, ex. LU1681048630 vérifié en conditions
    réelles) a quand même sa description extraite — `fetch_composition` ne doit
    plus renvoyer `None` en bloc simplement parce que geo_rows/sector_rows sont
    vides, puisque la description est indépendante du succès de la composition."""
    monkeypatch.setattr(justetf_service, "_fetch_page_html", lambda url: HTML_DESCRIPTION_SANS_HOLDINGS)

    fiche = justetf_service.fetch_composition("LU1681048630")

    assert fiche is not None
    assert fiche.geo_rows == []
    assert fiche.sector_rows == []
    assert fiche.geo_brut == []
    assert fiche.sector_brut == []
    assert fiche.description == "This ETC provides exposure to gold bullion via a synthetic swap structure."


def test_fetch_composition_description_et_top_holdings_viennent_de_la_page_francaise(monkeypatch):
    """2.5/2.6 (retour utilisateur du 19/08/2026 : description en anglais au lieu du
    français vu sur justETF, top 10 absent) : la géo/secteur continue de venir de la
    page anglaise (taxonomie déjà auditée sur les 26 ETF réels, Increment 9), mais la
    description et le top 10 viennent d'une requête séparée sur la page française."""
    appels = []

    def fausse_fetch(url):
        appels.append(url)
        return HTML_FICHE_FR if "/fr/" in url else HTML_FICHE_VALIDE

    monkeypatch.setattr(justetf_service, "_fetch_page_html", fausse_fetch)

    fiche = justetf_service.fetch_composition("FR0010361683")

    assert fiche is not None
    # Géo/secteur : toujours ceux de la page anglaise (HTML_FICHE_VALIDE), inchangés.
    assert {row["categorie"] for row in fiche.geo_rows} != set()

    # Description : celle de la page FRANÇAISE ("Cet ETF..."), pas celle de la page
    # anglaise ("This ETF...") — c'est précisément le bug signalé par l'utilisateur.
    assert fiche.description == "Cet ETF suit l'indice MSCI India."

    # Top 10 : poids gardés tels quels, PAS renormalisés à 1,0 (contrairement à
    # geo_rows/sector_rows) — la somme légitime du top 10 est < 100% du fonds.
    assert fiche.top_holdings == [
        {"nom": "HDFC Bank Ltd.", "poids": pytest.approx(0.0679)},
        {"nom": "Reliance Industries Ltd.", "poids": pytest.approx(0.0605)},
    ]
    assert sum(row["poids"] for row in fiche.top_holdings) < 1.0

    # Une requête vers chaque locale, isolées l'une de l'autre.
    assert any("/en/etf-profile.html?isin=FR0010361683" in u for u in appels)
    assert any("/fr/etf-profile.html?isin=FR0010361683" in u for u in appels)


def test_fetch_composition_echec_page_francaise_garde_la_composition_anglaise(monkeypatch):
    """Best effort (2.5/2.6) : un échec réseau sur la seule page française ne doit
    jamais invalider la composition géo/secteur déjà extraite de la page anglaise."""

    def fausse_fetch(url):
        return None if "/fr/" in url else HTML_FICHE_VALIDE

    monkeypatch.setattr(justetf_service, "_fetch_page_html", fausse_fetch)

    fiche = justetf_service.fetch_composition("IE00B4L5Y983")

    assert fiche is not None
    assert fiche.geo_rows != []
    assert fiche.description is None
    assert fiche.top_holdings == []


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
# `JUSTETF_SECTOR_LABELS` — variante de taxonomie corrigée (Increment 9)
# ---------------------------------------------------------------------------


def test_justetf_sector_labels_couvre_la_seconde_variante_de_taxonomie():
    """Audit sur les 26 ETF réels du portefeuille (Increment 9) : ces 4 libellés,
    absents de la table initiale (construite sur un seul fonds de reconnaissance),
    faisaient basculer jusqu'à ~56% d'un fonds dans SECTEUR_AUTRES à tort (ex. les
    3 déclinaisons MSCI India)."""
    assert JUSTETF_SECTOR_LABELS["Consumer Cyclicals"] == "Consommation discrétionnaire"
    assert JUSTETF_SECTOR_LABELS["Consumer Non-Cyclicals"] == "Consommation de base"
    assert JUSTETF_SECTOR_LABELS["Non-Energy Materials"] == "Matériaux"
    assert JUSTETF_SECTOR_LABELS["Telecommunication"] == "Communication"
    # Les entrées de la première variante (taxonomie initiale) doivent survivre.
    assert JUSTETF_SECTOR_LABELS["Consumer Discretionary"] == "Consommation discrétionnaire"


# ---------------------------------------------------------------------------
# `fetch_price` — cotation de référence via l'API JSON justETF
# ---------------------------------------------------------------------------


class _FausseReponseJSON:
    def __init__(self, status_code: int, corps: dict):
        self.status_code = status_code
        self._corps = corps

    def json(self):
        return self._corps


def test_fetch_price_succes_extrait_le_prix_deja_en_eur(monkeypatch):
    reponse = _FausseReponseJSON(200, {"latestQuote": {"raw": 127.09}, "latestQuoteDate": "2026-08-19"})
    monkeypatch.setattr(justetf_service.requests, "get", lambda *a, **k: reponse)

    resultat = justetf_service.fetch_price("IE00B4L5Y983")

    assert resultat == {"prix_actuel": pytest.approx(127.09)}


def test_fetch_price_echec_reseau_renvoie_none(monkeypatch):
    def leve(*args, **kwargs):
        raise ConnectionError("panne réseau simulée")

    monkeypatch.setattr(justetf_service.requests, "get", leve)

    assert justetf_service.fetch_price("IE00B4L5Y983") is None


def test_fetch_price_statut_non_200_renvoie_none(monkeypatch):
    reponse = _FausseReponseJSON(404, {})
    monkeypatch.setattr(justetf_service.requests, "get", lambda *a, **k: reponse)

    assert justetf_service.fetch_price("IE00B4L5Y983") is None


def test_fetch_price_json_inattendu_renvoie_none(monkeypatch):
    """Clé `latestQuote` absente (structure de réponse inattendue) : ne doit
    jamais lever, seulement renvoyer `None` comme les autres échecs."""
    reponse = _FausseReponseJSON(200, {"autreChose": True})
    monkeypatch.setattr(justetf_service.requests, "get", lambda *a, **k: reponse)

    assert justetf_service.fetch_price("IE00B4L5Y983") is None


# ---------------------------------------------------------------------------
# `refresh_all` — remplacement complet / non-régression / throttling
# ---------------------------------------------------------------------------


def test_refresh_all_remplace_toutes_les_lignes_existantes_en_cas_de_succes(db, monkeypatch):
    make_holding(db, ticker="IE00B4L5Y983", type_actif="FUND")
    db.add(FundComposition(ticker="IE00B4L5Y983", type="geo", categorie="Ancienne zone", poids=1.0, source=SOURCE_COMPOSITION))
    db.add(FundCompositionBrute(ticker="IE00B4L5Y983", type="geo", categorie="Ancien pays brut", poids=1.0))
    db.commit()

    nouvelle_fiche = justetf_service.FicheJustETF(
        geo_rows=[{"categorie": ZONE_AMERIQUE_DU_NORD, "poids": 1.0}],
        sector_rows=[{"categorie": "Financières", "poids": 1.0}],
        geo_brut=[{"categorie": "United States", "poids": 1.0}],
        sector_brut=[{"categorie": "Finance", "poids": 1.0}],
        description="Un fonds qui suit le marché américain.",
    )
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: nouvelle_fiche)

    resume = justetf_service.refresh_all(db)

    assert resume == {"traites": 1, "reussis": 1}
    lignes = db.query(FundComposition).filter(FundComposition.ticker == "IE00B4L5Y983").all()
    assert len(lignes) == 2
    assert all(ligne.source == SOURCE_JUSTETF for ligne in lignes)
    categories = {ligne.categorie for ligne in lignes}
    assert categories == {ZONE_AMERIQUE_DU_NORD, "Financières"}

    # Détail brut (2.4) écrit en plus, depuis la même fiche — remplace l'ancienne ligne.
    lignes_brutes = db.query(FundCompositionBrute).filter(FundCompositionBrute.ticker == "IE00B4L5Y983").all()
    assert len(lignes_brutes) == 2
    categories_brutes = {ligne.categorie for ligne in lignes_brutes}
    assert categories_brutes == {"United States", "Finance"}

    # Description upsertée dans MarketDataCache (ligne créée, n'existait pas).
    md = db.get(MarketDataCache, "IE00B4L5Y983")
    assert md is not None
    assert md.description == "Un fonds qui suit le marché américain."


def test_refresh_all_ecrit_la_description_meme_sans_composition(db, monkeypatch):
    """Un ETF sans composition couverte (réplication synthétique/ETC) obtient
    quand même sa description — les deux axes sont délibérément découplés
    (Increment 9) : `reussis` ne compte que les compositions écrites."""
    make_holding(db, ticker="LU1681048630", type_actif="FUND")

    fiche_sans_holdings = justetf_service.FicheJustETF(description="Réplique le cours de l'or par un swap synthétique.")
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: fiche_sans_holdings)

    resume = justetf_service.refresh_all(db)

    assert resume == {"traites": 1, "reussis": 0}
    assert db.query(FundComposition).filter(FundComposition.ticker == "LU1681048630").count() == 0
    assert db.query(FundCompositionBrute).filter(FundCompositionBrute.ticker == "LU1681048630").count() == 0
    md = db.get(MarketDataCache, "LU1681048630")
    assert md is not None
    assert md.description == "Réplique le cours de l'or par un swap synthétique."


def test_refresh_all_ecrit_les_top_holdings(db, monkeypatch):
    """2.6 : les 10 principales positions sont écrites dans `FundTopHolding`, sans
    ticker Yahoo résoluble (justETF ne donne qu'un nom d'entreprise) — `holding_symbol`
    et `holding_nom` portent donc la même valeur (le nom), `pays`/`secteur` restent
    `None` (non fournis par le top 10 lui-même, déjà couverts par ailleurs via
    `FundComposition`/`FundCompositionBrute`)."""
    make_holding(db, ticker="FR0010361683", type_actif="FUND")
    db.add(FundTopHolding(ticker="FR0010361683", holding_symbol="Ancienne ligne", holding_nom="Ancienne ligne", poids=1.0))
    db.commit()

    nouvelle_fiche = justetf_service.FicheJustETF(
        geo_rows=[{"categorie": ZONE_AMERIQUE_DU_NORD, "poids": 1.0}],
        top_holdings=[
            {"nom": "HDFC Bank Ltd.", "poids": 0.0679},
            {"nom": "Reliance Industries Ltd.", "poids": 0.0605},
        ],
    )
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: nouvelle_fiche)

    justetf_service.refresh_all(db)

    lignes = (
        db.query(FundTopHolding)
        .filter(FundTopHolding.ticker == "FR0010361683")
        .order_by(FundTopHolding.poids.desc())
        .all()
    )
    assert [l.holding_symbol for l in lignes] == ["HDFC Bank Ltd.", "Reliance Industries Ltd."]
    assert lignes[0].holding_nom == "HDFC Bank Ltd."
    assert lignes[0].poids == pytest.approx(0.0679)
    assert lignes[0].pays is None
    assert lignes[0].secteur is None


def test_refresh_all_top_holdings_vide_laisse_les_lignes_existantes_intactes(db, monkeypatch):
    """Un top 10 vide dans la fiche (échec de la page française, cf. 2.5/2.6) ne
    doit jamais effacer un top 10 déjà en base — même découplage que `description`."""
    make_holding(db, ticker="FR0010361683", type_actif="FUND")
    db.add(FundTopHolding(ticker="FR0010361683", holding_symbol="HDFC Bank Ltd.", holding_nom="HDFC Bank Ltd.", poids=0.0679))
    db.commit()

    fiche_sans_top_holdings = justetf_service.FicheJustETF(geo_rows=[{"categorie": ZONE_AMERIQUE_DU_NORD, "poids": 1.0}])
    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: fiche_sans_top_holdings)

    justetf_service.refresh_all(db)

    lignes = db.query(FundTopHolding).filter(FundTopHolding.ticker == "FR0010361683").all()
    assert len(lignes) == 1
    assert lignes[0].holding_symbol == "HDFC Bank Ltd."


def test_refresh_all_echec_laisse_les_lignes_existantes_intactes(db, monkeypatch):
    make_holding(db, ticker="IE00B4L5Y983", type_actif="FUND")
    db.add(FundComposition(ticker="IE00B4L5Y983", type="geo", categorie="Ancienne zone", poids=1.0, source=SOURCE_COMPOSITION))
    db.add(FundCompositionBrute(ticker="IE00B4L5Y983", type="geo", categorie="Ancien pays brut", poids=1.0))
    db.commit()

    monkeypatch.setattr(justetf_service, "fetch_composition", lambda isin: None)

    resume = justetf_service.refresh_all(db)

    assert resume == {"traites": 1, "reussis": 0}
    lignes = db.query(FundComposition).filter(FundComposition.ticker == "IE00B4L5Y983").all()
    assert len(lignes) == 1
    assert lignes[0].categorie == "Ancienne zone"
    assert lignes[0].source == SOURCE_COMPOSITION

    lignes_brutes = db.query(FundCompositionBrute).filter(FundCompositionBrute.ticker == "IE00B4L5Y983").all()
    assert len(lignes_brutes) == 1
    assert lignes_brutes[0].categorie == "Ancien pays brut"


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
