"""Patrimoine net global (Phase 1 de `docs/ROADMAP.md`) : actifs − passifs, sur
*toutes* les lignes du portefeuille (financier + immobilier/épargne, cf.
`models.TYPES_ACTIF_PATRIMOINE_MANUEL`) moins les emprunts (`Loan`). Distinct
d'`analysis_service`/`performance_service`, qui restent volontairement scopés au seul
portefeuille financier (look-through géo/sectoriel, objectifs, rentabilité boursière —
cf. leur exclusion de ces nouveaux types d'actifs) : le patrimoine net est une vue
supplémentaire, pas un remplacement de ces écrans existants."""

from sqlalchemy.orm import Session

from ..models import Holding, Loan
from . import analysis_service, loan_service

# Libellés affichés pour la répartition par classe d'actif (nouvelle dimension, cf.
# ROADMAP § Phase 1 — ne remplace pas le look-through géo/sectoriel existant, qui n'a
# pas de sens pour un bien immobilier ou un contrat d'assurance-vie).
LABEL_TYPE_ACTIF: dict[str | None, str] = {
    "STOCK": "Actions",
    "FUND": "ETF / Fonds",
    "CRYPTO": "Crypto",
    "BOND": "Obligations",
    "PRIVATE_FUND": "Private Equity",
    "REAL_ESTATE": "Immobilier",
    "SCPI": "SCPI",
    "LIFE_INSURANCE": "Assurance-vie",
    "PENSION": "PER / Épargne retraite",
}
LABEL_NON_RENSEIGNE = "Non renseigné"


def compute_patrimoine_net(db: Session) -> dict:
    """`actifs_totaux` couvre toutes les lignes (`Holding.valeur_estimee` en priorité,
    sinon la même règle que `analysis_service.value_holdings` — prix de marché, à
    défaut coût de revient). `passifs_totaux` est la somme des capitaux restants dus
    de tous les emprunts (`loan_service.compute_capital_restant_du`)."""
    holdings = db.query(Holding).all()
    valued = analysis_service.value_holdings(holdings)
    actifs_totaux = sum(v.valeur for v in valued)

    loans = db.query(Loan).all()
    passifs_totaux = sum(loan_service.compute_capital_restant_du(loan) for loan in loans)

    par_classe: dict[str, float] = {}
    for v in valued:
        label = LABEL_TYPE_ACTIF.get(v.holding.type_actif, LABEL_NON_RENSEIGNE)
        par_classe[label] = par_classe.get(label, 0.0) + v.valeur

    repartition = sorted(
        ({"categorie": categorie, "valeur": round(valeur, 2)} for categorie, valeur in par_classe.items() if valeur > 0),
        key=lambda item: item["valeur"],
        reverse=True,
    )

    return {
        "actifs_totaux": round(actifs_totaux, 2),
        "passifs_totaux": round(passifs_totaux, 2),
        "patrimoine_net": round(actifs_totaux - passifs_totaux, 2),
        "repartition_par_classe": repartition,
    }
