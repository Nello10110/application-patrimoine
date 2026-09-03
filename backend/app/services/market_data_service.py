"""Récupération des données de marché (cours, secteur, pays) via yfinance.

Les positions reconstruites depuis un historique de transactions (Trade Republic
et consorts) sont identifiées par ISIN (ou "BTC"/"ETH" pour la crypto), pas par un
ticker Yahoo Finance directement utilisable. `yf.Search` résout ces identifiants
vers un ticker Yahoo ; le résultat est mis en cache dans `TickerResolution` pour
éviter de répéter la recherche à chaque rafraîchissement.

yfinance interroge Yahoo Finance gratuitement mais sans SLA : chaque identifiant
est traité indépendamment pour qu'une erreur ou une résolution manquante ne bloque
pas les autres, et le résultat (y compris les erreurs) est mis en cache en base
avec un horodatage.

Les titres cotés hors zone euro (JPY, USD, GBp/pence...) sont systématiquement
convertis en EUR via les paires de change Yahoo (`XXXEUR=X`) avant stockage :
`prix_actuel` est donc toujours en EUR, quelle que soit la devise de cotation
d'origine (conservée à titre indicatif dans `devise`).

Exception à « via yfinance » ci-dessus : depuis l'Increment 9 (2.4), le cours de
référence d'un ETF (`Holding.type_actif == "FUND"`) vient de l'API JSON de
justETF (`justetf_service.fetch_price`), pas de yfinance — décision utilisateur
explicite, sans repli sur yfinance en cas d'échec (`refresh_tickers` pose alors
`erreur="Cotation indisponible (justETF)"`). `resolve_ticker`/yfinance restent en
revanche utilisés pour un fonds, mais uniquement pour le repli de composition
(`fetch_fund_composition`, cf. `refresh_tickers` ci-dessous) quand justETF ne
couvre pas l'ETF.

Yahoo Finance n'offrant aucun SLA et limitant les appels côté serveur (LOT 7.5),
`DELAI_ENTRE_APPELS_SECONDES` temporise entre deux identifiants traités au sein
d'un même rafraîchissement (`refresh_tickers`), pour lisser les appels dans le
temps plutôt que de tous les envoyer d'un coup. Le garde-fou de fréquence entre
deux rafraîchissements *manuels*, et l'exécution en tâche de fond avec statut
consultable, sont dans `market_data_refresh.py` (scindé de ce module lors de
l'audit structurel du 20/08/2026, § 2.I.2 du backlog) : ce module-ci ne s'occupe
que de *comment* récupérer un prix/une composition, pas de *quand*/*combien de
fois* on a le droit de le faire.

`DELAI_ENTRE_APPELS_SECONDES` est neutralisé (mis à 0) sous test : la variable
d'environnement `PATRIMOINE_TESTING`, posée par `backend/conftest.py` avant tout
import de l'application, est lue une seule fois ici à l'import du module. C'est la
solution la plus simple qui n'exige aucune modification des fichiers de test
existants (contrairement à un monkeypatch qu'il aurait fallu répéter partout où
`refresh_tickers` est exercé indirectement, y compris via les routes HTTP) ; aucun
test de cette suite n'a besoin d'observer un vrai délai, puisque `yf.Ticker`/
`yf.Search` sont eux-mêmes neutralisés (`no_network_yfinance`, `tests/conftest.py`).
"""

import os
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import yfinance as yf
from sqlalchemy.orm import Session

from ..models import (
    SOURCE_COMPOSITION,
    SOURCE_INDICE,
    SOURCE_JUSTETF,
    TYPES_ACTIF_PATRIMOINE_MANUEL,
    FundComposition,
    FundTopHolding,
    MarketDataCache,
    TickerResolution,
)
from . import justetf_service
from .reference_indices import FUND_SECTOR_WEIGHTING_LABELS, SECTEUR_AUTRES, region_for_country, repartition_geo_depuis_le_nom

QUOTE_TYPES_BY_ASSET_CLASS: dict[str, set[str]] = {
    "STOCK": {"EQUITY"},
    "FUND": {"ETF", "MUTUALFUND"},
    "CRYPTO": {"CRYPTOCURRENCY"},
    "BOND": {"EQUITY", "ETF"},
}

DELAI_ENTRE_APPELS_SECONDES = 0.0 if os.environ.get("PATRIMOINE_TESTING") else 0.25

# Durées de validité du cache de résolution des tickers (`TickerResolution`),
# cf. `_resolution_encore_valide`. Un succès est quasi immuable ; un échec est
# presque toujours conjoncturel et doit être réessayé.
DUREE_CACHE_SUCCES_JOURS = 90
DUREE_CACHE_ECHEC_JOURS = 1


# yf.Search(isin) échoue parfois à retrouver un titre pourtant coté (ADR sous un
# ticker différent de l'ISIN émetteur, plusieurs cotations du même fonds sur des
# places différentes...). Ces correspondances ont été vérifiées manuellement
# (nom + devise cohérents avec la ligne de transaction d'origine) plutôt que
# choisies par une recherche floue automatique, pour éviter de résoudre vers le
# mauvais titre.
MANUAL_TICKER_OVERRIDES: dict[str, str] = {
    "US8740391003": "TSM",  # TSMC (ADR) — l'ISIN US émetteur de l'ADR n'est pas indexé par la recherche Yahoo
    "IE00B52MJD48": "SXRZ.DE",  # iShares Nikkei 225 UCITS ETF JPY (Acc)
}


def _resolution_encore_valide(cached: TickerResolution) -> bool:
    """Une résolution réussie ne change pratiquement jamais (un ISIN garde son
    ticker) : on la garde longtemps. Un ÉCHEC, lui, est très souvent conjoncturel —
    Yahoo indisponible, limitation de débit, titre fraîchement coté pas encore
    indexé. Le cacher indéfiniment condamnait la ligne à rester non cotée pour
    toujours, sans aucun moyen de réessayer autrement qu'en vidant la table à la
    main (constaté lors de la revue du 03/09/2026 : `resolue_le` était écrite mais
    jamais lue, donc rien n'expirait).

    D'où deux durées très différentes selon l'issue."""
    age = datetime.now(UTC).replace(tzinfo=None) - cached.resolue_le
    if cached.ticker_resolu is None:
        return age < timedelta(days=DUREE_CACHE_ECHEC_JOURS)
    return age < timedelta(days=DUREE_CACHE_SUCCES_JOURS)


def resolve_ticker(db: Session, identifiant: str, asset_class: str | None) -> str | None:
    cached = db.get(TickerResolution, identifiant)
    if cached is not None and _resolution_encore_valide(cached):
        return cached.ticker_resolu
    if cached is not None:
        # Périmée : on la retire pour que la résolution ci-dessous reparte de zéro
        # (la clé primaire est `identifiant`, donc pas de doublon possible).
        db.delete(cached)
        db.flush()

    if identifiant in MANUAL_TICKER_OVERRIDES:
        ticker_resolu = MANUAL_TICKER_OVERRIDES[identifiant]
        db.add(TickerResolution(identifiant=identifiant, ticker_resolu=ticker_resolu, quote_type="MANUAL"))
        db.commit()
        return ticker_resolu

    ticker_resolu = None
    quote_type = None
    try:
        resultats = yf.Search(identifiant, max_results=5).quotes
    except Exception:
        resultats = []

    preferes = QUOTE_TYPES_BY_ASSET_CLASS.get(asset_class or "", set())
    match = next((q for q in resultats if q.get("quoteType") in preferes), None) or (
        resultats[0] if resultats else None
    )
    if match:
        ticker_resolu = match.get("symbol")
        quote_type = match.get("quoteType")

    db.add(TickerResolution(identifiant=identifiant, ticker_resolu=ticker_resolu, quote_type=quote_type))
    db.commit()
    return ticker_resolu


def fetch_holding_extra_info(ticker_resolu: str | None, asset_class: str | None) -> dict:
    """Informations complémentaires pour la fiche détaillée d'une position (émetteur,
    résumé, frais de gestion). Appelé à la demande (ouverture de la fiche), jamais lors
    du rafraîchissement en masse, pour ne pas ralentir ce dernier davantage."""
    if ticker_resolu is None:
        return {}
    try:
        info = yf.Ticker(ticker_resolu).info
    except Exception:
        return {}
    if not info:
        return {}

    if asset_class == "FUND":
        return {
            "emetteur": info.get("fundFamily"),
            "resume": None,
            "frais_gestion_pct": info.get("netExpenseRatio"),
        }

    return {
        "emetteur": None,
        "resume": info.get("longBusinessSummary"),
        "frais_gestion_pct": None,
    }


def fetch_frais_gestion(ticker_resolu: str) -> float | None:
    """Frais de gestion annuels (TER) d'un fonds, appelés au plus UNE FOIS par ticker
    (roadmap Phase 3, § E.3) — `refresh_tickers` ne rappelle cette fonction que tant
    que `MarketDataCache.frais_gestion_pct` vaut `None` pour ce ticker, donc seulement
    lors du tout premier rafraîchissement après la livraison de cette fonctionnalité,
    jamais ensuite : ne ralentit pas les rafraîchissements suivants."""
    try:
        info = yf.Ticker(ticker_resolu).info
    except Exception:
        return None
    return (info or {}).get("netExpenseRatio")


def get_fx_rate_to_eur(devise: str | None, cache: dict[str, float | None]) -> float | None:
    """Taux de conversion vers l'EUR pour 1 unité de `devise`. `GBp`/`GBX` (pence)
    sont un cas particulier : cotées en 1/100e de GBP chez Yahoo Finance."""
    if not devise:
        return None
    if devise == "EUR":
        return 1.0
    if devise in cache:
        return cache[devise]

    pence = devise in ("GBp", "GBX")
    code = "GBP" if pence else devise.upper()
    rate = None
    try:
        info = yf.Ticker(f"{code}EUR=X").info
        rate = info.get("regularMarketPrice") or info.get("previousClose")
    except Exception:
        rate = None
    if rate is not None and pence:
        rate = rate / 100

    cache[devise] = rate
    return rate


def fetch_one(identifiant: str, ticker_resolu: str | None, fx_cache: dict[str, float | None]) -> dict:
    if ticker_resolu is None:
        return {"ticker": identifiant, "erreur": "Cotation indisponible (titre non coté ou non reconnu)"}

    try:
        t = yf.Ticker(ticker_resolu)
        info = t.info
        if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
            return {"ticker": identifiant, "erreur": "Ticker introuvable ou données indisponibles"}

        prix_natif = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
        devise = info.get("currency")
        pays = info.get("country")

        fx_rate = get_fx_rate_to_eur(devise, fx_cache)
        if fx_rate is None:
            return {
                "ticker": identifiant,
                "erreur": f"Conversion {devise}→EUR indisponible (prix en devise d'origine non affiché)",
            }
        prix_eur = prix_natif * fx_rate

        return {
            "ticker": identifiant,
            "nom": info.get("longName") or info.get("shortName"),
            "prix_actuel": prix_eur,
            "devise": devise,
            "secteur": info.get("sector"),
            "pays": pays,
            "region": region_for_country(pays),
            "erreur": None,
        }
    except Exception as exc:  # yfinance peut lever des erreurs réseau/parsing variées
        return {"ticker": identifiant, "erreur": f"Erreur de récupération: {exc}"}


def fetch_fund_composition(
    ticker_resolu: str, stock_info_cache: dict[str, dict], nom_fonds: str | None = None
) -> tuple[list[dict], list[dict], list[dict]]:
    """Look-through d'un ETF/fonds : répartition sectorielle (quasi complète, directement
    fournie par Yahoo), géographique (estimée en résolvant le pays des ~10 plus grosses
    lignes du fonds, puis en extrapolant ces poids à 100% du fonds), et détail nominatif
    de ces mêmes lignes (symbole, nom, poids, pays, secteur).

    Chaque ligne de `geo_rows`/`sector_rows` porte un champ `source` valant
    `SOURCE_COMPOSITION` (donnée réelle du fonds) ou `SOURCE_INDICE` (repli sur le nom
    de l'indice suivi, géographique seulement, cf. 2.1). Quand Yahoo ne renseigne pas
    `top_holdings` (constaté sur la majorité des fonds détenus : ETF obligataires,
    matières premières, ou simplement absence de couverture par Yahoo), on retombe sur
    `repartition_geo_depuis_le_nom(nom_fonds)` plutôt que de laisser le holding
    entièrement "Non catégorisé". Si ce repli échoue aussi (indice non reconnu),
    `geo_rows` est vide comme avant — pas de régression pour le sectoriel, qui n'a pas
    d'équivalent de repli (aucune table de correspondance indice -> secteurs fournie).

    `stock_info_cache` est partagé sur tout un rafraîchissement pour éviter de réinterroger
    Yahoo à chaque fois qu'un même titre (ex. NVDA, AAPL) apparaît dans plusieurs fonds.
    """
    def _normalise(totaux: dict[str, float], source: str) -> list[dict]:
        """Renormalise des poids qui devraient sommer à 1 mais ne le font pas
        exactement (ex. 1,0001 observé côté sectoriel sur Yahoo Finance), pour que
        la somme affichée à l'utilisateur vaille toujours 1,0."""
        total = sum(totaux.values())
        if total <= 0:
            return []
        return [{"categorie": c, "poids": p / total, "source": source} for c, p in totaux.items()]

    try:
        fd = yf.Ticker(ticker_resolu).funds_data
    except Exception:
        return [], [], []

    sector_totals: dict[str, float] = {}
    try:
        for cle, poids in (fd.sector_weightings or {}).items():
            label = FUND_SECTOR_WEIGHTING_LABELS.get(cle, SECTEUR_AUTRES)
            sector_totals[label] = sector_totals.get(label, 0.0) + poids
    except Exception:
        pass
    sector_totals = {c: p for c, p in sector_totals.items() if p > 0}
    sector_rows = _normalise(sector_totals, SOURCE_COMPOSITION)

    geo_totals: dict[str, float] = {}
    top_holdings_detail: list[dict] = []
    try:
        top_holdings = fd.top_holdings
        if top_holdings is not None:
            for symbole, row in top_holdings.iterrows():
                poids_ligne = float(row.get("Holding Percent") or 0)
                if poids_ligne <= 0:
                    continue
                if symbole not in stock_info_cache:
                    try:
                        info = yf.Ticker(symbole).info
                        stock_info_cache[symbole] = {"pays": info.get("country"), "secteur": info.get("sector")}
                    except Exception:
                        stock_info_cache[symbole] = {"pays": None, "secteur": None}
                infos = stock_info_cache[symbole]
                region = region_for_country(infos.get("pays"))
                geo_totals[region] = geo_totals.get(region, 0.0) + poids_ligne
                top_holdings_detail.append(
                    {
                        "symbol": symbole,
                        "nom": row.get("Name"),
                        "poids": poids_ligne,
                        "pays": infos.get("pays"),
                        "secteur": infos.get("secteur"),
                    }
                )
    except Exception:
        pass

    geo_rows = _normalise(geo_totals, SOURCE_COMPOSITION)
    if not geo_rows:
        repli = repartition_geo_depuis_le_nom(nom_fonds)
        if repli:
            geo_rows = [
                {"categorie": categorie, "poids": poids, "source": SOURCE_INDICE}
                for categorie, poids in repli.items()
                if poids > 0
            ]

    return geo_rows, sector_rows, top_holdings_detail


def refresh_tickers(
    db: Session,
    items: list[tuple[str, str | None]],
    on_progression: Callable[[int, int], None] | None = None,
) -> list[dict]:
    """items: liste de (identifiant, asset_class) — asset_class peut être None (saisie manuelle).

    `on_progression`, optionnel (LOT 4B), est appelé après le traitement de chaque
    position — `(positions_traitees, positions_total)`, `positions_total` valant
    `len(items)` — pour permettre à l'appelant (`demarrer_rafraichissement`) de
    publier une progression consultable pendant qu'un rafraîchissement complet
    (potentiellement plusieurs dizaines de secondes voire plus d'une minute) tourne
    en tâche de fond."""
    results = []
    now = datetime.now(UTC)
    seen: set[str] = set()
    seen_justetf: set[str] = set()
    fx_cache: dict[str, float | None] = {}
    stock_info_cache: dict[str, dict] = {}
    total = len(items)

    for index, (identifiant_brut, asset_class) in enumerate(items, start=1):
        identifiant = (identifiant_brut or "").strip().upper()
        # Immobilier/SCPI/assurance-vie/PER (Phase 1 de `docs/ROADMAP.md`) : aucune
        # cotation à chercher, ni sur yfinance ni sur justETF — un bien immobilier n'a
        # pas de ticker. Sauté avant même la déduplication `seen`/la temporisation, qui
        # n'ont de sens que pour des identifiants effectivement interrogés en réseau.
        if not identifiant or identifiant in seen or asset_class in TYPES_ACTIF_PATRIMOINE_MANUEL:
            if on_progression:
                on_progression(index, total)
            continue
        # Temporisation entre deux identifiants effectivement traités (LOT 7.5) : pas
        # avant le tout premier, seulement entre deux appels Yahoo Finance successifs.
        if seen and DELAI_ENTRE_APPELS_SECONDES:
            time.sleep(DELAI_ENTRE_APPELS_SECONDES)
        seen.add(identifiant)

        ticker_resolu = resolve_ticker(db, identifiant, asset_class)

        # 2.4/Increment 9 — le cours de référence d'un ETF vient désormais de
        # l'API JSON justETF, pas de yfinance : plus robuste (contrat d'API stable
        # plutôt qu'un scraping fragile), et déjà en EUR (pas de conversion de
        # change à faire, contrairement à `fetch_one`). Décision utilisateur
        # explicite : pas de repli sur yfinance en cas d'échec justETF, pour ne
        # pas mélanger deux sources de prix différentes pour la même position.
        if asset_class == "FUND":
            # Ressource externe distincte de yfinance, temporisée séparément avec
            # son propre garde-fou (`justetf_service.DELAI_ENTRE_APPELS_JUSTETF_SECONDES`)
            # — même garde que ci-dessus : jamais avant le tout premier appel justETF.
            if seen_justetf and justetf_service.DELAI_ENTRE_APPELS_JUSTETF_SECONDES:
                time.sleep(justetf_service.DELAI_ENTRE_APPELS_JUSTETF_SECONDES)
            seen_justetf.add(identifiant)
            cotation = justetf_service.fetch_price(identifiant)
            if cotation is not None:
                data = {
                    "ticker": identifiant,
                    "prix_actuel": cotation["prix_actuel"],
                    "devise": "EUR",
                    "erreur": None,
                }
            else:
                data = {"ticker": identifiant, "erreur": "Cotation indisponible (justETF)"}
        else:
            data = fetch_one(identifiant, ticker_resolu, fx_cache)
        results.append(data)

        cache_entry = db.get(MarketDataCache, identifiant)
        if cache_entry is None:
            cache_entry = MarketDataCache(ticker=identifiant)
            db.add(cache_entry)

        cache_entry.nom = data.get("nom")
        cache_entry.prix_actuel = data.get("prix_actuel")
        cache_entry.devise = data.get("devise")
        cache_entry.secteur = data.get("secteur")
        cache_entry.pays = data.get("pays")
        cache_entry.region = data.get("region")
        cache_entry.erreur = data.get("erreur")
        cache_entry.derniere_maj = now

        # § E.3 — TER mis en cache une seule fois par ticker (jamais recalculé
        # ensuite), donc sans coût sur les rafraîchissements suivants.
        if asset_class == "FUND" and ticker_resolu is not None and cache_entry.frais_gestion_pct is None:
            cache_entry.frais_gestion_pct = fetch_frais_gestion(ticker_resolu)

        # Une composition justETF déjà en base (2.4) ne doit jamais être écrasée par
        # ce recalcul yfinance : les deux jobs tournent à des cadences différentes
        # (prix potentiellement plusieurs fois par jour, composition justETF une
        # fois par semaine par défaut) — sans cette garde, chaque rafraîchissement
        # de prix effacerait la donnée justETF plus riche pour la remplacer par le
        # repli yfinance, voire par rien du tout. `FundTopHolding` (détail nominatif
        # des plus grosses lignes — désormais alimenté par justETF pour les ETF
        # couverts, cf. `justetf_service.refresh_all`, 2.6) suit la même garde : sans
        # ça, il serait supprimé à chaque rafraîchissement de prix sans jamais être
        # réinséré par yfinance pour un ticker basculé sur justETF, puisque sa
        # reconstruction ici est imbriquée dans le même bloc que le calcul de
        # composition ci-dessous.
        a_deja_composition_justetf = (
            db.query(FundComposition)
            .filter(FundComposition.ticker == identifiant, FundComposition.source == SOURCE_JUSTETF)
            .first()
            is not None
        )
        if not a_deja_composition_justetf:
            db.query(FundComposition).filter(FundComposition.ticker == identifiant).delete()
            db.query(FundTopHolding).filter(FundTopHolding.ticker == identifiant).delete()
            if asset_class == "FUND" and ticker_resolu is not None and data.get("erreur") is None:
                geo_rows, sector_rows, top_holdings_detail = fetch_fund_composition(
                    ticker_resolu, stock_info_cache, data.get("nom")
                )
                for row in geo_rows:
                    db.add(
                        FundComposition(
                            ticker=identifiant, type="geo", categorie=row["categorie"], poids=row["poids"], source=row["source"]
                        )
                    )
                for row in sector_rows:
                    db.add(
                        FundComposition(
                            ticker=identifiant, type="sector", categorie=row["categorie"], poids=row["poids"], source=row["source"]
                        )
                    )
                for row in top_holdings_detail:
                    db.add(
                        FundTopHolding(
                            ticker=identifiant,
                            holding_symbol=row["symbol"],
                            holding_nom=row["nom"],
                            poids=row["poids"],
                            pays=row["pays"],
                            secteur=row["secteur"],
                        )
                    )

        # Un commit PAR TICKER (pas un unique commit en fin de boucle) — backlog
        # § T.2, retour utilisateur 30/08/2026 : sur le foyer réel (~50 positions,
        # cf. docstring de `refresh_tickers` ci-dessus, « dépasse largement la
        # minute »), un commit unique gardait la transaction d'écriture SQLite
        # ouverte pendant toute la durée du rafraîchissement. Toute autre écriture
        # concurrente pendant ce temps — y compris `auth.get_current_token`, qui
        # touche `auth_tokens` sur CHAQUE requête authentifiée, donc aussi les
        # propres sondages `GET /api/market-data/refresh/status` du frontend —
        # échouait alors en `database is locked`. Committer ici borne la durée du
        # verrou à un seul ticker plutôt qu'à tout le job, en complément du
        # `busy_timeout`/mode WAL posés sur la connexion (`database.py`).
        db.commit()

        if on_progression:
            on_progression(index, total)

    return results
