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

Yahoo Finance n'offrant aucun SLA et limitant les appels côté serveur (LOT 7.5),
deux garde-fous limitent la fréquence des sollicitations :
- `DELAI_ENTRE_APPELS_SECONDES` : temporisation entre deux identifiants traités au
  sein d'un même rafraîchissement (`refresh_tickers`), pour lisser les appels dans
  le temps plutôt que de tous les envoyer d'un coup ;
- `DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES` : délai minimal entre deux
  rafraîchissements déclenchés manuellement (`verifier_et_enregistrer_rafraichissement_manuel`,
  appelée par `routers/market_data.refresh`) — le rafraîchissement planifié n'est
  pas concerné, il a déjà son propre intervalle réglable depuis les Réglages.

`DELAI_ENTRE_APPELS_SECONDES` est neutralisé (mis à 0) sous test : la variable
d'environnement `PATRIMOINE_TESTING`, posée par `backend/conftest.py` avant tout
import de l'application, est lue une seule fois ici à l'import du module. C'est la
solution la plus simple qui n'exige aucune modification des fichiers de test
existants (contrairement à un monkeypatch qu'il aurait fallu répéter partout où
`refresh_tickers` est exercé indirectement, y compris via les routes HTTP) ; aucun
test de cette suite n'a besoin d'observer un vrai délai, puisque `yf.Ticker`/
`yf.Search` sont eux-mêmes neutralisés (`no_network_yfinance`, `tests/conftest.py`).
"""

import logging
import os
import threading
import time
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Callable

import yfinance as yf
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import SOURCE_COMPOSITION, SOURCE_INDICE, SOURCE_JUSTETF, FundComposition, FundTopHolding, MarketDataCache, TickerResolution
from .historique_cache import cle_historique_portefeuille, invalider
from .reference_indices import FUND_SECTOR_WEIGHTING_LABELS, SECTEUR_AUTRES, region_for_country, repartition_geo_depuis_le_nom

logger = logging.getLogger("patrimoine.market_data")

QUOTE_TYPES_BY_ASSET_CLASS: dict[str, set[str]] = {
    "STOCK": {"EQUITY"},
    "FUND": {"ETF", "MUTUALFUND"},
    "CRYPTO": {"CRYPTOCURRENCY"},
    "BOND": {"EQUITY", "ETF"},
}

DELAI_ENTRE_APPELS_SECONDES = 0.0 if os.environ.get("PATRIMOINE_TESTING") else 0.25
DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES = 60

# Horodatage du dernier rafraîchissement manuel accepté (état mémoire du process,
# suffisant pour une appli locale mono-utilisateur sans persistance nécessaire d'un
# redémarrage à l'autre).
_dernier_rafraichissement_manuel: datetime | None = None


class RafraichissementTropFrequentError(Exception):
    """Levée par `verifier_et_enregistrer_rafraichissement_manuel` quand un
    rafraîchissement manuel est demandé avant l'écoulement du délai minimal."""

    def __init__(self, secondes_restantes: float):
        self.secondes_restantes = secondes_restantes
        super().__init__(
            f"Merci de patienter encore {secondes_restantes:.0f} seconde(s) avant un nouveau rafraîchissement manuel."
        )


def verifier_et_enregistrer_rafraichissement_manuel() -> None:
    """À appeler en tête de la route de rafraîchissement manuel (LOT 7.5). Lève
    `RafraichissementTropFrequentError` si le délai minimal n'est pas écoulé depuis
    le précédent rafraîchissement manuel accepté ; sinon enregistre celui-ci comme
    référence pour le prochain appel."""
    global _dernier_rafraichissement_manuel
    maintenant = datetime.now(timezone.utc)
    if _dernier_rafraichissement_manuel is not None:
        ecoule = (maintenant - _dernier_rafraichissement_manuel).total_seconds()
        if ecoule < DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES:
            raise RafraichissementTropFrequentError(DELAI_MINIMAL_ENTRE_RAFRAICHISSEMENTS_SECONDES - ecoule)
    _dernier_rafraichissement_manuel = maintenant


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
    now = datetime.now(timezone.utc)
    seen: set[str] = set()
    fx_cache: dict[str, float | None] = {}
    stock_info_cache: dict[str, dict] = {}
    total = len(items)

    for index, (identifiant_brut, asset_class) in enumerate(items, start=1):
        identifiant = (identifiant_brut or "").strip().upper()
        if not identifiant or identifiant in seen:
            if on_progression:
                on_progression(index, total)
            continue
        # Temporisation entre deux identifiants effectivement traités (LOT 7.5) : pas
        # avant le tout premier, seulement entre deux appels Yahoo Finance successifs.
        if seen and DELAI_ENTRE_APPELS_SECONDES:
            time.sleep(DELAI_ENTRE_APPELS_SECONDES)
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

        # Une composition justETF déjà en base (2.4) ne doit jamais être écrasée par
        # ce recalcul yfinance : les deux jobs tournent à des cadences différentes
        # (prix potentiellement plusieurs fois par jour, composition justETF une
        # fois par semaine par défaut) — sans cette garde, chaque rafraîchissement
        # de prix effacerait la donnée justETF plus riche pour la remplacer par le
        # repli yfinance, voire par rien du tout. `FundTopHolding` (détail nominatif
        # des plus grosses lignes, non fourni par justETF) suit la même garde : sans
        # ça, il serait supprimé à chaque rafraîchissement de prix sans jamais être
        # réinséré dès qu'un ticker bascule sur justETF, puisque sa reconstruction
        # est imbriquée dans le même bloc que le calcul de composition ci-dessous.
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

        if on_progression:
            on_progression(index, total)

    db.commit()
    return results


# ---------------------------------------------------------------------------
# LOT 4B — rafraîchissement en tâche de fond, avec statut consultable
# ---------------------------------------------------------------------------
#
# `POST /api/market-data/refresh` et `POST /api/settings/jobs/{job_key}/run-now`
# exécutaient jusqu'ici `refresh_tickers` de façon synchrone : sur le portefeuille
# réel de l'utilisateur (plusieurs dizaines de positions, plusieurs appels Yahoo
# Finance chacune, temporisées de `DELAI_ENTRE_APPELS_SECONDES` entre elles), la
# requête HTTP dépasse largement la minute — le worker FastAPI reste bloqué tout ce
# temps et le navigateur peut abandonner la requête avant la réponse.
#
# Un simple `threading.Thread` suffit à en faire une tâche de fond : cette
# application est locale, mono-utilisateur, sans plusieurs rafraîchissements
# concurrents à orchestrer ni de worker séparé du process API — une file de tâches
# externe (Celery, RQ, arq...) serait une infrastructure disproportionnée pour un
# unique job occasionnel. Un verrou (`_verrou_etat`) protège le petit état partagé
# (`_etat`) entre le fil de fond et les fils de requête HTTP qui le consultent.


class RafraichissementDejaEnCoursError(Exception):
    """Levée par `demarrer_rafraichissement` quand un rafraîchissement est déjà en
    cours d'exécution (déclenché depuis un autre écran ou un appel précédent)."""

    def __init__(self):
        super().__init__("Un rafraîchissement des cours est déjà en cours.")


@dataclass
class EtatRafraichissement:
    """État courant du rafraîchissement en tâche de fond, tel que consultable via
    `etat_rafraichissement()`/`GET /api/market-data/refresh/status`.

    `statut` vaut `None` tant qu'aucun rafraîchissement n'a jamais abouti ou échoué
    (y compris pendant qu'un premier rafraîchissement est en cours), puis `"ok"` ou
    `"erreur"` selon l'issue du dernier rafraîchissement terminé."""

    en_cours: bool = False
    positions_traitees: int = 0
    positions_total: int = 0
    demarre_le: datetime | None = None
    termine_le: datetime | None = None
    statut: str | None = None  # "ok" | "erreur" | None
    message: str | None = None


_verrou_etat = threading.Lock()
_etat = EtatRafraichissement()

# Référence vers le fil en cours (ou le dernier lancé), exposée pour permettre aux
# tests de l'attendre explicitement (`_thread_courant.join(timeout=...)`) plutôt que
# de sonder l'API à intervalles réels — cf. `tests/test_market_data_background.py`.
_thread_courant: threading.Thread | None = None


def etat_rafraichissement() -> EtatRafraichissement:
    """Copie de l'état courant, sûre à lire depuis un autre fil que celui qui
    l'écrit (le fil de fond du rafraîchissement)."""
    with _verrou_etat:
        return replace(_etat)


def _executer_rafraichissement(
    items: list[tuple[str, str | None]],
    on_termine: Callable[[EtatRafraichissement], None] | None,
) -> None:
    """Corps du fil de fond. Ouvre sa propre session SQLAlchemy : celle de la
    requête HTTP qui a déclenché ce rafraîchissement est refermée dès la réponse
    `202` renvoyée, bien avant que ce travail ne soit terminé. Toute exception est
    capturée et journalisée ici — elle ne doit jamais remonter et faire mourir le
    fil silencieusement sans que l'état ne le reflète."""
    db = SessionLocal()
    total = len(items)
    try:
        def _sur_progression(traitees: int, total_: int) -> None:
            with _verrou_etat:
                _etat.positions_traitees = traitees
                _etat.positions_total = total_

        refresh_tickers(db, items, on_progression=_sur_progression)

        # Le cache d'historique du portefeuille (LOT 4.5) est valable 24h : sans
        # cette invalidation, le graphique d'évolution du tableau de bord resterait
        # figé jusqu'à 24h après une mise à jour des cours, en contradiction avec la
        # valeur (calculée à partir des cours frais) affichée juste à côté.
        invalider(db, cle_historique_portefeuille())

        with _verrou_etat:
            _etat.statut = "ok"
            _etat.message = f"{total} position(s) rafraîchie(s)"
    except Exception as exc:  # jamais laisser une exception tuer le fil en silence
        logger.exception("échec du rafraîchissement des cours en tâche de fond")
        with _verrou_etat:
            _etat.statut = "erreur"
            _etat.message = str(exc)
    finally:
        db.close()
        with _verrou_etat:
            _etat.en_cours = False
            _etat.termine_le = datetime.now(timezone.utc)
            etat_final = replace(_etat)

    if on_termine is not None:
        try:
            on_termine(etat_final)
        except Exception:
            logger.exception("échec du callback de fin de rafraîchissement")


def demarrer_rafraichissement(
    items: list[tuple[str, str | None]],
    on_termine: Callable[[EtatRafraichissement], None] | None = None,
) -> EtatRafraichissement:
    """Lance `refresh_tickers(items)` dans un fil dédié et rend la main
    immédiatement — voir la section ci-dessus pour le pourquoi.

    Lève `RafraichissementDejaEnCoursError` si un rafraîchissement est déjà en
    cours ; sinon renvoie l'état de démarrage (pratique pour l'afficher tout de
    suite côté frontend sans attendre le premier sondage de
    `GET /api/market-data/refresh/status`).

    `on_termine`, optionnel, est appelé (dans le fil de fond, une fois l'état
    final déterminé) avec une copie de cet état final. Utilisé par
    `scheduler_service.run_job_now` (LOT 4B) pour répercuter le résultat dans
    `ScheduledJobConfig`, consulté par la page Réglages."""
    global _thread_courant
    with _verrou_etat:
        if _etat.en_cours:
            raise RafraichissementDejaEnCoursError()
        _etat.en_cours = True
        _etat.positions_traitees = 0
        _etat.positions_total = len(items)
        _etat.demarre_le = datetime.now(timezone.utc)
        _etat.termine_le = None
        _etat.statut = None
        _etat.message = None
        etat_depart = replace(_etat)

    thread = threading.Thread(
        target=_executer_rafraichissement, args=(items, on_termine), daemon=True, name="rafraichissement-cours"
    )
    _thread_courant = thread
    thread.start()
    return etat_depart
