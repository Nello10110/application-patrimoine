"""Rapport récapitulatif sur une période arbitraire (roadmap Phase 4, § D.2 —
étendu depuis à l'annuel et à une période personnalisée) — équivalent du « rapport
mensuel » de Finary, mais sans envoi : l'application n'a pas de serveur mail, le
rapport est généré à la demande plutôt que poussé automatiquement. Éléments pour la
période demandée : évolution de la valeur du portefeuille (et sa décomposition
investi/généré, cf. ci-dessous), plus gros mouvements (en valeur absolue) et
dividendes perçus — tous dérivés de données déjà calculées ailleurs
(`historical_performance_service`, `performance_service`, `Transaction`), aucun
nouveau calcul de fond, uniquement une agrégation sur l'intervalle de dates fourni.

Un seul moteur générique plutôt qu'une fonction par granularité (mensuel/annuel) :
l'écran calcule lui-même les bornes du mois ou de l'année choisie (1er jour au
dernier jour), une période personnalisée n'étant qu'un intervalle de dates comme un
autre — voir `routers/performance.py`."""

from datetime import datetime

from sqlalchemy.orm import Session

from ..models import TYPES_EPARGNE, Holding, Transaction
from . import historical_performance_service, immobilier_service, patrimoine_history_service, performance_service, revenus_passifs_service
from .patrimoine_service import LABEL_NON_RENSEIGNE, LABEL_TYPE_ACTIF

NOMBRE_PLUS_GROS_MOUVEMENTS = 5


def _champ_a_ou_avant(points: list[dict], date_str: str, champ: str) -> float | None:
    """Dernière valeur connue de `champ` à date <= `date_str` parmi `points` (triés
    par date croissante). Si `date_str` précède le tout premier point (le portefeuille
    n'existait pas encore à cette date), retombe sur ce premier point plutôt que
    `None` — un "avant/après" du tout début d'historique reste plus honnête qu'une
    case vide."""
    candidat = None
    for p in points:
        if p["date"] <= date_str:
            candidat = p[champ]
        else:
            break
    if candidat is not None:
        return candidat
    return points[0][champ] if points else None


def _valeur_a_ou_avant(points: list[dict], date_str: str) -> float | None:
    return _champ_a_ou_avant(points, date_str, "valeur_portefeuille")


def _champ_strict_a_ou_avant(points: list[dict], date_str: str, champ: str) -> float:
    """Comme `_champ_a_ou_avant`, mais renvoie `0.0` — jamais la valeur du premier
    point — quand `date_str` précède tout l'historique connu. Nécessaire pour la
    décomposition investi/généré : contrairement à `evolution_pct` (qui accepte
    d'afficher 0 % plutôt qu'une case vide, cf. docstring ci-dessus), cette
    décomposition additionne des montants réels et doit refléter qu'aucune position
    n'existait encore avant le premier point. Sans ce correctif, une période
    commençant avant tout historique connu (ex. un rapport annuel alors que le
    premier achat date de juin) reprendrait à tort la valeur DÉJÀ investie du
    premier point comme `valeur_debut`, comptant alors l'achat une seconde fois en
    négatif dans `gain_genere_periode` (vérifié en conditions réelles : un achat de
    1000 € au 1er juin, demandé sur toute l'année, donnait à tort -986,5 € "généré"
    au lieu des 13,5 € de dividende réellement générés, sans appréciation de prix)."""
    if not points or date_str < points[0]["date"]:
        return 0.0
    valeur = _champ_a_ou_avant(points, date_str, champ)
    return valeur if valeur is not None else 0.0


def _valeur_epargne_a_date(db: Session, holdings: list[Holding], date_dt: datetime) -> tuple[float, dict[str, float]]:
    """Valeur totale de l'épargne (`TYPES_EPARGNE`) à `date_dt`, et sa répartition par
    type (libellé -> valeur) — réutilise `patrimoine_history_service._serie_holding_manuel`
    (même bloc de construction, historique réel + ancrage sur le coût d'acquisition, § S.3,
    que la courbe combinée du Tableau de bord) évaluée à une seule date plutôt qu'en série
    complète."""
    total = 0.0
    par_type: dict[str, float] = {}
    for h in holdings:
        historique = immobilier_service.historique_valorisation(db, h.id)
        serie = patrimoine_history_service._serie_holding_manuel(h, historique)
        valeur = historical_performance_service._value_at(serie, date_dt) or 0.0
        total += valeur
        label = LABEL_TYPE_ACTIF.get(h.type_actif, LABEL_NON_RENSEIGNE)
        par_type[label] = par_type.get(label, 0.0) + valeur
    return total, par_type


def _interets_epargne_periode(holdings: list[Holding], date_debut_dt: datetime, date_fin_dt: datetime) -> float:
    """Intérêts ESTIMÉS sur la période pour les livrets à taux déclaré
    (`REGULATED_SAVINGS`/`EMPLOYEE_SAVINGS`) : extension directe de
    `revenus_passifs_service._interets_livrets_annuels` (même formule
    `valeur_estimee * taux_pct / 100`), proratisée sur le nombre de jours de la
    période plutôt que fixée à 12 mois glissants. Utilise la valeur/le taux ACTUELS
    (pas ceux en vigueur au début de la période, non conservés) — même
    approximation que la projection à 12 mois dont cette fonction s'inspire."""
    jours_periode = (date_fin_dt - date_debut_dt).days + 1  # bornes inclusives, comme le reste du rapport
    interets_annuels = sum(
        h.valeur_estimee * h.taux_pct / 100
        for h in holdings
        if h.type_actif in revenus_passifs_service.TYPES_LIVRETS_AVEC_TAUX and h.valeur_estimee and h.taux_pct
    )
    return interets_annuels * jours_periode / 365


def compute_rapport_epargne_periode(db: Session, date_debut: str, date_fin: str, user_id: int) -> dict:
    """Bloc épargne du rapport (backlog § U.1) — voir le docstring de
    `RapportEpargnePeriode` pour la limite assumée sur `interets_estimes_periode`/
    `versements_estimes_periode` (estimations, pas des montants mesurés : l'épargne
    n'a pas de grand livre de versements contrairement au portefeuille financier)."""
    holdings = db.query(Holding).filter(Holding.user_id == user_id, Holding.type_actif.in_(TYPES_EPARGNE)).all()
    if not holdings:
        return {
            "a_des_donnees": False,
            "valeur_debut_periode": 0.0,
            "valeur_fin_periode": 0.0,
            "evolution_pct": None,
            "interets_estimes_periode": 0.0,
            "versements_estimes_periode": 0.0,
            "repartition_par_type": [],
        }

    date_debut_dt = datetime.strptime(date_debut, "%Y-%m-%d")
    date_fin_dt = datetime.strptime(date_fin, "%Y-%m-%d")
    valeur_debut, _ = _valeur_epargne_a_date(db, holdings, date_debut_dt)
    valeur_fin, repartition_fin = _valeur_epargne_a_date(db, holdings, date_fin_dt)
    evolution_pct = round((valeur_fin - valeur_debut) / valeur_debut * 100, 2) if valeur_debut > 1e-9 else None
    interets_estimes = round(_interets_epargne_periode(holdings, date_debut_dt, date_fin_dt), 2)
    versements_estimes = round((valeur_fin - valeur_debut) - interets_estimes, 2)

    return {
        "a_des_donnees": True,
        "valeur_debut_periode": round(valeur_debut, 2),
        "valeur_fin_periode": round(valeur_fin, 2),
        "evolution_pct": evolution_pct,
        "interets_estimes_periode": interets_estimes,
        "versements_estimes_periode": versements_estimes,
        "repartition_par_type": [
            {"label": label, "valeur": round(valeur, 2)}
            for label, valeur in sorted(repartition_fin.items(), key=lambda kv: -kv[1])
            if abs(valeur) > 1e-9
        ],
    }


def compute_rapport_periode(db: Session, date_debut: str, date_fin: str, user_id: int) -> dict:
    """`date_debut`/`date_fin` : bornes inclusives au format `AAAA-MM-JJ`. `user_id` :
    Milestone 2a, multi-utilisateur — le rapport ne porte jamais que sur ce compte."""
    points = historical_performance_service.compute_portfolio_history(db, user_id)
    valeur_debut = _valeur_a_ou_avant(points, date_debut)
    valeur_fin = _valeur_a_ou_avant(points, date_fin)
    evolution_pct = (
        round((valeur_fin - valeur_debut) / valeur_debut * 100, 2)
        if valeur_debut is not None and valeur_debut > 1e-9 and valeur_fin is not None
        else None
    )

    # Décomposition de l'évolution entre argent AJOUTÉ (achats réels sur la période,
    # réutilise la même fonction que le taux d'épargne, § 2.R.1) et argent GÉNÉRÉ
    # (plus-value + dividendes + intérêts + produits de vente, jamais confondus avec
    # l'argent injecté) — même identité algébrique que la réconciliation du graphique
    # d'accueil (§ 2.J.1) : `valeur_portefeuille + valeur_realisee_cumulee -
    # valeur_investie`, appliquée ici en delta sur la période plutôt qu'en cumulé
    # depuis l'origine. `valeur_realisee_cumulee` (ventes + dividendes + intérêts +
    # autres revenus, cumulée) fait déjà partie de chaque point de
    # `compute_portfolio_history`.
    montant_investi_periode = performance_service.montant_investi_periode(db, user_id, date_debut, date_fin)
    if points:
        valeur_debut_stricte = _champ_strict_a_ou_avant(points, date_debut, "valeur_portefeuille")
        valeur_fin_stricte = _champ_strict_a_ou_avant(points, date_fin, "valeur_portefeuille")
        realise_debut = _champ_strict_a_ou_avant(points, date_debut, "valeur_realisee_cumulee")
        realise_fin = _champ_strict_a_ou_avant(points, date_fin, "valeur_realisee_cumulee")
        gain_genere_periode = round(
            (valeur_fin_stricte - valeur_debut_stricte) + (realise_fin - realise_debut) - montant_investi_periode, 2
        )
    else:
        gain_genere_periode = None

    transactions_periode = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.date >= date_debut, Transaction.date <= date_fin)
        .order_by(Transaction.datetime_utc.asc())
        .all()
    )

    plus_gros_mouvements = sorted(transactions_periode, key=lambda tx: abs(tx.amount), reverse=True)[
        :NOMBRE_PLUS_GROS_MOUVEMENTS
    ]

    dividendes_percus = sum(
        tx.amount + tx.fee + tx.tax for tx in transactions_periode if tx.category == "CASH" and tx.type == "DIVIDEND"
    )

    return {
        "date_debut": date_debut,
        "date_fin": date_fin,
        "valeur_debut_periode": round(valeur_debut, 2) if valeur_debut is not None else None,
        "valeur_fin_periode": round(valeur_fin, 2) if valeur_fin is not None else None,
        "evolution_pct": evolution_pct,
        "montant_investi_periode": round(montant_investi_periode, 2),
        "gain_genere_periode": gain_genere_periode,
        "dividendes_percus": round(dividendes_percus, 2),
        "nombre_transactions": len(transactions_periode),
        "plus_gros_mouvements": [
            {
                "date": tx.date,
                "type": tx.type,
                "symbol": tx.symbol,
                "nom": tx.name,
                "montant": round(tx.amount + tx.fee + tx.tax, 2),
            }
            for tx in plus_gros_mouvements
        ],
        "epargne": compute_rapport_epargne_periode(db, date_debut, date_fin, user_id),
    }
