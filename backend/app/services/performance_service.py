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

Mémoïsation à portée de requête (LOT 4.3) : `portfolio_reconstruction.compute_positions`
rejoue tout le grand livre et coûte cher sur un historique fourni ; `compute_performance`
et `compute_holding_returns` acceptent donc un paramètre optionnel `positions` — s'il est
fourni (par un appelant qui l'a déjà calculé), il est réutilisé tel quel plutôt que
recalculé. Volontairement explicite plutôt qu'un cache implicite (mémoïsation par requête
FastAPI, variable de module...) : un cache de process deviendrait faux dès qu'un import
ajoute des transactions en cours de vie de l'app, et un mécanisme implicite masquerait,
à la lecture d'une fonction, qu'elle consomme un résultat déjà calculé ailleurs.
`compute_positions` reste la seule source de vérité — ce paramètre ne fait que
transporter son résultat, jamais le dupliquer.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import Holding, Transaction
from . import analysis_service, portfolio_reconstruction
from .portfolio_reconstruction import PositionState

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


def compute_performance(db: Session, user_id: int, positions: dict[str, PositionState] | None = None) -> dict:
    """`user_id` : scope strictement à ce compte (Milestone 2a). `positions` :
    résultat déjà calculé de `portfolio_reconstruction.compute_positions(db, user_id)`,
    à fournir par un appelant qui l'a déjà en main pour éviter de rejouer le grand livre une
    deuxième fois (cf. LOT 4.3) ; recalculé si omis, comportement inchangé."""
    transactions = db.query(Transaction).filter(Transaction.user_id == user_id).order_by(Transaction.datetime_utc.asc()).all()

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

    # Immobilier/SCPI/assurance-vie/PER (Phase 1 de `docs/ROADMAP.md`) exclus : cette
    # carte reste volontairement scopée à l'activité BOURSIÈRE pure (increment 5) —
    # `gains_latents` ci-dessous se base sur `cout_base_ouvert`, qui ne connaît que les
    # positions reconstruites depuis le grand livre de transactions ; y inclure un bien
    # immobilier sans coût de base associé gonflerait le gain latent de sa valeur
    # entière. Ces actifs entrent dans le patrimoine net (`patrimoine_service.py`), pas
    # dans la rentabilité boursière.
    holdings = analysis_service.holdings_financiers(db, user_id)
    valued = analysis_service.value_holdings(holdings)
    valeur_positions = sum(v.valeur for v in valued)

    if positions is None:
        positions = portfolio_reconstruction.compute_positions(db, user_id)
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


def montant_investi_periode(db: Session, user_id: int, date_debut: str, date_fin: str) -> float:
    """Somme des achats réels (`TRADING/BUY` + `CASH/PRIVATE_MARKET_BUY`, frais/taxes
    inclus — même logique que `cout_total_investi` ci-dessus, mais bornée à une période
    plutôt qu'à toute la vie du compte) sur `[date_debut, date_fin]` (bornes incluses,
    format `AAAA-MM-JJ`, même filtrage que `rapport_service.compute_rapport_periode`).
    Volontairement une fonction séparée plutôt qu'un paramètre optionnel sur
    `compute_performance` : ce dernier est déjà livré et testé sur son calcul
    "vie entière", ne pas y toucher pour ce besoin distinct (taux d'épargne annuel)."""
    transactions_periode = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.date >= date_debut, Transaction.date <= date_fin)
        .all()
    )
    total = 0.0
    for tx in transactions_periode:
        if tx.category == "TRADING" and tx.type == "BUY" and tx.shares is not None:
            total += -(tx.amount + tx.fee + tx.tax)
        elif tx.category == "CASH" and tx.type == "PRIVATE_MARKET_BUY":
            total += -(tx.amount + tx.fee + tx.tax)
    return total


def compute_dividend_calendar(db: Session, user_id: int) -> list[dict]:
    """Dividendes perçus regroupés par mois calendaire (roadmap Phase 3, § C.1) —
    même source et même convention algébrique que `dividendes_percus` ci-dessus
    (`amount + fee + tax`, jamais d'`abs()`), simplement ventilée par mois et par
    ligne plutôt qu'en un seul total. `user_id` : Milestone 2a, multi-utilisateur."""
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.category == "CASH", Transaction.type == "DIVIDEND")
        .order_by(Transaction.datetime_utc.asc())
        .all()
    )

    par_mois: dict[str, dict] = {}
    for tx in transactions:
        mois = tx.date[:7]  # "AAAA-MM" (`Transaction.date` est "AAAA-MM-JJ")
        entree = par_mois.setdefault(mois, {"mois": mois, "montant_total": 0.0, "lignes": []})
        montant = tx.amount + tx.fee + tx.tax
        entree["montant_total"] += montant
        entree["lignes"].append({"date": tx.date, "symbol": tx.symbol, "nom": tx.name, "montant": round(montant, 2)})

    resultat = []
    for mois in sorted(par_mois):
        entree = par_mois[mois]
        entree["montant_total"] = round(entree["montant_total"], 2)
        resultat.append(entree)
    return resultat


def _rendement_pour_ligne(v: analysis_service.ValuedHolding, state: PositionState | None, now: datetime) -> dict:
    """Calcul commun à `compute_holding_returns` (toutes les lignes) et
    `compute_holding_return` (une seule, cf. LOT 4.2) — factorisé pour que les deux
    renvoient garantiment le même résultat pour un même ticker, par construction plutôt
    que par duplication de la formule à deux endroits."""
    h = v.holding
    # `valeur_estimee` (Phase 1 de `docs/ROADMAP.md`, immobilier/SCPI/assurance-vie/PER)
    # joue le rôle du prix actuel pour ces lignes : c'est un montant absolu, mais
    # `quantite` vaut 1 par convention pour elles (cf. `models.Holding.valeur_estimee`),
    # donc la comparer directement à `prix_revient_moyen` (le montant investi à
    # l'origine) reste correcte.
    prix_actuel_effectif = h.valeur_estimee if h.valeur_estimee is not None else (h.market_data.prix_actuel if h.market_data else None)
    depuis_achat = None
    if h.prix_revient_moyen and h.prix_revient_moyen > EPSILON and prix_actuel_effectif is not None:
        depuis_achat = (prix_actuel_effectif / h.prix_revient_moyen - 1) * 100

    annualise = None
    if state and state.cash_flows and v.a_des_donnees:
        # Sans prix de marché réel, la ligne est valorisée à son coût : un XIRR
        # calculé sur ce flux fictif afficherait un 0% trompeur plutôt qu'une
        # vraie mesure de performance. On préfère ne rien afficher dans ce cas.
        flows = list(state.cash_flows) + [(now, v.valeur)]
        annualise = xirr(flows)
    elif h.date_acquisition is not None and h.prix_revient_moyen and h.prix_revient_moyen > EPSILON and v.a_des_donnees:
        # Ligne valorisée manuellement (immobilier/épargne... — retour utilisateur,
        # 26/08/2026) : aucun grand livre de transactions, mais un seul flux connu
        # (l'achat, à `date_acquisition`) suffit à `xirr()` — avec un seul flux
        # entrant et un seul sortant, la formule money-weighted se réduit
        # exactement à un CAGR classique. Mêmes garde-fous que le portefeuille
        # financier (durée minimale 90 jours, plafond 1000 %, cf. `xirr`).
        annualise = xirr([(h.date_acquisition, -h.prix_revient_moyen), (now, prix_actuel_effectif)])

    return {
        "rendement_depuis_achat_pct": round(depuis_achat, 2) if depuis_achat is not None else None,
        "rendement_annualise_pct": round(annualise, 2) if annualise is not None else None,
    }


def compute_holding_returns(db: Session, user_id: int, positions: dict[str, PositionState] | None = None) -> dict[str, dict]:
    """Rendement par ligne du portefeuille :
    - `depuis_achat` : simple (prix actuel vs prix de revient), calculable pour toute ligne
      ayant un prix de revient et un prix actuel (y compris les lignes saisies manuellement).
    - `annualise` : XIRR sur les flux de trésorerie réels de cette ligne (achats/ventes)
      pour une position reconstruite depuis l'historique de transactions ; pour une ligne
      valorisée manuellement (immobilier/épargne...), un CAGR à un seul flux si
      `Holding.date_acquisition` est renseignée (retour utilisateur, 26/08/2026 — cf.
      `_rendement_pour_ligne`), sinon `None`.

    `user_id` : Milestone 2a, multi-utilisateur. `positions` : cf. LOT 4.3, résultat déjà
    calculé de `compute_positions(db, user_id)` à réutiliser si l'appelant l'a déjà en
    main ; recalculé si omis, comportement inchangé.
    """
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    valued = analysis_service.value_holdings(holdings)
    if positions is None:
        positions = portfolio_reconstruction.compute_positions(db, user_id)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    return {v.holding.ticker: _rendement_pour_ligne(v, positions.get(v.holding.ticker), now) for v in valued}


def compute_holding_return(db: Session, ticker: str, user_id: int, position: PositionState | None = None) -> dict:
    """Variante ciblée sur une seule ligne (LOT 4.2) : évite de relire tout le grand
    livre et de revaloriser tout le portefeuille (`compute_holding_returns(db, user_id)`)
    pour n'en afficher qu'une seule fiche (`holding_detail_service.build_holding_detail`).
    Renvoie exactement le même résultat que `compute_holding_returns(db, user_id)[ticker]`
    — même calcul (`_rendement_pour_ligne`), sur les mêmes données pour ce ticker, seule la
    façon de les obtenir change (une ligne + sa position, au lieu de tout le
    portefeuille). `{"rendement_depuis_achat_pct": None, "rendement_annualise_pct":
    None}` si le ticker n'existe pas dans le portefeuille, comme le ferait un `.get(ticker,
    {})` sur le résultat de `compute_holding_returns` (valeurs absentes -> `None` côté API).

    `user_id` : filtré EN PLUS du ticker (Milestone 2a) — deux utilisateurs peuvent
    détenir le même titre, jamais l'un sans l'autre. `position` : cf. LOT 4.3, résultat
    déjà calculé de `portfolio_reconstruction.compute_position(db, ticker, user_id)` à
    réutiliser si l'appelant l'a déjà en main ; recalculé si omis.
    """
    holding = db.query(Holding).filter(Holding.ticker == ticker, Holding.user_id == user_id).first()
    if holding is None:
        return {"rendement_depuis_achat_pct": None, "rendement_annualise_pct": None}

    v = analysis_service.value_holdings([holding])[0]
    if position is None:
        position = portfolio_reconstruction.compute_position(db, ticker, user_id)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    return _rendement_pour_ligne(v, position, now)
