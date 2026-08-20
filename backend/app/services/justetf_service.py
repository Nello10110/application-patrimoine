"""Look-through géographique/sectoriel des ETF via justETF.com (backlog 2.4).

Contexte d'autorisation : les CGU de justETF interdisent en principe les requêtes
automatisées, mais l'utilisateur a obtenu le 19/08/2026 une autorisation directe et
informelle de justETF (échange via Twitter) pour scraper sa propre fiche ETF —
sans engagement écrit, et sans aucun support en cas de blocage ou de changement de
mise en page côté justETF. Ce module doit donc être défensif à l'extrême : toute
erreur (réseau, HTML inattendu, ISIN inconnu du site) est absorbée localement et ne
doit jamais interrompre le traitement des autres tickers, ni remonter jusqu'à
l'appelant planifié (`scheduler_service`). Le throttling entre deux appels est
volontairement plus prudent que celui déjà en place pour Yahoo Finance
(`market_data_service.DELAI_ENTRE_APPELS_SECONDES`), par simple politesse envers
une ressource sans SLA ni support.

Portée délibérément limitée à la fiche ETF statique (`GET
/en/etf-profile.html?isin=...` pour la géo/secteur, `/fr/...` pour la description et
le top 10, cf. 2.5/2.6), rendue côté serveur sans JavaScript ni session : elle
expose ~4-5 plus grosses lignes pays/secteurs + une ligne résiduelle "Other",
repérables via des attributs `data-testid` stables. Le bouton "Show more" de la
fiche (qui donnerait la liste complète, 9-10 pays au lieu de 4-5) déclenche un
appel AJAX Apache Wicket à état (session de page générée à la volée) — trop
fragile à rejouer hors navigateur pour être reproduit ici, donc explicitement hors
périmètre. La page statique reste un gain net : elle fournit une composition
pays/secteurs réelle pour des ETF qui n'avaient jusqu'ici aucune donnée
(`market_data_service.fetch_fund_composition` ne couvre qu'une minorité des ETF
détenus via `yfinance`).
"""

import logging
import os
import re
import time
from dataclasses import dataclass, field

import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from ..models import SOURCE_JUSTETF, FundComposition, FundCompositionBrute, FundTopHolding, Holding, MarketDataCache
from .reference_indices import JUSTETF_SECTOR_LABELS, SECTEUR_AUTRES, ZONE_AUTRES, region_for_country

logger = logging.getLogger("patrimoine.justetf")

# Même philosophie que `market_data_service.DELAI_ENTRE_APPELS_SECONDES` (neutralisé
# sous test via `PATRIMOINE_TESTING`), mais plus long : ce job tourne bien moins
# souvent (cf. `scheduler_service.DEFAULTS`) et sollicite une ressource sans SLA ni
# support offert par justETF, donc sans urgence à aller vite.
DELAI_ENTRE_APPELS_JUSTETF_SECONDES = 0.0 if os.environ.get("PATRIMOINE_TESTING") else 1.0

_TIMEOUT_SECONDES = 10
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_URL_FICHE_ETF_EN = "https://www.justetf.com/en/etf-profile.html?isin={isin}"
# Page en français (2.5/2.6, retour utilisateur du 19/08/2026) : uniquement pour la
# description et le détail nominatif du top 10 — les noms d'entreprises n'y sont pas
# traduits, contrairement aux libellés pays/secteurs (ex. "India" -> "Inde", "Finance"
# -> "Finance" mais "Non-Energy Materials" -> "Matériaux non énergétiques"). Le
# géo/secteur zone-mappé continue donc de venir de la page anglaise ci-dessus, dont la
# taxonomie (`JUSTETF_SECTOR_LABELS`, `region_for_country`) a été auditée sur les 26 ETF
# réels du portefeuille (Increment 9) — un changement de langue y casserait sans bruit
# la reconnaissance de la ligne résiduelle "Other" et des libellés de secteur.
_URL_FICHE_ETF_FR = "https://www.justetf.com/fr/etf-profile.html?isin={isin}"
_URL_COTATION = "https://www.justetf.com/api/etfs/{isin}/quote?locale=en&currency=EUR&isin={isin}"

_LIGNE_RESIDUELLE = "Other"

_DESCRIPTION_TESTID = "etf-quote-section_description-content-inner"


@dataclass
class FicheJustETF:
    """Résultat de `fetch_composition` : composition zone-mappée (comportement
    historique, utilisée pour les graphiques/objectifs du portefeuille via
    `FundComposition`) + détail brut justETF et description (2.4, Increment 9),
    tous deux affichage seul (`FundCompositionBrute`/`MarketDataCache.description`).

    Les trois axes (composition zone-mappée, détail brut, description) sont
    délibérément indépendants les uns des autres au niveau du parsing : la
    description est présente même sur les fiches sans onglet Holdings (ETF à
    réplication synthétique ou ETC), donc `geo_rows`/`sector_rows`/`geo_brut`/
    `sector_brut` peuvent être vides alors que `description` est renseignée."""

    geo_rows: list[dict] = field(default_factory=list)
    sector_rows: list[dict] = field(default_factory=list)
    geo_brut: list[dict] = field(default_factory=list)
    sector_brut: list[dict] = field(default_factory=list)
    description: str | None = None
    # Les 10 principales positions du fonds (2.6, retour utilisateur du 19/08/2026) :
    # {"nom": str, "poids": float} — poids en fraction (0-1) du fonds ENTIER, PAS
    # renormalisé à 1,0 sur le sous-ensemble (contrairement à `geo_rows`/`sector_rows`) :
    # la somme du top 10 est légitimement < 100% (ex. 34,78% sur FR0010361683), le
    # renormaliser gonflerait chaque poids à tort.
    top_holdings: list[dict] = field(default_factory=list)


def _fetch_page_html(url: str) -> str | None:
    """Seul point d'entrée réseau de ce module — isolé pour être facilement
    monkeypatché en test (même principe que `yf.Ticker`/`yf.Search` dans
    `market_data_service`, neutralisés par `no_network_yfinance`). Ne lève jamais :
    toute erreur réseau ou statut HTTP non 200 renvoie `None`."""
    try:
        reponse = requests.get(url, headers={"User-Agent": _USER_AGENT}, timeout=_TIMEOUT_SECONDES)
    except Exception:
        return None
    if reponse.status_code != 200:
        return None
    return reponse.text


def _extraire_lignes_brutes(soup: BeautifulSoup, row_testid: str, name_testid: str, pct_testid: str) -> dict[str, float]:
    """Extrait, pour un bloc de la fiche (pays ou secteurs), le pourcentage brut
    (0-100) associé à chaque libellé tel qu'affiché par justETF — avant tout
    mapping vers une zone/un secteur interne. Une ligne dont le nom ou le
    pourcentage est absent/illisible est ignorée plutôt que de faire échouer toute
    l'extraction."""
    bruts: dict[str, float] = {}
    for row in soup.find_all(attrs={"data-testid": row_testid}):
        nom_el = row.find(attrs={"data-testid": name_testid})
        pct_el = row.find(attrs={"data-testid": pct_testid})
        if nom_el is None or pct_el is None:
            continue
        nom = nom_el.get_text(strip=True)
        pct_texte = pct_el.get_text(strip=True).replace("%", "").replace(",", ".")
        if not nom or not pct_texte:
            continue
        try:
            pct = float(pct_texte)
        except ValueError:
            continue
        bruts[nom] = bruts.get(nom, 0.0) + pct
    return bruts


def _extraire_description(soup: BeautifulSoup) -> str | None:
    """Extrait le paragraphe de description de la fiche ETF
    (`data-testid="etf-quote-section_description-content-inner"`, texte complet —
    contrairement à `etf-quote-section_summary-text` qui tronque la première
    phrase). Espaces/retours à la ligne multiples réduits à un seul espace."""
    el = soup.find(attrs={"data-testid": _DESCRIPTION_TESTID})
    if el is None:
        return None
    texte = re.sub(r"\s+", " ", el.get_text(separator=" ", strip=True)).strip()
    return texte or None


def _extraire_top_holdings(soup: BeautifulSoup) -> list[dict]:
    """Extrait les ~10 plus grosses lignes du fonds (`data-testid`
    `etf-holdings_top-holdings_row`/`..._link_name`/`..._value_percentage`, même
    structure que les blocs pays/secteurs). Poids gardé tel quel (fraction du fonds
    entier) — voir la remarque sur `FicheJustETF.top_holdings` : pas de
    renormalisation ici, contrairement à `_normalise`."""
    bruts = _extraire_lignes_brutes(
        soup,
        "etf-holdings_top-holdings_row",
        "tl_etf-holdings_top-holdings_link_name",
        "tl_etf-holdings_top-holdings_value_percentage",
    )
    return [{"nom": nom, "poids": pct / 100} for nom, pct in bruts.items()]


def _normalise(totaux: dict[str, float]) -> list[dict]:
    """Renormalise pour que la somme des poids affichés vaille exactement 1,0 —
    même raisonnement que `market_data_service.fetch_fund_composition._normalise`
    (les pourcentages justETF, comme ceux de Yahoo, peuvent être légèrement décalés
    par arrondi, et la ligne "Other" residuelle est un arrondi de toute façon)."""
    total = sum(totaux.values())
    if total <= 0:
        return []
    return [{"categorie": categorie, "poids": poids / total} for categorie, poids in totaux.items()]


def fetch_composition(isin: str) -> FicheJustETF | None:
    """Récupère et parse la fiche ETF justETF de `isin`. Renvoie une `FicheJustETF`
    (zone-mappé + détail brut + description + top 10) — sans champ `source` sur les
    lignes de composition, posé par l'appelant (`refresh_all`) au moment de la
    persistance.

    Ne lève jamais et ne renvoie `None` que si la page anglaise (géo/secteur, seule
    donnée réellement indispensable au reste de l'application) n'a pas pu être
    récupérée/parsée (échec réseau, statut HTTP, HTML totalement inattendu) : la
    description est présente même sur les fiches sans onglet Holdings (ETF à
    réplication synthétique ou ETC), donc l'ABSENCE de données pays/secteurs ne
    doit plus, à elle seule, faire échouer tout l'appel (cf. Increment 9) — sinon
    l'appelant laisserait `description` non renseignée pour ces ETF alors qu'elle
    est bien disponible.

    Description et top 10 viennent d'une seconde requête, sur la page en FRANÇAIS
    (2.5/2.6) — best effort : un échec de cette seconde requête laisse simplement
    `description`/`top_holdings` vides, sans jamais invalider la composition
    géo/secteur déjà extraite de la page anglaise ci-dessus."""
    html = _fetch_page_html(_URL_FICHE_ETF_EN.format(isin=isin))
    if not html:
        return None

    try:
        soup = BeautifulSoup(html, "html.parser")

        pays_bruts = _extraire_lignes_brutes(
            soup,
            "etf-holdings_countries_row",
            "tl_etf-holdings_countries_value_name",
            "tl_etf-holdings_countries_value_percentage",
        )
        secteurs_bruts = _extraire_lignes_brutes(
            soup,
            "etf-holdings_sectors_row",
            "tl_etf-holdings_sectors_value_name",
            "tl_etf-holdings_sectors_value_percentage",
        )

        geo_totaux: dict[str, float] = {}
        for nom, pct in pays_bruts.items():
            categorie = ZONE_AUTRES if nom == _LIGNE_RESIDUELLE else region_for_country(nom)
            geo_totaux[categorie] = geo_totaux.get(categorie, 0.0) + pct

        secteur_totaux: dict[str, float] = {}
        for nom, pct in secteurs_bruts.items():
            categorie = SECTEUR_AUTRES if nom == _LIGNE_RESIDUELLE else JUSTETF_SECTOR_LABELS.get(nom, SECTEUR_AUTRES)
            secteur_totaux[categorie] = secteur_totaux.get(categorie, 0.0) + pct

        geo_rows = _normalise(geo_totaux)
        sector_rows = _normalise(secteur_totaux)
        geo_brut = _normalise(pays_bruts)
        sector_brut = _normalise(secteurs_bruts)
    except Exception:
        return None

    description: str | None = None
    top_holdings: list[dict] = []
    if DELAI_ENTRE_APPELS_JUSTETF_SECONDES:
        time.sleep(DELAI_ENTRE_APPELS_JUSTETF_SECONDES)
    html_fr = _fetch_page_html(_URL_FICHE_ETF_FR.format(isin=isin))
    if html_fr:
        try:
            soup_fr = BeautifulSoup(html_fr, "html.parser")
            description = _extraire_description(soup_fr)
            top_holdings = _extraire_top_holdings(soup_fr)
        except Exception:
            pass

    return FicheJustETF(
        geo_rows=geo_rows,
        sector_rows=sector_rows,
        geo_brut=geo_brut,
        sector_brut=sector_brut,
        description=description,
        top_holdings=top_holdings,
    )


def fetch_price(isin: str) -> dict | None:
    """Cours de référence d'un ETF via l'API JSON stable de justETF (pas de
    scraping HTML pour cette partie, contrairement à `fetch_composition`) :
    `GET /api/etfs/{isin}/quote?locale=en&currency=EUR&isin={isin}`. `currency=EUR`
    est demandé explicitement, donc `latestQuote.raw` est déjà en EUR — aucune
    conversion de change à faire côté application, contrairement au pipeline
    yfinance (`market_data_service.get_fx_rate_to_eur`).

    Renvoie `{"prix_actuel": float}` sur succès, `None` sur tout échec (réseau,
    statut non 200, JSON inattendu/clé manquante) : à charge de l'appelant de ne
    pas retomber sur yfinance en cas d'échec (décision utilisateur, cf. 2.4)."""
    try:
        reponse = requests.get(
            _URL_COTATION.format(isin=isin), headers={"User-Agent": _USER_AGENT}, timeout=_TIMEOUT_SECONDES
        )
        if reponse.status_code != 200:
            return None
        donnees = reponse.json()
        prix = donnees["latestQuote"]["raw"]
        return {"prix_actuel": float(prix)}
    except Exception:
        return None


def refresh_all(db: Session) -> dict:
    """Rafraîchit la composition justETF de tous les ETF détenus
    (`Holding.type_actif == "FUND"`), throttlé par
    `DELAI_ENTRE_APPELS_JUSTETF_SECONDES` entre deux ISIN traités.

    Pour chaque ISIN où `fetch_composition` renvoie une `FicheJustETF` :
    - si `geo_rows`/`sector_rows` sont non vides (composition réellement
      couverte) : remplace **toutes** les lignes `FundComposition` existantes
      (toutes sources confondues) par les nouvelles lignes taguées
      `SOURCE_JUSTETF`, et de même pour `FundCompositionBrute` (détail brut,
      affichage seul, cf. 2.4) — les deux tables sont toujours écrites ensemble,
      depuis le même résultat, pour ne jamais désynchroniser zone-mappé et brut ;
    - indépendamment, si `description` est renseignée : upsert dans
      `MarketDataCache.description` — un ETF sans onglet Holdings (réplication
      synthétique/ETC) obtient ainsi sa description sans jamais obtenir de ligne
      de composition, les deux axes étant délibérément découplés (Increment 9) ;
    - indépendamment encore, si `top_holdings` est renseigné : remplace toutes les
      lignes `FundTopHolding` existantes pour cet ISIN (2.6) — même logique de
      remplacement complet que la composition, mais découplée d'elle : un échec de
      la page française (top 10/description) laisse la composition déjà écrite
      intacte, et réciproquement.

    En cas d'échec réseau/parsing pour un ISIN (`fetch_composition` renvoie
    `None`), rien n'est touché pour cet ISIN — aucune régression.

    Renvoie `{"traites": int, "reussis": int}` (`reussis` compte les ISIN où la
    composition a été écrite, pas seulement la description), utilisé par
    `scheduler_service._run_justetf_refresh` pour construire le message de statut
    affiché dans Réglages."""
    # Intentionnellement NON filtré par utilisateur (Milestone 2a, cf.
    # docs/BACKLOG.md § 2.I.1) : FundComposition/FundCompositionBrute restent
    # globaux, partagés par tous les comptes.
    items = db.query(Holding.ticker, Holding.type_actif).filter(Holding.type_actif == "FUND").distinct().all()

    traites = 0
    reussis = 0
    seen: set[str] = set()

    for ticker, _asset_class in items:
        isin = (ticker or "").strip().upper()
        if not isin or isin in seen:
            continue
        # Temporisation entre deux ISIN effectivement traités : jamais avant le
        # tout premier, seulement entre deux appels justETF successifs — même
        # garde que `market_data_service.refresh_tickers`.
        if seen and DELAI_ENTRE_APPELS_JUSTETF_SECONDES:
            time.sleep(DELAI_ENTRE_APPELS_JUSTETF_SECONDES)
        seen.add(isin)
        traites += 1

        fiche = fetch_composition(isin)
        if fiche is None:
            continue

        if fiche.geo_rows or fiche.sector_rows:
            db.query(FundComposition).filter(FundComposition.ticker == isin).delete()
            db.query(FundCompositionBrute).filter(FundCompositionBrute.ticker == isin).delete()
            for row in fiche.geo_rows:
                db.add(
                    FundComposition(
                        ticker=isin, type="geo", categorie=row["categorie"], poids=row["poids"], source=SOURCE_JUSTETF
                    )
                )
            for row in fiche.sector_rows:
                db.add(
                    FundComposition(
                        ticker=isin, type="sector", categorie=row["categorie"], poids=row["poids"], source=SOURCE_JUSTETF
                    )
                )
            for row in fiche.geo_brut:
                db.add(FundCompositionBrute(ticker=isin, type="geo", categorie=row["categorie"], poids=row["poids"]))
            for row in fiche.sector_brut:
                db.add(FundCompositionBrute(ticker=isin, type="sector", categorie=row["categorie"], poids=row["poids"]))
            reussis += 1

        if fiche.description:
            cache_entry = db.get(MarketDataCache, isin)
            if cache_entry is None:
                cache_entry = MarketDataCache(ticker=isin)
                db.add(cache_entry)
            cache_entry.description = fiche.description

        # Top 10 (2.6) : indépendant de `description` et de la composition
        # ci-dessus — même découplage. `market_data_service.refresh_tickers` ne
        # touche plus jamais `FundTopHolding` pour un ticker qui a une composition
        # justETF (cf. sa garde `a_deja_composition_justetf`), donc cette table lui
        # appartient entièrement ici pour ces ISIN.
        if fiche.top_holdings:
            db.query(FundTopHolding).filter(FundTopHolding.ticker == isin).delete()
            for row in fiche.top_holdings:
                db.add(
                    FundTopHolding(
                        ticker=isin,
                        holding_symbol=row["nom"],
                        holding_nom=row["nom"],
                        poids=row["poids"],
                    )
                )

    db.commit()
    return {"traites": traites, "reussis": reussis}
