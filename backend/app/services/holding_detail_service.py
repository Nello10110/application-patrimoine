"""Assemble la fiche détaillée d'une position (page/popup de détail) : valorisation,
rendements, look-through géo/secteur, composition nominative, infos émetteur/résumé/frais.
Regroupe ici ce qui était auparavant assemblé directement dans le routeur, pour garder
les routeurs fins et cette logique testable indépendamment de FastAPI.
"""

from sqlalchemy.orm import Session

from ..models import FundComposition, FundCompositionBrute, FundTopHolding, Holding, Transaction
from . import market_data_service, performance_service, reference_indices


def _frais_transaction_payes(db: Session, ticker: str, user_id: int) -> float:
    lignes = (
        db.query(Transaction)
        .filter(Transaction.symbol == ticker, Transaction.user_id == user_id)
        .with_entities(Transaction.fee, Transaction.tax)
        .all()
    )
    return sum(abs(fee) + abs(tax) for fee, tax in lignes)


def build_holding_detail(db: Session, ticker: str, user_id: int) -> dict | None:
    """Retourne `None` si le ticker n'existe pas dans le portefeuille de cet
    utilisateur (`user_id`, Milestone 2a — deux comptes peuvent détenir le même
    ticker, filtré en plus dans toute requête ci-dessous)."""
    holding = db.query(Holding).filter(Holding.ticker == ticker, Holding.user_id == user_id).first()
    if holding is None:
        return None

    md = holding.market_data
    prix_actuel = md.prix_actuel if md else None
    prix = prix_actuel if prix_actuel is not None else holding.prix_revient_moyen
    nom_affiche = (md.nom if md and md.nom else None) or holding.nom

    # Rendement de cette seule ligne (LOT 4.2) : `compute_holding_return` ne relit que
    # les transactions de ce ticker, plutôt que `compute_holding_returns(db)` qui
    # rejouerait tout le grand livre et revaloriserait tout le portefeuille pour
    # n'afficher au final que ces deux pourcentages sur une seule fiche.
    rendements = performance_service.compute_holding_return(db, ticker, user_id)

    compositions = db.query(FundComposition).filter(FundComposition.ticker == ticker).all()
    repartition_geo = [{"categorie": c.categorie, "poids": c.poids} for c in compositions if c.type == "geo"]
    repartition_sector = [{"categorie": c.categorie, "poids": c.poids} for c in compositions if c.type == "sector"]

    # Détail brut justETF (2.4, Increment 9) : affichage seul, en complément des
    # répartitions zone-mappées ci-dessus — vide pour toute position non couverte
    # par justETF (non-fonds, ou fonds sans composition publiée).
    compositions_brutes = db.query(FundCompositionBrute).filter(FundCompositionBrute.ticker == ticker).all()
    repartition_geo_detaillee = [{"categorie": c.categorie, "poids": c.poids} for c in compositions_brutes if c.type == "geo"]
    repartition_sector_detaillee = [{"categorie": c.categorie, "poids": c.poids} for c in compositions_brutes if c.type == "sector"]

    top_holdings = db.query(FundTopHolding).filter(FundTopHolding.ticker == ticker).order_by(FundTopHolding.poids.desc()).all()
    composition_actions = [
        {"symbol": t.holding_symbol, "nom": t.holding_nom, "poids": t.poids, "pays": t.pays, "secteur": t.secteur}
        for t in top_holdings
    ]

    ticker_resolu = market_data_service.resolve_ticker(db, ticker, holding.type_actif)
    extra = market_data_service.fetch_holding_extra_info(ticker_resolu, holding.type_actif)
    emetteur = extra.get("emetteur")
    if not emetteur and holding.type_actif == "FUND":
        # Repli pour les cotations à données pauvres (ex. secondaire allemande sans
        # `fundFamily`) : la marque de l'émetteur figure presque toujours dans le nom.
        emetteur = reference_indices.guess_emetteur_from_name(nom_affiche)

    # Résumé : yfinance (`longBusinessSummary`, à la demande) pour une action,
    # description justETF (récupérée en masse par `justetf_service.refresh_all`,
    # 2.4) pour un fonds — `fetch_holding_extra_info` renvoie toujours `resume=None`
    # pour un FUND (cf. sa docstring), donc `extra.get("resume")` reste le
    # comportement `STOCK` inchangé.
    resume = extra.get("resume")
    if holding.type_actif == "FUND" and md and md.description:
        resume = md.description

    return {
        "ticker": holding.ticker,
        "nom": nom_affiche,
        "type_actif": holding.type_actif,
        "quantite": holding.quantite,
        "prix_revient_moyen": holding.prix_revient_moyen,
        "prix_actuel": prix_actuel,
        "valeur": round((prix or 0) * holding.quantite, 2),
        "devise": md.devise if md else None,
        "secteur": md.secteur if md else None,
        "pays": md.pays if md else None,
        "rendement_depuis_achat_pct": rendements.get("rendement_depuis_achat_pct"),
        "rendement_annualise_pct": rendements.get("rendement_annualise_pct"),
        "emetteur": emetteur,
        "resume": resume,
        "frais_gestion_pct": extra.get("frais_gestion_pct"),
        "frais_transaction_payes": round(_frais_transaction_payes(db, ticker, user_id), 2),
        "repartition_geo": repartition_geo,
        "repartition_sector": repartition_sector,
        "repartition_geo_detaillee": repartition_geo_detaillee,
        "repartition_sector_detaillee": repartition_sector_detaillee,
        "composition_actions": composition_actions,
    }
