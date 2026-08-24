"""Détection des charges récurrentes et abonnements (backlog 2.N.3) — sous-produit
de l'import (2.N.1), pas un chantier séparé : regroupe les mouvements par libellé
normalisé sur une fenêtre glissante, indépendamment de la période affichée à l'écran
(un abonnement mensuel reste un abonnement qu'on regarde 1 mois ou 1 an de budget).
"""

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import budget_categories_service, budget_service

# Fenêtre d'observation (backlog n'impose pas de valeur — 12 mois couvre les
# abonnements annuels type assurance sans faire remonter des charges éteintes
# depuis longtemps) et fenêtre de récence (un mouvement dont la dernière occurrence
# remonte à plus de 45 jours n'est plus considéré actif — l'abonnement a
# probablement été résilié, ne pas le lister comme une charge encore due).
FENETRE_OBSERVATION_JOURS = 365
FENETRE_RECENCE_JOURS = 45
# Seuil de hausse de prix (backlog 2.N.3) : au-delà de 5 % entre deux occurrences
# consécutives du même abonnement, signalé comme une hausse plutôt qu'un simple
# arrondi de facturation.
SEUIL_HAUSSE_PRIX_PCT = 5.0


@dataclass
class RecurrenceDetectee:
    libelle: str
    categorie_id: int | None
    montant_actuel: float
    montant_precedent: float | None
    hausse_prix: bool
    occurrences: int
    premiere_date: str
    derniere_date: str
    periodicite: str  # "mensuelle" | "irreguliere"


def detect_recurrences(db: Session, user_id: int, aujourdhui: date | None = None) -> list[RecurrenceDetectee]:
    aujourdhui = aujourdhui or date.today()
    depuis = (aujourdhui - timedelta(days=FENETRE_OBSERVATION_JOURS)).isoformat()
    mouvements = budget_service.list_mouvements(db, user_id, date_debut=depuis, date_fin=aujourdhui.isoformat())

    # Regroupé par libellé SEUL (pas (libellé, montant) comme l'heuristique plus
    # légère de `compute_depenses_recurrentes_mensuelles`, backlog 2.N.2) : une
    # hausse de prix ne peut être détectée que si deux montants différents peuvent
    # appartenir au même groupe.
    groupes: dict[str, list] = {}
    for m in mouvements:
        if m.montant >= 0:
            continue
        cle = budget_categories_service.normaliser(m.libelle)
        groupes.setdefault(cle, []).append(m)

    resultats: list[RecurrenceDetectee] = []
    for mouvements_groupe in groupes.values():
        tries = sorted(mouvements_groupe, key=lambda m: m.date)
        if len(tries) < 2:
            continue

        derniere_date = tries[-1].date
        if (aujourdhui - date.fromisoformat(derniere_date)).days > FENETRE_RECENCE_JOURS:
            continue  # plus vu récemment : probablement résilié, pas une charge encore due

        mois_distincts = {m.date[:7] for m in tries}
        if len(mois_distincts) < 2:
            continue  # même mouvement répété le même mois ne suffit pas à parler de récurrence

        intervalles = [
            (date.fromisoformat(tries[i + 1].date) - date.fromisoformat(tries[i].date)).days for i in range(len(tries) - 1)
        ]
        moyenne_intervalle = sum(intervalles) / len(intervalles)
        periodicite = "mensuelle" if 20 <= moyenne_intervalle <= 40 else "irreguliere"

        montant_actuel = round(abs(tries[-1].montant), 2)
        montant_precedent = round(abs(tries[-2].montant), 2)
        hausse_prix = montant_actuel > montant_precedent * (1 + SEUIL_HAUSSE_PRIX_PCT / 100)

        resultats.append(
            RecurrenceDetectee(
                libelle=tries[-1].libelle,
                categorie_id=tries[-1].categorie_id,
                montant_actuel=montant_actuel,
                montant_precedent=montant_precedent,
                hausse_prix=hausse_prix,
                occurrences=len(tries),
                premiere_date=tries[0].date,
                derniere_date=derniere_date,
                periodicite=periodicite,
            )
        )

    resultats.sort(key=lambda r: r.montant_actuel, reverse=True)
    return resultats
