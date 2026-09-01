"""Historique combiné du patrimoine (lentille Net/Brut/Financier sur toute la page
Synthèse) : fusionne la série hebdomadaire déjà financière-seule de
`historical_performance_service.compute_portfolio_history` avec un historique daté,
épars, des actifs valorisés manuellement (`HoldingValuationHistory`,
`TYPES_ACTIF_PATRIMOINE_MANUEL`) et des emprunts (amortissement théorique par date,
`loan_service.compute_capital_restant_du_theorique`).

Distinct de `patrimoine_service.compute_patrimoine_net` (instantané, pas de paramètre de
date) : ce module reconstruit une SÉRIE, pas un seul point. Distinct de
`historical_performance_service` (financier seul, par contrat documenté dans son propre
en-tête) : ce module ne remplace pas cette série, il la complète.

**Limite assumée et documentée (données réelles clairsemées, cf. `docs/BACKLOG.md`)** :
les points de valorisation manuelle sont rares (parfois un seul par bien) — la portion
"manuelle" de la courbe combinée reste donc en escalier/plate pour l'immobilier/SCPI/
autre actif/véhicule tant que peu de points sont saisis, pas une vraie courbe continue.
C'est un choix assumé plutôt qu'une extrapolation inventée : mieux vaut une ligne plate
honnête qu'une fausse précision.

**Exception : lignes `TYPES_EPARGNE`, interpolées linéairement (backlog § U.2, retour
utilisateur 30/08/2026)** — livrets, PEE/PERCO, assurance-vie, PER, comptes courants
sont, à la différence de l'immobilier ci-dessus, INTERPOLÉS entre deux points connus
plutôt que plaqués en escalier (`_valeur_interpolee`) : le foyer a explicitement demandé
un lissage visuel entre deux actualisations, plutôt que le saut brutal donnant
l'impression d'un rattrapage instantané. Toujours pas d'extrapolation dans le futur
(valeur plaquée au dernier point connu au-delà) ni avant le premier point (`None`,
rien à représenter) — seul l'ENTRE-DEUX points change de comportement.

**Mode étagé Investi/Gains hors lentille Financier (backlog § U.3, retour utilisateur
30/08/2026)** : `valeur_investie`/`valeur_realisee_cumulee` (mêmes noms de champs que
`historical_performance_service.compute_portfolio_history`, pour que le frontend
réutilise la même formule de décomposition sans distinguo) sont désormais exposés ici
aussi. `valeur_investie` combine la part financière (grand livre de transactions
inchangé) et la part manuelle — cette dernière ne peut croître/décroître qu'aux points
où un versement est EXPLICITEMENT déclaré (`HoldingValuationHistory.versement`, § U.2) :
toute hausse/baisse non déclarée reste attribuée au gain, jamais à l'investi (même
convention que le résidu du bloc épargne du Rapport, § U.1/U.2). Contrairement à la
valeur brute d'une ligne `TYPES_EPARGNE` (interpolée, ci-dessus), la part investie reste
TOUJOURS en escalier (`_serie_investie_manuel` n'utilise jamais `_valeur_interpolee`) :
un versement est un événement ponctuel, jamais une progression continue à lisser.
`valeur_realisee_cumulee` reste exclusivement financière (ventes/dividendes/intérêts) —
aucun équivalent « réalisé » pour un bien valorisé manuellement, qui ne se cède pas par
petites parts comme une action.

**Limite assumée sur le scoping par détenteur** : les quotités (`QuotiteHolding`/
`QuotiteLoan`) ne sont pas historisées, seule la répartition D'AUJOURD'HUI existe. Les
lignes valorisées manuellement et les emprunts qui leur sont rattachés sont traités de
façon EXACTE (pourcentage d'aujourd'hui appliqué à la série propre de CETTE ligne). La
poche financière, elle, n'a pas de série par ligne exposée par `compute_portfolio_history`
(agrégée sur tout le portefeuille) : elle est donc scindée par un simple RATIO
d'aujourd'hui (`patrimoine_financier(détenteur) / patrimoine_financier(foyer)`), appliqué
uniformément à toute la série — suppose que cette répartition n'a pas changé dans le
temps. Un emprunt rattaché à une ligne financière (cas non observé en pratique — un
emprunt finance typiquement un bien immobilier, pas une action) tomberait dans ce même
flou plutôt que d'être netté avec la précision du cas manuel."""

import bisect
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import TYPES_ACTIF_PATRIMOINE_MANUEL, TYPES_EPARGNE, Holding, Loan
from . import detenteurs_service, historical_performance_service, historique_cache, immobilier_service, loan_service, patrimoine_service
from .historical_performance_service import TimeSeries


def _valeur_interpolee(serie: TimeSeries, date: datetime) -> float | None:
    """Comme `historical_performance_service._value_at`, mais INTERPOLE
    linéairement entre les deux points connus qui encadrent `date`, plutôt que de
    plaquer platement la dernière valeur connue (LOCF) jusqu'au point suivant —
    utilisée uniquement pour les lignes `TYPES_EPARGNE` (retour utilisateur
    30/08/2026, cf. docstring du module). `serie` doit être triée par date
    croissante (même contrat que `_value_at`). `None` avant le premier point ou
    série vide (rien à représenter) ; plaquée à la dernière valeur connue au-delà
    du dernier point (aucune extrapolation dans le futur — seule différence avec
    une interpolation "pure")."""
    if not serie:
        return None
    if date < serie[0][0]:
        return None
    if date >= serie[-1][0]:
        return serie[-1][1]
    idx = bisect.bisect_right(serie, date, key=lambda point: point[0])
    date_avant, valeur_avant = serie[idx - 1]
    date_apres, valeur_apres = serie[idx]
    if date_apres == date_avant:
        return valeur_apres
    fraction = (date - date_avant).total_seconds() / (date_apres - date_avant).total_seconds()
    return valeur_avant + (valeur_apres - valeur_avant) * fraction


def _valeur_ligne_a_date(holding: Holding, serie: TimeSeries, date: datetime) -> float | None:
    """Bascule entre les deux régimes ci-dessus selon le type de ligne — voir le
    docstring du module pour la justification de cette distinction."""
    if holding.type_actif in TYPES_EPARGNE:
        return _valeur_interpolee(serie, date)
    return historical_performance_service._value_at(serie, date)


def _series_financieres(db: Session, user_id: int) -> tuple[TimeSeries, TimeSeries, TimeSeries]:
    """`(valeur, investie, realisee_cumulee)` — un seul appel à `compute_portfolio_history`
    (déjà mis en cache par ce module, coûteux en réseau) plutôt que trois, pour
    alimenter à la fois la valeur brute et le mode étagé Investi/Gains (§ U.3)."""
    points = historical_performance_service.compute_portfolio_history(db, user_id)
    valeur = [(datetime.fromisoformat(p["date"]), p["valeur_portefeuille"]) for p in points]
    investie = [(datetime.fromisoformat(p["date"]), p["valeur_investie"]) for p in points]
    realisee = [(datetime.fromisoformat(p["date"]), p["valeur_realisee_cumulee"]) for p in points]
    return valeur, investie, realisee


def _serie_holding_manuel(holding: Holding, points_historique: list) -> TimeSeries:
    """`points_historique` : déjà chargé par l'appelant (une requête, pas une par
    holding). Dégrade avec grâce vers une ligne plate à `valeur_estimee` depuis
    `created_at` quand aucun point daté n'existe encore (ligne créée avant
    l'auto-horodatage, ou jamais valorisée) — jamais 0 ou une exception.

    Ancrage sur le coût d'acquisition (retour utilisateur, 26/08/2026) : si
    `Holding.date_acquisition` est renseignée et ANTÉRIEURE au premier point connu
    ci-dessus (cas courant — un bien est souvent saisi dans l'appli bien après son
    achat réel, cf. § 2.S.3), un point de départ à `prix_revient_moyen` (coût
    d'acquisition) est inséré à cette date : la courbe part alors du prix payé plutôt
    que de démarrer artificiellement tard (`created_at`) ou de laisser croire que la
    valeur actuelle était déjà celle du jour de l'achat. Sans effet si
    `prix_revient_moyen` n'est pas renseigné (rien à représenter à cette date)."""
    serie: TimeSeries = [(p.date_valeur, p.valeur) for p in points_historique] if points_historique else []
    if not serie and holding.valeur_estimee is not None:
        serie = [(holding.created_at, holding.valeur_estimee)]
    if holding.date_acquisition is not None and holding.prix_revient_moyen is not None:
        if not serie or holding.date_acquisition < serie[0][0]:
            serie.insert(0, (holding.date_acquisition, holding.prix_revient_moyen))
    return serie


def _serie_investie_manuel(holding: Holding, points_historique: list) -> TimeSeries:
    """Série de la part INVESTIE (cumulée) d'une ligne manuelle — pour le mode étagé
    Investi/Gains hors lentille Financier (backlog § U.3). Même ancrage que
    `_serie_holding_manuel` ci-dessus (coût d'acquisition à `prix_revient_moyen` si
    connu et antérieur au premier point) : au tout premier point connu de la ligne
    (l'ancrage s'il existe, sinon le premier point réel, sinon `valeur_estimee`),
    l'investi est supposé égal à la valeur affichée à ce moment-là — faute de mieux,
    c'est la meilleure hypothèse possible sur ce qui a été mis dedans jusque-là — SAUF
    quand un ancrage sur le coût d'acquisition s'applique (même condition que
    `_serie_holding_manuel`) : c'est alors `prix_revient_moyen` qui sert de base, pas
    la valeur du premier point réel (qui peut déjà inclure une performance depuis
    l'achat — sans quoi cette performance serait comptée à tort dans l'investi plutôt
    que dans le gain). Ensuite, l'investi cumulé ne bouge QU'aux points où
    `HoldingValuationHistory.versement` est explicitement déclaré (§ U.2) — tout écart
    non déclaré entre deux points reste un gain, jamais un ajout d'investi (même
    convention que le résidu du Rapport). L'ancrage synthétique lui-même (pas une
    ligne de la table, jamais de `versement`) ne peut jamais faire varier ce cumul,
    par construction — mais SI l'ancrage s'applique, même le PREMIER point réel est
    alors évalué pour un versement déclaré (l'argent injecté entre l'achat et cette
    première estimation a pu être précisé)."""
    if points_historique:
        premiere_date, premiere_valeur = points_historique[0].date_valeur, points_historique[0].valeur
    elif holding.valeur_estimee is not None:
        premiere_date, premiere_valeur = holding.created_at, holding.valeur_estimee
    else:
        premiere_date, premiere_valeur = None, None

    ancrage = (
        holding.date_acquisition is not None
        and holding.prix_revient_moyen is not None
        and (premiere_date is None or holding.date_acquisition < premiere_date)
    )

    if ancrage:
        cumul = holding.prix_revient_moyen
        serie: TimeSeries = [(holding.date_acquisition, cumul)]
        points_a_evaluer = points_historique
    elif premiere_date is not None:
        cumul = premiere_valeur
        serie = [(premiere_date, cumul)]
        points_a_evaluer = points_historique[1:] if points_historique else []
    else:
        return []

    for p in points_a_evaluer:
        if p.versement is not None:
            cumul += p.versement
        serie.append((p.date_valeur, cumul))
    return serie


def _valeur_emprunt_a_date(loan: Loan, date: datetime) -> float:
    """Contrairement à `loan_service.compute_capital_restant_du_theorique` (dont le
    contrat pour `a_la_date <= date_debut` est `capital_initial` — pertinent pour
    "combien resterait dû si on demandait aujourd'hui, rétroactivement"), une dette qui
    n'existait pas encore avant `date_debut` ne doit PAS apparaître dans une série
    historique de patrimoine : 0, explicitement, avant cette date."""
    if date < loan.date_debut:
        return 0.0
    if loan.capital_restant_du_manuel is not None:
        if loan.derniere_maj_manuelle is not None and date < loan.derniere_maj_manuelle:
            return loan_service.compute_capital_restant_du_theorique(loan, date)
        # Gelé après le recalage (ou sur toute la vie du prêt si la date du recalage
        # n'est pas connue — repli sûr, cohérent avec le comportement actuel hors
        # historique, qui ignore déjà `a_la_date` dans ce cas).
        return loan_service.compute_capital_restant_du(loan)
    return loan_service.compute_capital_restant_du_theorique(loan, date)


# Champs du point tel que produit par `_compute_patrimoine_history` ci-dessous — sert
# à détecter un cache écrit par une version antérieure du schéma, cf.
# `historique_cache.forme_valide`.
_CHAMPS_POINT_PATRIMOINE = {
    "date", "valeur_financiere", "valeur_manuelle", "actifs_totaux",
    "passifs_totaux", "patrimoine_net", "patrimoine_financier",
    "valeur_investie", "valeur_investie_nette", "valeur_realisee_cumulee",
}


def compute_patrimoine_history(db: Session, user_id: int, detenteur_id: int | None = None) -> list[dict]:
    cle = historique_cache.cle_historique_patrimoine(user_id, detenteur_id)
    en_cache = historique_cache.lire(db, cle)
    if en_cache is not None and historique_cache.forme_valide(en_cache, _CHAMPS_POINT_PATRIMOINE):
        return en_cache

    points = _compute_patrimoine_history(db, user_id, detenteur_id)
    historique_cache.ecrire(db, cle, points)
    return points


def _compute_patrimoine_history(db: Session, user_id: int, detenteur_id: int | None) -> list[dict]:
    serie_financiere, serie_financiere_investie, serie_financiere_realisee = _series_financieres(db, user_id)

    holdings_manuels = db.query(Holding).filter(Holding.user_id == user_id, Holding.type_actif.in_(TYPES_ACTIF_PATRIMOINE_MANUEL)).all()
    holdings_manuels_par_id = {h.id: h for h in holdings_manuels}
    series_manuelles: dict[int, TimeSeries] = {}
    series_investies_manuelles: dict[int, TimeSeries] = {}
    pourcentages_manuels: dict[int, dict[int, float]] = {}
    for holding in holdings_manuels:
        historique = immobilier_service.historique_valorisation(db, holding.id)
        series_manuelles[holding.id] = _serie_holding_manuel(holding, historique)
        series_investies_manuelles[holding.id] = _serie_investie_manuel(holding, historique)
        if detenteur_id is not None:
            pourcentages_manuels[holding.id] = detenteurs_service.compute_pourcentages(db, holding)

    loans = db.query(Loan).filter(Loan.user_id == user_id).all()
    pourcentages_emprunts: dict[int, dict[int, float]] = {}
    if detenteur_id is not None:
        holdings_par_id = holdings_manuels_par_id
        for loan in loans:
            if loan.holding_id is None:
                continue  # emprunt non rattaché : jamais visible pour un détenteur individuel
            holding_rattache = holdings_par_id.get(loan.holding_id) or db.get(Holding, loan.holding_id)
            if holding_rattache is not None:
                pourcentages_emprunts[loan.id] = detenteurs_service.compute_pourcentage_emprunt(db, holding_rattache, loan)

    ratio_financier = 1.0
    if detenteur_id is not None:
        patrimoine_foyer = patrimoine_service.compute_patrimoine_net(db, user_id, None)
        patrimoine_detenteur = patrimoine_service.compute_patrimoine_net(db, user_id, detenteur_id)
        financier_foyer = patrimoine_foyer["patrimoine_financier"]
        ratio_financier = patrimoine_detenteur["patrimoine_financier"] / financier_foyer if financier_foyer > 0 else 0.0

    candidats_debut: list[datetime] = []
    if serie_financiere:
        candidats_debut.append(serie_financiere[0][0])
    for serie in series_manuelles.values():
        if serie:
            candidats_debut.append(serie[0][0])
    for loan in loans:
        candidats_debut.append(loan.date_debut)

    if not candidats_debut:
        return []

    debut = min(candidats_debut)
    maintenant = datetime.now(timezone.utc).replace(tzinfo=None)
    grille = historical_performance_service._weekly_grid(debut, maintenant)

    points = []
    for date in grille:
        if detenteur_id is None:
            valeur_financiere = historical_performance_service._value_at(serie_financiere, date) or 0.0
            valeur_manuelle = sum(
                _valeur_ligne_a_date(holdings_manuels_par_id[holding_id], serie, date) or 0.0
                for holding_id, serie in series_manuelles.items()
            )
            passifs_totaux = sum(_valeur_emprunt_a_date(loan, date) for loan in loans)
            valeur_investie = historical_performance_service._value_at(serie_financiere_investie, date) or 0.0
            valeur_investie += sum(
                historical_performance_service._value_at(serie, date) or 0.0 for serie in series_investies_manuelles.values()
            )
            valeur_realisee_cumulee = historical_performance_service._value_at(serie_financiere_realisee, date) or 0.0
        else:
            valeur_financiere = (historical_performance_service._value_at(serie_financiere, date) or 0.0) * ratio_financier
            valeur_manuelle = 0.0
            for holding_id, serie in series_manuelles.items():
                pct = pourcentages_manuels.get(holding_id, {}).get(detenteur_id)
                if pct is None:
                    continue
                valeur_manuelle += (_valeur_ligne_a_date(holdings_manuels_par_id[holding_id], serie, date) or 0.0) * pct / 100
            passifs_totaux = 0.0
            for loan in loans:
                pct = pourcentages_emprunts.get(loan.id, {}).get(detenteur_id)
                if pct is None:
                    continue
                passifs_totaux += _valeur_emprunt_a_date(loan, date) * pct / 100
            valeur_investie = (historical_performance_service._value_at(serie_financiere_investie, date) or 0.0) * ratio_financier
            for holding_id, serie in series_investies_manuelles.items():
                pct = pourcentages_manuels.get(holding_id, {}).get(detenteur_id)
                if pct is None:
                    continue
                valeur_investie += (historical_performance_service._value_at(serie, date) or 0.0) * pct / 100
            valeur_realisee_cumulee = (historical_performance_service._value_at(serie_financiere_realisee, date) or 0.0) * ratio_financier

        actifs_totaux = valeur_financiere + valeur_manuelle
        points.append(
            {
                "date": date.date().isoformat(),
                "valeur_financiere": round(valeur_financiere, 2),
                "valeur_manuelle": round(valeur_manuelle, 2),
                "actifs_totaux": round(actifs_totaux, 2),
                "passifs_totaux": round(passifs_totaux, 2),
                "patrimoine_net": round(actifs_totaux - passifs_totaux, 2),
                "patrimoine_financier": round(valeur_financiere, 2),
                "valeur_investie": round(valeur_investie, 2),
                # Mode étagé Net (retour utilisateur 31/08/2026) : `valeur_investie`
                # ci-dessus reste BRUTE (jamais nettée d'un emprunt) alors que
                # `patrimoine_net` ci-dessus l'est déjà — les comparer directement en
                # lentille Net (`Gains = patrimoine_net - valeur_investie`) sous-comptait
                # massivement les gains d'un bien financé à crédit (la dette était
                # soustraite deux fois : une fois dans `patrimoine_net`, une fois de
                # façon détournée puisque `valeur_investie` grossier n'était jamais
                # réduit en retour). `valeur_investie_nette = valeur_investie -
                # passifs_totaux` (même netting global que `patrimoine_net`, pas de
                # rattachement par ligne ici — cohérent avec le reste de ce point,
                # calculé au niveau agrégé) restaure l'invariant attendu : Gains
                # (portefeuille + réalisé − investi) doit valoir EXACTEMENT le même
                # montant en lentille Brut et Net, la dette ne déplaçant jamais une
                # performance d'investissement, seulement le capital investi affiché.
                "valeur_investie_nette": round(valeur_investie - passifs_totaux, 2),
                "valeur_realisee_cumulee": round(valeur_realisee_cumulee, 2),
            }
        )

    return points
