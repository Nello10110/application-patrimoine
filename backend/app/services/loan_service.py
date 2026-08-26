"""Calcul du capital restant dû d'un emprunt (Phase 1 de `docs/ROADMAP.md`, patrimoine
net) — amortissement standard à taux fixe, mensualités constantes. Formule classique :
après `n` mensualités payées sur un capital `P` au taux mensuel `r` avec mensualité `M`,

    restant = P * (1 + r)^n - M * ((1 + r)^n - 1) / r

(cas particulier `r = 0` : amortissement linéaire, `restant = P - M * n`). Un recalage
manuel (`Loan.capital_restant_du_manuel`) prime toujours sur ce calcul théorique — un
prêt réel dérive du théorique dès qu'il y a eu un remboursement anticipé, un report
d'échéance, ou simplement une erreur d'arrondi cumulée sur plusieurs années."""

from datetime import datetime, timezone

from ..models import Loan


def maintenant_naif() -> datetime:
    """Même convention que le reste de l'application (`performance_service`,
    `historical_performance_service`...) : horodatage naïf (sans fuseau), SQLite ne
    conservant pas `tzinfo`. Exposée (pas de `_`) : `routers/loans.py` s'en sert aussi
    pour horodater un recalage manuel du capital restant dû."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def mois_ecoules(date_debut: datetime, a_la_date: datetime) -> int:
    """Nombre de mensualités entières écoulées entre deux dates — un mois n'est compté
    que si son jour anniversaire est atteint (ex. prêt débuté le 15, `a_la_date` le 10
    du mois suivant : 0 mois écoulé, pas 1)."""
    mois = (a_la_date.year - date_debut.year) * 12 + (a_la_date.month - date_debut.month)
    if a_la_date.day < date_debut.day:
        mois -= 1
    return max(0, mois)


def compute_capital_restant_du_theorique(loan: Loan, a_la_date: datetime) -> float:
    """Amortissement théorique pur, ignorant délibérément `capital_restant_du_manuel` —
    sert à reconstituer un point historique ANTÉRIEUR à un recalage manuel
    (`derniere_maj_manuelle`), cf. `services/patrimoine_history_service.py`. Toujours
    borné entre 0 et `capital_initial`."""
    n = mois_ecoules(loan.date_debut, a_la_date)
    if n <= 0:
        return loan.capital_initial
    if n >= loan.duree_mois:
        return 0.0

    taux_mensuel = loan.taux_annuel_pct / 100 / 12
    if taux_mensuel <= 0:
        restant = loan.capital_initial - loan.mensualite * n
    else:
        facteur = (1 + taux_mensuel) ** n
        restant = loan.capital_initial * facteur - loan.mensualite * (facteur - 1) / taux_mensuel

    return max(0.0, min(loan.capital_initial, restant))


def compute_capital_restant_du(loan: Loan, a_la_date: datetime | None = None) -> float:
    """Capital restant dû à `a_la_date` (aujourd'hui par défaut). Toujours borné entre
    0 et `capital_initial` — un arrondi ou un décalage de mensualité ne doit jamais
    produire un solde négatif ou supérieur au capital emprunté."""
    if loan.capital_restant_du_manuel is not None:
        return max(0.0, min(loan.capital_initial, loan.capital_restant_du_manuel))

    return compute_capital_restant_du_theorique(loan, a_la_date or maintenant_naif())
