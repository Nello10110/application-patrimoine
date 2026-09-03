from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

from .commun import RepartitionParClasseItem


class PatrimoineNetResponse(BaseModel):
    """Patrimoine net global (Phase 1 de `docs/ROADMAP.md`) — `services/patrimoine_service.py`.
    Distinct de `AnalysisResponse.valeur_totale` (scopé au seul portefeuille financier,
    cf. `analysis_service.holdings_financiers`) : `actifs_totaux` ici couvre en plus
    l'immobilier/SCPI/assurance-vie/PER, et `patrimoine_net` en retranche les emprunts.

    `patrimoine_net` sert aussi de capital de départ par défaut à l'écran Simulateur
    (fusion Simulateur/Outils) : depuis cet increment, la projection, le tableau de
    détail et le calcul FIRE sont calculés côté client
    (`frontend/src/utils/interetsComposes.ts`), il n'existe donc plus d'endpoint
    `/api/patrimoine/simulation`/`/fire` dédié — ce module reste la seule source de
    vérité pour le patrimoine net lui-même."""

    actifs_totaux: float
    passifs_totaux: float
    patrimoine_net: float
    # Lentille "financier" (backlog 2.K.3) : valeur du seul portefeuille financier
    # (actions/ETF/crypto/obligations/private equity — cf. `analysis_service.holdings_financiers`),
    # sans retrancher les emprunts (aucun rattachement emprunt↔actif n'existe encore, cf. M.2).
    patrimoine_financier: float
    repartition_par_classe: list[RepartitionParClasseItem]
    # Lentille "financier" (feature Net/Brut/Financier sur toute la page Synthèse) :
    # même répartition, restreinte au seul portefeuille financier — évite au frontend de
    # deviner quelles catégories de `repartition_par_classe` sont "financières" à partir
    # du seul libellé.
    repartition_par_classe_financiere: list[RepartitionParClasseItem]
    # Lentille "net" : même répartition, chaque ligne nettée de SON emprunt rattaché
    # (pas seulement le grand total) — peut contenir des valeurs négatives (équité
    # négative sur une ligne, ou un bucket "Dettes non rattachées"), jamais masquées.
    repartition_par_classe_nette: list[RepartitionParClasseItem]


class PatrimoineHistoryPoint(BaseModel):
    """Un point de la série combinée (`services/patrimoine_history_service`) — cf. sa
    docstring de module pour les deux limites assumées (données manuelles clairsemées,
    ratio flou pour le scoping détenteur de la poche financière)."""

    date: str
    valeur_financiere: float
    valeur_manuelle: float
    actifs_totaux: float
    passifs_totaux: float
    patrimoine_net: float
    patrimoine_financier: float
    # Mode étagé Investi/Gains hors lentille Financier (backlog § U.4, 30/08/2026) —
    # mêmes noms de champs que `PortfolioHistoryPoint` pour que le frontend applique
    # la même formule de décomposition sans distinguo. Voir le docstring de module de
    # `patrimoine_history_service` pour le détail (part manuelle bornée aux versements
    # explicitement déclarés, réalisé exclusivement financier).
    valeur_investie: float
    # Nettée de `passifs_totaux` (retour utilisateur 31/08/2026) : `valeur_investie`
    # ci-dessus reste brute, jamais réduite d'un emprunt — l'utiliser telle quelle en
    # lentille Net sous-comptait les gains d'un bien financé à crédit (la dette
    # soustraite une deuxième fois, en plus de celle déjà faite dans `patrimoine_net`).
    # C'est CE champ que le frontend utilise comme « Investi » du mode étagé en Net,
    # jamais `valeur_investie` — cf. `patrimoine_history_service._compute_patrimoine_history`.
    valeur_investie_nette: float
    valeur_realisee_cumulee: float


class PatrimoineHistoryResponse(BaseModel):
    points: list[PatrimoineHistoryPoint]


class ExpositionConsolidee(BaseModel):
    """Backlog 2.P.1 — `services/patrimoine_service.compute_exposition_consolidee`.
    Champs sans suffixe = valeur BRUTE ; `_nette` = chaque ligne nettée de son emprunt
    rattaché (backlog 2.S.2) — le frontend choisit selon la lentille Net/Brut/Financier
    active (`repartition_par_classe`/`_nette` du patrimoine net suit le même principe)."""

    valeur_totale: float
    repartition_geo: list[RepartitionParClasseItem]
    repartition_classe: list[RepartitionParClasseItem]
    plus_grosse_ligne_ticker: str | None
    plus_grosse_ligne_pct: float | None
    top5_lignes_pct: float | None
    premiere_zone_geo: str | None
    premiere_zone_geo_pct: float | None
    part_estimee_manuelle_pct: float
    valeur_totale_nette: float
    repartition_geo_nette: list[RepartitionParClasseItem]
    repartition_classe_nette: list[RepartitionParClasseItem]
    plus_grosse_ligne_ticker_nette: str | None
    plus_grosse_ligne_pct_nette: float | None
    top5_lignes_pct_nette: float | None
    premiere_zone_geo_nette: str | None
    premiere_zone_geo_pct_nette: float | None
    part_estimee_manuelle_pct_nette: float


class IndicateursSituation(BaseModel):
    matelas_securite_mois: float | None
    taux_endettement_pct: float | None
    part_immobilisee_pct: float | None
    epargne_disponible: float
    depenses_mensuelles_moyennes: float | None
    mensualites_totales: float
    revenus_nets_mensuels_moyens: float | None
