"""Cache persistant pour les historiques de prix coûteux à recalculer (cf. LOT 4.4
« historique d'une ligne » et 4.5 « historique du portefeuille »), tous deux
alimentés par `yfinance.history()` — plusieurs secondes d'attente réseau — pour une
donnée qui ne bouge qu'au mieux une fois par jour.

Mécanisme volontairement unique pour les deux besoins : une table `HistoriqueCache`
(clé -> JSON + date de dernière écriture), interrogée par `lire`/écrite par `ecrire`,
avec expiration sur lecture (`DUREE_VALIDITE_HEURES`) plutôt que par purge active —
plus simple, et suffisant pour une appli locale mono-utilisateur. Les clés sont
construites par des fonctions nommées (`cle_historique_ligne`/`cle_historique_portefeuille`)
plutôt que par des chaînes en dur dispersées dans les appelants, pour n'avoir qu'un
seul endroit à faire évoluer si le format de clé change.

Persistant en base (et non en mémoire process) pour survivre aux redémarrages de
l'API en développement, et pour rester cohérent avec `database.upgrade_schema()`
(Alembic, backlog 2.I.4) qui crée déjà toutes les tables au démarrage.
"""

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..models import HistoriqueCache

# Durée de validité d'une entrée de cache. Les séries récupérées sont hebdomadaires
# (`interval="1wk"` côté `historical_performance_service`) : un rafraîchissement
# quotidien est donc déjà plus fin que la donnée elle-même, inutile de recalculer
# à chaque ouverture de fiche/tableau de bord dans l'intervalle.
DUREE_VALIDITE_HEURES = 24


def cle_historique_ligne(ticker: str) -> str:
    """Clé de cache de l'historique de prix d'une seule ligne du portefeuille (4.4)."""
    return f"historique_ligne:{ticker}"


def cle_historique_benchmark(benchmark_key: str) -> str:
    """Clé de cache de l'historique de prix complet (`period="max"`) d'un indice de
    référence (backlog 2.P.2) — comme `cle_historique_ligne`, jamais scopée par
    utilisateur : la série d'un indice est une donnée de marché publique, partagée
    entre tous les foyers. Volontairement sans date de début dans la clé : c'est
    l'historique COMPLET qui est mis en cache une fois, `historical_performance_service`
    le découpe ensuite à la période demandée par chaque appelant."""
    return f"historique_benchmark:{benchmark_key}"


def cle_historique_portefeuille(user_id: int) -> str:
    """Clé de cache de l'historique de valeur de tout le portefeuille (4.5), scopée
    par utilisateur (Milestone 2a) — sans `user_id`, le premier utilisateur à
    calculer son historique verrait sa donnée servie à tous les autres tant que le
    cache est valide (24h)."""
    return f"historique_portefeuille:{user_id}"


def cle_historique_patrimoine(user_id: int, detenteur_id: int | None = None) -> str:
    """Clé de cache de l'historique combiné financier + immobilier/épargne − emprunts
    (`patrimoine_history_service.compute_patrimoine_history`) — scopée par utilisateur
    ET par détenteur (contrairement à `cle_historique_portefeuille`) : la série diffère
    selon la vue foyer/détenteur, cf. le ratio flou appliqué à la poche financière et le
    filtrage exact des lignes/emprunts par quotité."""
    return f"historique_patrimoine:{user_id}:{detenteur_id if detenteur_id is not None else 'foyer'}"


def lire(db: Session, cle: str):
    """Contenu en cache pour `cle`, ou `None` si absent ou périmé (> `DUREE_VALIDITE_HEURES`).
    Ne supprime pas l'entrée périmée : `ecrire` l'écrasera au prochain calcul."""
    entree = db.get(HistoriqueCache, cle)
    if entree is None:
        return None

    # SQLite ne conserve pas le fuseau horaire des `datetime` stockés : `derniere_maj`
    # revient nue (naïve) mais a toujours été écrite en UTC (cf. `ecrire` ci-dessous et
    # convention déjà en place dans `performance_service`/`historical_performance_service`).
    maintenant = datetime.now(timezone.utc).replace(tzinfo=None)
    if maintenant - entree.derniere_maj > timedelta(hours=DUREE_VALIDITE_HEURES):
        return None

    return json.loads(entree.contenu_json)


def ecrire(db: Session, cle: str, contenu) -> None:
    """Écrit (ou remplace) le contenu en cache pour `cle`. `contenu` doit être
    sérialisable en JSON tel quel (listes/dicts de types simples — c'est déjà le cas
    des résultats produits par `historical_performance_service`, qui convertit les
    dates en chaînes ISO avant de renvoyer son résultat)."""
    contenu_json = json.dumps(contenu)
    maintenant = datetime.now(timezone.utc).replace(tzinfo=None)

    entree = db.get(HistoriqueCache, cle)
    if entree is None:
        db.add(HistoriqueCache(cle=cle, contenu_json=contenu_json, derniere_maj=maintenant))
    else:
        entree.contenu_json = contenu_json
        entree.derniere_maj = maintenant
    db.commit()


def forme_valide(en_cache: list[dict], champs_attendus: set[str]) -> bool:
    """`False` si les points en cache n'ont pas exactement les champs attendus par le
    schéma ACTUEL de l'appelant — sans ce contrôle, une entrée écrite avant l'ajout
    d'un champ à `PortfolioHistoryPoint`/`PatrimoineHistoryPoint` serait servie telle
    quelle jusqu'à expiration (`DUREE_VALIDITE_HEURES`), provoquant une erreur de
    validation Pydantic sur la réponse de l'API (bug constaté le 30/08/2026 :
    graphique d'évolution vide en lentille Net/Brut juste après le déploiement du mode
    étagé, `valeur_investie`/`valeur_realisee_cumulee` manquants sur des points mis en
    cache avant l'ajout de ces champs à `PatrimoineHistoryPoint`). Une liste vide est
    toujours valide : rien à vérifier, et c'est une réponse légitime (aucun historique
    disponible)."""
    return not en_cache or set(en_cache[0].keys()) == champs_attendus


def invalider(db: Session, cle: str | None = None) -> None:
    """Purge une entrée (`cle` donnée) ou tout le cache (`cle is None`). Appelée
    depuis `portfolio_reconstruction.rebuild_holdings` : le portefeuille venant de
    changer, tout historique en cache est potentiellement caduc."""
    query = db.query(HistoriqueCache)
    if cle is not None:
        query = query.filter(HistoriqueCache.cle == cle)
    query.delete()
    db.commit()


def invalider_historiques_portefeuille(db: Session) -> None:
    """Purge le cache d'historique de portefeuille de TOUS les utilisateurs (préfixe
    `historique_portefeuille:`), sans toucher aux caches d'historique de ligne
    (`historique_ligne:...`, partagés entre utilisateurs et non concernés). Appelée
    après un rafraîchissement des cours (`market_data_refresh.py`) : ce
    rafraîchissement est global (tous les tickers de tous les utilisateurs, cf.
    `docs/BACKLOG.md` § 2.I.1), donc son impact sur l'historique de valeur d'un
    portefeuille l'est aussi — contrairement à `portfolio_reconstruction.rebuild_holdings`
    (`invalider(db)` sans clé, plus large : un seul utilisateur y est concerné à la
    fois, mais l'événement est rare, purger tout le cache reste sans conséquence
    notable)."""
    db.query(HistoriqueCache).filter(HistoriqueCache.cle.like("historique_portefeuille:%")).delete(synchronize_session=False)
    db.commit()


def invalider_historiques_patrimoine(db: Session) -> None:
    """Purge le cache d'historique combiné patrimoine (préfixe `historique_patrimoine:`,
    toutes vues détenteur confondues, tous utilisateurs). Appelée après toute mutation
    dont rien ne dépendait avant l'existence de cette série — valorisation d'un actif
    manuel, CRUD d'un emprunt, changement de quotité — puisque `historical_performance_
    service`/`market_data_refresh` n'invalidaient jusqu'ici que `historique_portefeuille:`."""
    db.query(HistoriqueCache).filter(HistoriqueCache.cle.like("historique_patrimoine:%")).delete(synchronize_session=False)
    db.commit()
