from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401


class PerformanceSummary(BaseModel):
    valeur_positions: float
    valeur_totale: float
    cout_total_investi: float
    gain_perte_total: float
    rendement_simple_pct: float | None
    rendement_annualise_pct: float | None
    dividendes_percus: float
    interets_percus: float
    autres_revenus: float
    frais_payes: float
    impots_preleves: float
    gains_realises: float
    gains_latents: float
    nombre_transactions: int
    premiere_transaction: str | None = None


class PortfolioHistoryPoint(BaseModel):
    date: str
    valeur_portefeuille: float
    valeur_investie: float
    # Cumul, à cette date, du produit des ventes + dividendes + intérêts + autres
    # revenus (cf. `historical_performance_service._serie_cumulee_ventes_et_revenus`) :
    # `valeur_portefeuille + valeur_realisee_cumulee - valeur_investie` reconstitue
    # exactement `gain_perte_total` de `GET /api/performance` — sans ce champ, ces
    # montants restaient absents du graphique du tableau de bord.
    valeur_realisee_cumulee: float


class PortfolioHistoryResponse(BaseModel):
    points: list[PortfolioHistoryPoint]


class MetriquesAvancees(BaseModel):
    """Backlog 2.P.2 — `services/metriques_performance_service.compute_metriques_avancees`."""

    twr_cumule_pct: float | None
    twr_annualise_pct: float | None
    volatilite_annualisee_pct: float | None
    max_drawdown_pct: float | None
    drawdown_recupere: bool | None
    semaines_recuperation: int | None


class ComparaisonBenchmarkPoint(BaseModel):
    date: str
    portefeuille_pct: float | None
    benchmark_pct: float | None


class ComparaisonBenchmark(BaseModel):
    benchmark_key: str
    label: str
    points: list[ComparaisonBenchmarkPoint]


class BenchmarkOption(BaseModel):
    key: str
    label: str


class RevenusPassifsProjetes(BaseModel):
    """Backlog 2.P.3 (absorbe C.2) — `services/revenus_passifs_service.compute_revenus_passifs`."""

    loyers_nets_annuels: float
    interets_livrets_annuels: float
    revenu_certain_annuel: float
    dividendes_estimes_annuels: float
    interets_courtage_estimes_annuels: float
    revenu_estime_annuel: float
    revenu_total_projete_annuel: float
    revenu_total_projete_mensuel: float


class DividendeLigne(BaseModel):
    date: str
    symbol: str | None
    nom: str | None
    montant: float


class DividendeMois(BaseModel):
    mois: str  # "AAAA-MM"
    montant_total: float
    lignes: list[DividendeLigne]


class MouvementRapport(BaseModel):
    date: str
    type: str
    symbol: str | None
    nom: str | None
    montant: float


class RepartitionEpargneLigne(BaseModel):
    label: str
    valeur: float


class RapportEpargnePeriode(BaseModel):
    """Bloc épargne du rapport (backlog § U.1, demande directe de l'utilisateur
    30/08/2026 ; § U.2 pour la déclaration réelle du versement, même jour) :
    contrairement au portefeuille financier, l'épargne n'a par défaut aucun grand
    livre de versements. Deux régimes possibles pour `interets_periode`/
    `versements_periode`, signalés par `decomposition_estimee` :
    - **`True` (par défaut, aucun versement déclaré sur la période)** : ESTIMATION —
      intérêts = `taux_pct` proratisé sur la période, versements = résidu de
      l'évolution moins cette estimation. Jamais un montant mesuré.
    - **`False` (au moins un point de `HoldingValuationHistory` de la période porte
      un `versement` déclaré par le foyer, § U.2)** : versements = somme des
      montants réellement déclarés, intérêts = résidu de l'évolution moins ces
      versements — une donnée réelle, pas une estimation (limite assumée : un
      versement non déclaré sur un AUTRE point de la même période serait alors
      compté à tort comme du gain).
    `a_des_donnees=False` (et tous les autres champs à leur valeur neutre) si le
    foyer n'a aucune ligne `TYPES_EPARGNE` — l'écran masque alors ce bloc entièrement
    plutôt que d'afficher des zéros."""

    a_des_donnees: bool
    valeur_debut_periode: float
    valeur_fin_periode: float
    evolution_pct: float | None
    interets_periode: float
    versements_periode: float
    decomposition_estimee: bool
    repartition_par_type: list[RepartitionEpargneLigne]


class RapportPeriode(BaseModel):
    """Réponse de `GET /api/performance/rapport` (roadmap Phase 4, § D.2 — étendu à
    l'annuel et aux périodes personnalisées) : `date_debut`/`date_fin` sont les
    bornes réellement utilisées (celles envoyées par l'appelant), en écho pour que
    l'écran puisse afficher la période exacte sans la recalculer lui-même."""

    date_debut: str
    date_fin: str
    valeur_debut_periode: float | None
    valeur_fin_periode: float | None
    evolution_pct: float | None
    # Décomposition de l'évolution (backlog, demande directe 25/08/2026) : argent
    # AJOUTÉ (achats réels sur la période) vs GÉNÉRÉ (plus-value + dividendes +
    # intérêts, jamais confondus). `None` seulement si aucun historique de
    # portefeuille n'existe encore sur la période (même condition qu'`evolution_pct`).
    montant_investi_periode: float
    gain_genere_periode: float | None
    dividendes_percus: float
    nombre_transactions: int
    plus_gros_mouvements: list[MouvementRapport]
    # Épargne (backlog § U.1, 30/08/2026) : bloc indépendant du reste, dérivé des
    # lignes `TYPES_EPARGNE` plutôt que du grand livre de transactions boursières.
    epargne: RapportEpargnePeriode
