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
"""

from datetime import datetime, timezone

import yfinance as yf
from sqlalchemy.orm import Session

from ..models import SOURCE_COMPOSITION, SOURCE_INDICE, FundComposition, FundTopHolding, MarketDataCache, TickerResolution
from .reference_indices import FUND_SECTOR_WEIGHTING_LABELS, SECTEUR_AUTRES, region_for_country, repartition_geo_depuis_le_nom

QUOTE_TYPES_BY_ASSET_CLASS: dict[str, set[str]] = {
    "STOCK": {"EQUITY"},
    "FUND": {"ETF", "MUTUALFUND"},
    "CRYPTO": {"CRYPTOCURRENCY"},
    "BOND": {"EQUITY", "ETF"},
}

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


def resolve_ticker(db: Session, identifiant: str, asset_class: str | None) -> str | None:
    cached = db.get(TickerResolution, identifiant)
    if cached is not None:
        return cached.ticker_resolu

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


def refresh_tickers(db: Session, items: list[tuple[str, str | None]]) -> list[dict]:
    """items: liste de (identifiant, asset_class) — asset_class peut être None (saisie manuelle)."""
    results = []
    now = datetime.now(timezone.utc)
    seen: set[str] = set()
    fx_cache: dict[str, float | None] = {}
    stock_info_cache: dict[str, dict] = {}

    for identifiant_brut, asset_class in items:
        identifiant = (identifiant_brut or "").strip().upper()
        if not identifiant or identifiant in seen:
            continue
        seen.add(identifiant)

        ticker_resolu = resolve_ticker(db, identifiant, asset_class)
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

    db.commit()
    return results
