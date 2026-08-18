"""Calcul de la rentabilité globale du portefeuille — exclusivement à partir de
l'activité boursière (achats/ventes de titres, dividendes, intérêts, frais).
Les virements avec la banque (dépôts/retraits sur le compte courant) sont hors
suivi boursier et ne sont même pas stockés (cf. `transaction_import.py`) : cette
appli ne calcule donc ni "solde de cash", ni "net investi" au sens bancaire.

Convention de données (établie par analyse de l'export réel) : `amount` est le
montant BRUT de l'opération ; `fee` (courtage) et `tax` (impôts/taxes) sont des
montants séparés et ALGÉBRIQUES — négatifs quand ce sont des charges, positifs
dans le cas (réel, observé) d'un remboursement (ex. une ligne TAX_OPTIMIZATION
avec `tax = +0.02`). Tous les flux de trésorerie nets se calculent donc par une
simple somme `amount + fee + tax`, jamais par un `abs()` qui transformerait un
remboursement en charge.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import Holding, Transaction
from . import analysis_service, portfolio_reconstruction

EPSILON = 1e-6

# Liste EXPLICITE des types de mouvements "autres revenus" comptés dans le résultat.
# Volontairement fermée (pas de `else` fourre-tout) : un type de mouvement non
# reconnu doit rester invisible du calcul plutôt que d'y entrer silencieusement.
AUTRES_REVENUS_TYPES = {
    "BENEFITS_SAVEBACK",  # cashback/parrainage courtier
    "STOCKPERK",  # action offerte par le courtier
    "BONUS",  # bonus divers
    "PEA_MARKETING",  # opération promotionnelle PEA
    "GIFT",  # cadeau
    "TAX_OPTIMIZATION",  # régularisation fiscale (peut être un remboursement : tax > 0)
}

# Tolérance de convergence de la bissection XIRR. Elle doit rester RELATIVE à la taille
# des flux : une VAN résiduelle de 1e-6 € est atteignable sur un portefeuille de quelques
# milliers d'euros, mais pas sur un portefeuille de plusieurs millions, où la précision
# du flottant plafonne bien au-dessus — un seuil absolu y ferait disparaître le rendement
# annualisé sans raison. On retient donc le plus grand des deux seuils.
XIRR_TOLERANCE_ABSOLUE = 1e-6
XIRR_TOLERANCE_RELATIVE = 1e-9

# En-dessous de cette durée de détention (en jours), on refuse d'annualiser : quelques
# jours de détention, une fois annualisés, produisent un pourcentage à quatre chiffres
# qui n'a aucun sens pour l'utilisateur.
DUREE_MINIMALE_JOURS = 90

# Au-delà de cette valeur absolue (en %), le taux annualisé trouvé est considéré comme
# aberrant (cas limites numériques, séries de flux trop courtes ou trop atypiques) et
# n'est pas affiché.
RENDEMENT_ANNUALISE_MAX_PCT = 1000.0


def xirr(cash_flows: list[tuple[datetime, float]]) -> float | None:
    """Rendement annualisé money-weighted (taux qui annule la valeur actuelle nette
    des flux de trésorerie), résolu par bissection.

    Renvoie `None` (plutôt qu'un chiffre) dans trois cas, choisis pour éviter
    d'afficher un pourcentage trompeur — l'appelant affiche alors "—" :
    - moins de deux flux, ou aucun changement de signe entre les bornes (pas de
      solution fiable par bissection) ;
    - une durée de détention (premier flux → dernier flux) inférieure à
      `DUREE_MINIMALE_JOURS` : annualiser quelques jours de détention produit un
      pourcentage à quatre chiffres sans signification pour l'utilisateur ;
    - une bissection qui ne converge pas sous la tolérance (relative à la taille des
      flux) en 200 itérations,
      ou un taux trouvé dont la valeur absolue dépasse `RENDEMENT_ANNUALISE_MAX_PCT`
      (résultat non fiable ou aberrant).
    """
    if len(cash_flows) < 2:
        return None

    flows = sorted(cash_flows, key=lambda cf: cf[0])
    t0 = flows[0][0]
    tolerance = max(XIRR_TOLERANCE_ABSOLUE, XIRR_TOLERANCE_RELATIVE * sum(abs(montant) for _, montant in flows))
    t_dernier = flows[-1][0]
    if (t_dernier - t0).days < DUREE_MINIMALE_JOURS:
        return None

    def npv(rate: float) -> float:
        total = 0.0
        for date, amount in flows:
            days = (date - t0).days
            total += amount / ((1 + rate) ** (days / 365.0))
        return total

    low, high = -0.999999, 100.0
    npv_low, npv_high = npv(low), npv(high)
    if npv_low == 0:
        rate = low
    elif npv_high == 0:
        rate = high
    elif npv_low * npv_high > 0:
        return None  # pas de changement de signe : pas de solution fiable par bissection
    else:
        mid = low
        for _ in range(200):
            mid = (low + high) / 2
            npv_mid = npv(mid)
            if abs(npv_mid) < tolerance:
                break
            if npv_low * npv_mid < 0:
                high = mid
            else:
                low = mid
                npv_low = npv_mid

        if abs(npv(mid)) >= tolerance:
            return None  # pas de convergence : pas de résultat plutôt qu'un nombre arbitraire
        rate = mid

    resultat_pct = rate * 100
    if abs(resultat_pct) > RENDEMENT_ANNUALISE_MAX_PCT:
        return None
    return resultat_pct


def compute_performance(db: Session) -> dict:
    transactions = db.query(Transaction).order_by(Transaction.datetime_utc.asc()).all()

    # Flux de revenus NETS (frais/taxes déjà intégrés, convention algébrique) : jamais
    # de `abs()` sur `fee`/`tax`, qui transformerait un remboursement (tax > 0) en charge.
    dividendes_percus = sum(
        tx.amount + tx.fee + tx.tax for tx in transactions if tx.category == "CASH" and tx.type == "DIVIDEND"
    )
    interets_percus = sum(
        tx.amount + tx.fee + tx.tax
        for tx in transactions
        if tx.category == "CASH" and tx.type == "INTEREST_PAYMENT"
    )
    autres_revenus = sum(tx.amount + tx.fee + tx.tax for tx in transactions if tx.type in AUTRES_REVENUS_TYPES)

    # Purement informatifs : NE PAS les resoustraire dans `gain_perte_total`, les frais et
    # taxes sont déjà intégrés (via `amount + fee + tax`) au coût de revient, aux produits
    # de cession et aux revenus nets ci-dessus. Les resoustraire ici créerait un double
    # comptage — c'était le bug corrigé par ce lot.
    frais_payes = sum(-tx.fee for tx in transactions)
    impots_preleves = sum(-tx.tax for tx in transactions)

    cout_total_investi = 0.0
    for tx in transactions:
        if tx.category == "TRADING" and tx.type == "BUY" and tx.shares is not None:
            cout_total_investi += -(tx.amount + tx.fee + tx.tax)
        elif tx.category == "CASH" and tx.type == "PRIVATE_MARKET_BUY":
            # Frais/taxes intégrés au coût investi, comme un achat en bourse (cf.
            # `portfolio_reconstruction._apply_transaction`) — seul flux qui, avant ce
            # lot, n'était comptabilisé nulle part.
            cout_total_investi += -(tx.amount + tx.fee + tx.tax)

    holdings = db.query(Holding).all()
    valued = analysis_service.value_holdings(holdings)
    valeur_positions = sum(v.valeur for v in valued)

    positions = portfolio_reconstruction.compute_positions(db)
    gains_realises = sum(state.realized_gain for state in positions.values())
    cout_base_ouvert = sum(state.cost_basis for state in positions.values() if state.shares > portfolio_reconstruction.EPSILON)
    gains_latents = valeur_positions - cout_base_ouvert

    gain_perte_total = gains_latents + gains_realises + dividendes_percus + interets_percus + autres_revenus
    rendement_simple_pct = (gain_perte_total / cout_total_investi * 100) if cout_total_investi > EPSILON else None

    # Rendement annualisé (XIRR) sur les flux d'achats/ventes agrégés de toutes les
    # positions — même méthode que par ligne (cf. compute_holding_returns), étendue
    # à tout le portefeuille : aucune dépendance aux virements bancaires.
    cash_flows: list[tuple[datetime, float]] = []
    for state in positions.values():
        cash_flows.extend(state.cash_flows)
    if cash_flows:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        cash_flows.append((now, valeur_positions))
    rendement_annualise_pct = xirr(cash_flows)

    premiere_transaction = next((tx.date for tx in transactions if tx.category == "TRADING" and tx.type == "BUY"), None)

    return {
        "valeur_positions": round(valeur_positions, 2),
        "valeur_totale": round(valeur_positions, 2),
        "cout_total_investi": round(cout_total_investi, 2),
        "gain_perte_total": round(gain_perte_total, 2),
        "rendement_simple_pct": round(rendement_simple_pct, 2) if rendement_simple_pct is not None else None,
        "rendement_annualise_pct": round(rendement_annualise_pct, 2) if rendement_annualise_pct is not None else None,
        "dividendes_percus": round(dividendes_percus, 2),
        "interets_percus": round(interets_percus, 2),
        "autres_revenus": round(autres_revenus, 2),
        "frais_payes": round(frais_payes, 2),
        "impots_preleves": round(impots_preleves, 2),
        "gains_realises": round(gains_realises, 2),
        "gains_latents": round(gains_latents, 2),
        "nombre_transactions": len(transactions),
        "premiere_transaction": premiere_transaction,
    }


def compute_holding_returns(db: Session) -> dict[str, dict]:
    """Rendement par ligne du portefeuille :
    - `depuis_achat` : simple (prix actuel vs prix de revient), calculable pour toute ligne
      ayant un prix de revient et un prix actuel (y compris les lignes saisies manuellement).
    - `annualise` : XIRR sur les flux de trésorerie réels de cette ligne (achats/ventes),
      donc uniquement disponible pour les positions reconstruites depuis l'historique de
      transactions (une ligne ajoutée manuellement n'a pas de date d'achat connue).
    """
    holdings = db.query(Holding).all()
    valued = analysis_service.value_holdings(holdings)
    positions = portfolio_reconstruction.compute_positions(db)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    results: dict[str, dict] = {}
    for v in valued:
        h = v.holding
        depuis_achat = None
        if h.prix_revient_moyen and h.prix_revient_moyen > EPSILON and h.market_data and h.market_data.prix_actuel:
            depuis_achat = (h.market_data.prix_actuel / h.prix_revient_moyen - 1) * 100

        annualise = None
        state = positions.get(h.ticker)
        if state and state.cash_flows and v.a_des_donnees:
            # Sans prix de marché réel, la ligne est valorisée à son coût : un XIRR
            # calculé sur ce flux fictif afficherait un 0% trompeur plutôt qu'une
            # vraie mesure de performance. On préfère ne rien afficher dans ce cas.
            flows = list(state.cash_flows) + [(now, v.valeur)]
            annualise = xirr(flows)

        results[h.ticker] = {
            "rendement_depuis_achat_pct": round(depuis_achat, 2) if depuis_achat is not None else None,
            "rendement_annualise_pct": round(annualise, 2) if annualise is not None else None,
        }

    return results
