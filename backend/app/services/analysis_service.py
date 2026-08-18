"""Calcul de la répartition réelle du portefeuille (géo/secteur) et des indicateurs de risque."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from ..models import FundComposition, Holding
from .reference_indices import label_for_sector


@dataclass
class ValuedHolding:
    holding: Holding
    valeur: float
    region: str | None
    pays: str | None
    secteur_label: str | None
    a_des_donnees: bool


def value_holdings(holdings: list[Holding]) -> list[ValuedHolding]:
    """Valorise chaque ligne (prix actuel, ou coût de revient à défaut de cotation)."""
    valued = []
    for h in holdings:
        md = h.market_data
        prix = md.prix_actuel if md and md.prix_actuel is not None else h.prix_revient_moyen
        a_des_donnees = md is not None and md.erreur is None and md.prix_actuel is not None
        valued.append(
            ValuedHolding(
                holding=h,
                valeur=(prix or 0) * h.quantite,
                region=md.region if md else None,
                pays=md.pays if md else None,
                secteur_label=label_for_sector(md.secteur) if md and md.secteur else None,
                a_des_donnees=a_des_donnees,
            )
        )
    return valued


def _fund_composition_lookup(db: Session, tickers: list[str], type_: str) -> dict[str, list[FundComposition]]:
    """Lignes `FundComposition` des tickers donnés, groupées par ticker de fonds."""
    if not tickers:
        return {}
    compositions = db.query(FundComposition).filter(FundComposition.ticker.in_(tickers), FundComposition.type == type_).all()
    lookup: dict[str, list[FundComposition]] = {}
    for c in compositions:
        lookup.setdefault(c.ticker, []).append(c)
    return lookup


def breakdown_with_lookthrough(db: Session, valued: list[ValuedHolding], type_: str) -> dict[str, float]:
    """Répartition géo/secteur du portefeuille : les fonds/ETF sont éclatés sur
    plusieurs catégories selon leur composition interne (`FundComposition`) plutôt
    que laissés en bloc dans "Non catégorisé". `type_` vaut "geo" ou "sector"."""
    comp_by_ticker = _fund_composition_lookup(db, [v.holding.ticker for v in valued], type_)
    key = "region" if type_ == "geo" else "secteur_label"

    totals: dict[str, float] = {}
    for v in valued:
        rows = comp_by_ticker.get(v.holding.ticker)
        if rows:
            for row in rows:
                totals[row.categorie] = totals.get(row.categorie, 0.0) + v.valeur * row.poids
        else:
            categorie = getattr(v, key) or "Non catégorisé"
            totals[categorie] = totals.get(categorie, 0.0) + v.valeur
    return totals


def holdings_in_category(db: Session, valued: list[ValuedHolding], type_: str, categorie: str) -> list[dict]:
    """Détail des lignes qui composent une catégorie donnée (pour le camembert de
    composition) — même logique que `breakdown_with_lookthrough` mais sans sommer."""
    comp_by_ticker = _fund_composition_lookup(db, [v.holding.ticker for v in valued], type_)
    key = "region" if type_ == "geo" else "secteur_label"

    lignes = []
    for v in valued:
        rows = comp_by_ticker.get(v.holding.ticker)
        if rows:
            contribution = v.valeur * sum(row.poids for row in rows if row.categorie == categorie)
        else:
            categorie_holding = getattr(v, key) or "Non catégorisé"
            contribution = v.valeur if categorie_holding == categorie else 0.0

        if contribution > 1e-9:
            lignes.append({"ticker": v.holding.ticker, "nom": v.holding.nom, "valeur": round(contribution, 2)})

    lignes.sort(key=lambda l: -l["valeur"])
    return lignes


def compute_risk_indicators(valued: list[ValuedHolding], geo_totals: dict[str, float], sector_totals: dict[str, float]) -> dict:
    """Indicateurs de concentration/diversification du portefeuille. `geo_totals`
    et `sector_totals` viennent de `breakdown_with_lookthrough` (déjà calculés une
    fois par le routeur, pas recalculés ici) pour rester cohérents avec les graphiques."""
    valeur_totale = sum(v.valeur for v in valued)
    nombre_lignes = len(valued)
    lignes_sans_donnees = sum(1 for v in valued if not v.a_des_donnees)

    if valeur_totale <= 0:
        return {
            "valeur_totale": 0.0,
            "nombre_lignes": nombre_lignes,
            "top_ligne_poids": 0.0,
            "top_ligne_nom": None,
            "top_pays_poids": 0.0,
            "top_pays_nom": None,
            "top_secteur_poids": 0.0,
            "top_secteur_nom": None,
            "score_diversification": 0.0,
            "lignes_sans_donnees": lignes_sans_donnees,
        }

    top_holding = max(valued, key=lambda v: v.valeur, default=None)
    top_pays = max(geo_totals.items(), key=lambda kv: kv[1]) if geo_totals else (None, 0.0)
    top_secteur = max(sector_totals.items(), key=lambda kv: kv[1]) if sector_totals else (None, 0.0)

    # Indice de Herfindahl-Hirschman (somme des parts au carré) : proche de 0 = très
    # diversifié, proche de 1 = concentré sur une ligne. Score affiché = (1-HHI)*100.
    hhi = sum((v.valeur / valeur_totale) ** 2 for v in valued)

    return {
        "valeur_totale": valeur_totale,
        "nombre_lignes": nombre_lignes,
        "top_ligne_poids": round((top_holding.valeur / valeur_totale) * 100, 1) if top_holding else 0.0,
        "top_ligne_nom": (top_holding.holding.nom or top_holding.holding.ticker) if top_holding else None,
        "top_pays_poids": round((top_pays[1] / valeur_totale) * 100, 1),
        "top_pays_nom": top_pays[0],
        "top_secteur_poids": round((top_secteur[1] / valeur_totale) * 100, 1),
        "top_secteur_nom": top_secteur[0],
        "score_diversification": round((1 - hhi) * 100, 1),
        "lignes_sans_donnees": lignes_sans_donnees,
    }
