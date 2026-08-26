"""Patrimoine net global (Phase 1 de `docs/ROADMAP.md`) : actifs − passifs, sur
*toutes* les lignes du portefeuille (financier + immobilier/épargne, cf.
`models.TYPES_ACTIF_PATRIMOINE_MANUEL`) moins les emprunts (`Loan`). Distinct
d'`analysis_service`/`performance_service`, qui restent volontairement scopés au seul
portefeuille financier (look-through géo/sectoriel, objectifs, rentabilité boursière —
cf. leur exclusion de ces nouveaux types d'actifs) : le patrimoine net est une vue
supplémentaire, pas un remplacement de ces écrans existants.

Filtre détenteur (backlog 2.L.1/2.K.3) : `detenteur_id=None` (défaut) reste la vue
foyer consolidée, strictement inchangée — c'est le comportement historique, verrouillé
par les tests existants. `detenteur_id` renseigné restreint chaque ligne à la part de
ce détenteur (`detenteurs_service.compute_parts`) ; une ligne jamais répartie
n'apparaît alors dans la vue d'AUCUN détenteur individuel (seulement dans la vue
foyer) — cohérent avec la règle « pas de quotité saisie = 100 % foyer implicite »."""

from dataclasses import replace

from sqlalchemy.orm import Session

from ..models import TYPES_ACTIF_PATRIMOINE_MANUEL, Holding, Loan
from . import analysis_service, detenteurs_service, loan_service

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
    # Taxonomie élargie (backlog 2.M.1) — absentes jusqu'ici de ce dictionnaire,
    # retombaient donc en "Non renseigné" ; complétées à l'occasion de l'exposition
    # consolidée (backlog 2.P.1), qui vise justement une classification complète.
    "CASH_ACCOUNT": "Compte courant",
    "REGULATED_SAVINGS": "Épargne réglementée",
    "EMPLOYEE_SAVINGS": "Épargne salariale",
    "VEHICLE": "Véhicule",
    "OTHER_ASSET": "Autre actif",
}
LABEL_NON_RENSEIGNE = "Non renseigné"
# Lentille "net" (retour utilisateur : l'actif net d'un bien, c'est sa valeur moins
# SON emprunt rattaché, pas la valeur brute) — bucket dédié pour un emprunt qui ne
# finance aucune ligne en particulier (`Loan.holding_id is None`), afin que la somme
# de `repartition_par_classe_nette` corresponde toujours exactement à `patrimoine_net`.
LABEL_DETTES_NON_RATTACHEES = "Dettes non rattachées"


def _crd_par_ligne(db: Session, user_id: int) -> tuple[dict[int, float], float]:
    """Capital restant dû de chaque emprunt de cet utilisateur, regroupé par ligne
    rattachée (`Loan.holding_id` -> somme des CRD des emprunts qui lui sont
    rattachés). Réutilisé par `compute_patrimoine_net` (vue foyer) ET
    `compute_exposition_consolidee` pour nettoyer chaque ligne de SON emprunt plutôt
    que de ne retrancher les emprunts qu'au niveau du grand total (retour
    utilisateur : l'actif net d'un bien, c'est sa valeur moins ce qu'il reste à
    rembourser dessus). Second élément du tuple : cumul des emprunts non rattachés à
    un actif (bucket "Dettes non rattachées" côté appelant)."""
    loans = db.query(Loan).filter(Loan.user_id == user_id).all()
    crd_par_holding: dict[int, float] = {}
    crd_non_rattache = 0.0
    for loan in loans:
        crd = loan_service.compute_capital_restant_du(loan)
        if loan.holding_id is not None:
            crd_par_holding[loan.holding_id] = crd_par_holding.get(loan.holding_id, 0.0) + crd
        else:
            crd_non_rattache += crd
    return crd_par_holding, crd_non_rattache


def compute_patrimoine_net(db: Session, user_id: int, detenteur_id: int | None = None) -> dict:
    """`actifs_totaux` couvre toutes les lignes de CET utilisateur (`user_id`,
    Milestone 2a — `Holding.valeur_estimee` en priorité, sinon la même règle que
    `analysis_service.value_holdings` — prix de marché, à défaut coût de revient).
    `passifs_totaux` est la somme des capitaux restants dus de tous ses emprunts
    (`loan_service.compute_capital_restant_du`)."""
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    valued = analysis_service.value_holdings(holdings)

    if detenteur_id is None:
        actifs_totaux = sum(v.valeur for v in valued)
        crd_par_holding, crd_non_rattache = _crd_par_ligne(db, user_id)
        passifs_totaux = sum(crd_par_holding.values()) + crd_non_rattache

        par_classe: dict[str, float] = {}
        par_classe_nette: dict[str, float] = {}
        for v in valued:
            label = LABEL_TYPE_ACTIF.get(v.holding.type_actif, LABEL_NON_RENSEIGNE)
            par_classe[label] = par_classe.get(label, 0.0) + v.valeur
            valeur_nette = v.valeur - crd_par_holding.get(v.holding.id, 0.0)
            par_classe_nette[label] = par_classe_nette.get(label, 0.0) + valeur_nette
        if crd_non_rattache != 0.0:
            par_classe_nette[LABEL_DETTES_NON_RATTACHEES] = par_classe_nette.get(LABEL_DETTES_NON_RATTACHEES, 0.0) - crd_non_rattache

        # Lentille "financier" (backlog 2.K.3) : réutilise `holdings_financiers` (déjà
        # la définition du portefeuille financier ailleurs dans l'app) plutôt que de
        # dupliquer sa logique d'exclusion.
        valued_financier = analysis_service.value_holdings(analysis_service.holdings_financiers(db, user_id))
        patrimoine_financier = sum(v.valeur for v in valued_financier)

        par_classe_financiere: dict[str, float] = {}
        for v in valued_financier:
            label = LABEL_TYPE_ACTIF.get(v.holding.type_actif, LABEL_NON_RENSEIGNE)
            par_classe_financiere[label] = par_classe_financiere.get(label, 0.0) + v.valeur
    else:
        actifs_totaux = 0.0
        passifs_totaux = 0.0
        par_classe = {}
        par_classe_nette = {}
        for v in valued:
            part = detenteurs_service.compute_parts(db, v.holding, v.valeur).get(detenteur_id)
            if part is None:
                continue  # ligne non répartie ou pas de part pour ce détenteur : vue foyer seule
            actifs_totaux += part["part_detenue"]
            passifs_totaux += part["part_detenue"] - part["part_nette"]
            label = LABEL_TYPE_ACTIF.get(v.holding.type_actif, LABEL_NON_RENSEIGNE)
            par_classe[label] = par_classe.get(label, 0.0) + part["part_detenue"]
            # `part_nette` (déjà = part_detenue − part de l'emprunt rattaché à CETTE
            # ligne, cf. `detenteurs_service.compute_parts`) est exactement la même
            # notion que ci-dessus pour la vue foyer — aucun bucket "non rattaché" ici,
            # un emprunt sans actif n'a de toute façon aucun cas d'usage par détenteur
            # individuel (cf. docstring de `compute_parts`).
            par_classe_nette[label] = par_classe_nette.get(label, 0.0) + part["part_nette"]

        patrimoine_financier = 0.0
        par_classe_financiere = {}
        for h in analysis_service.holdings_financiers(db, user_id):
            valeur = next((v.valeur for v in valued if v.holding.id == h.id), 0.0)
            part = detenteurs_service.compute_parts(db, h, valeur).get(detenteur_id)
            if part is not None:
                patrimoine_financier += part["part_detenue"]
                label = LABEL_TYPE_ACTIF.get(h.type_actif, LABEL_NON_RENSEIGNE)
                par_classe_financiere[label] = par_classe_financiere.get(label, 0.0) + part["part_detenue"]

    def _repartition_triee(totaux: dict[str, float], garder_negatifs: bool = False) -> list[dict]:
        return sorted(
            ({"categorie": categorie, "valeur": round(valeur, 2)} for categorie, valeur in totaux.items() if garder_negatifs or valeur > 0),
            key=lambda item: item["valeur"],
            reverse=True,
        )

    return {
        "actifs_totaux": round(actifs_totaux, 2),
        "passifs_totaux": round(passifs_totaux, 2),
        "patrimoine_net": round(actifs_totaux - passifs_totaux, 2),
        "patrimoine_financier": round(patrimoine_financier, 2),
        "repartition_par_classe": _repartition_triee(par_classe),
        "repartition_par_classe_financiere": _repartition_triee(par_classe_financiere),
        # `garder_negatifs=True` : une ligne dont l'emprunt rattaché dépasse sa valeur
        # (équité négative) ou le bucket "Dettes non rattachées" doivent rester visibles
        # tels quels (jamais de fausse précision en les masquant) — la somme de ce champ
        # vaut toujours exactement `patrimoine_net` ci-dessus.
        "repartition_par_classe_nette": _repartition_triee(par_classe_nette, garder_negatifs=True),
    }


def _repartition_triee(totaux: dict[str, float]) -> list[dict]:
    return sorted(
        ({"categorie": c, "valeur": round(v, 2)} for c, v in totaux.items() if v > 0),
        key=lambda item: item["valeur"],
        reverse=True,
    )


def _calculer_expo(db: Session, valued: list, valeur_totale: float) -> dict:
    """Calcule les 7 champs dérivés (répartitions + concentration) de
    `compute_exposition_consolidee` à partir d'une liste `valued` déjà valorisée
    (brute OU nette selon l'appelant) — factorisé pour ne pas dupliquer cette logique
    entre les deux variantes Brut/Net (backlog § 2.S.2, retour utilisateur : le
    sélecteur Net/Brut/Financier doit aussi piloter cette carte, pas seulement le
    chiffre principal)."""
    repartition_geo = _repartition_triee(analysis_service.breakdown_with_lookthrough(db, valued, "geo"))

    totaux_classe: dict[str, float] = {}
    for v in valued:
        label = LABEL_TYPE_ACTIF.get(v.holding.type_actif, LABEL_NON_RENSEIGNE)
        totaux_classe[label] = totaux_classe.get(label, 0.0) + v.valeur
    repartition_classe = _repartition_triee(totaux_classe)

    lignes_triees = sorted(valued, key=lambda v: v.valeur, reverse=True)
    plus_grosse_ligne_ticker = lignes_triees[0].holding.ticker if lignes_triees and valeur_totale > 0 else None
    plus_grosse_ligne_pct = round(lignes_triees[0].valeur / valeur_totale * 100, 1) if lignes_triees and valeur_totale > 0 else None
    top5_lignes_pct = round(sum(v.valeur for v in lignes_triees[:5]) / valeur_totale * 100, 1) if valeur_totale > 0 else None

    premiere_zone_geo = repartition_geo[0]["categorie"] if repartition_geo else None
    premiere_zone_geo_pct = round(repartition_geo[0]["valeur"] / valeur_totale * 100, 1) if repartition_geo and valeur_totale > 0 else None

    valeur_manuelle = sum(v.valeur for v in valued if v.holding.type_actif in TYPES_ACTIF_PATRIMOINE_MANUEL)
    part_estimee_manuelle_pct = round(valeur_manuelle / valeur_totale * 100, 1) if valeur_totale > 0 else 0.0

    return {
        "valeur_totale": round(valeur_totale, 2),
        "repartition_geo": repartition_geo,
        "repartition_classe": repartition_classe,
        "plus_grosse_ligne_ticker": plus_grosse_ligne_ticker,
        "plus_grosse_ligne_pct": plus_grosse_ligne_pct,
        "top5_lignes_pct": top5_lignes_pct,
        "premiere_zone_geo": premiere_zone_geo,
        "premiere_zone_geo_pct": premiere_zone_geo_pct,
        "part_estimee_manuelle_pct": part_estimee_manuelle_pct,
    }


def compute_exposition_consolidee(db: Session, user_id: int) -> dict:
    """Exposition consolidée tous actifs (backlog 2.P.1) : une seule répartition
    géographique et par classe d'actif, financier ET immobilier/épargne confondus —
    le besoin fondateur du projet, jusqu'ici jamais servi (`analysis_service` reste
    volontairement scopé au seul portefeuille financier pour les objectifs/la
    rentabilité boursière, cf. sa docstring).

    **Deux variantes Brut/Net** (backlog § 2.S.2, retour utilisateur du 26/08/2026) :
    une première correction avait nette chaque ligne de SON emprunt rattaché
    (`_crd_par_ligne`) de façon INCONDITIONNELLE — l'utilisateur a fait remarquer que
    la carte affichait alors exactement les mêmes pourcentages en lentille Net et en
    lentille Brut, puisque `ExpositionConsolideeCard` ne lit même pas `lentille`. Cette
    fonction renvoie donc désormais les deux jeux de champs, suffixés `_nette` pour la
    variante nettée (même principe que `repartition_par_classe`/
    `repartition_par_classe_nette` de `compute_patrimoine_net`) ; le frontend choisit
    lequel afficher selon la lentille active. `valeur_totale_nette` correspond
    exactement à `patrimoine_net` de `compute_patrimoine_net`, `valeur_totale` (brute)
    à `actifs_totaux`. Un emprunt non rattaché à un actif réduit `valeur_totale_nette`
    sans être imputable à une catégorie géo/classe précise (cohérent avec
    `repartition_par_classe_nette`, qui le range dans un bucket "Dettes non
    rattachées" séparé — inutile ici, la géo/classe consolidées n'ont pas cette notion
    de bucket dédié, seul le total net en tient compte).

    Géo : réutilise `analysis_service.breakdown_with_lookthrough`, qui éclate déjà les
    fonds sur leur composition interne — les actifs valorisés manuellement y
    contribuent via `Holding.zone_geo` (repli `ZONE_EUROPE`, cf. `value_holdings`),
    une estimation déclarée, jamais mesurée comme le look-through d'un fonds.
    `part_estimee_manuelle_pct` (part du patrimoine dont la géo est ainsi estimée
    plutôt que mesurée) matérialise cette distinction sans dupliquer tout l'encart de
    qualité des données existant (`analysis_service.compute_data_quality`, qui reste
    affiché tel quel sur le Tableau de bord pour le seul financier).

    Concentration : « premier émetteur » est ici la plus grosse LIGNE du portefeuille
    (pas un vrai agrégat multi-fonds par émetteur réel — hors de portée sans
    recouper le look-through de chaque fonds avec les positions détenues en direct,
    limite assumée et documentée)."""
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    valued = analysis_service.value_holdings(holdings)
    valeur_totale_brute = sum(v.valeur for v in valued)

    crd_par_holding, crd_non_rattache = _crd_par_ligne(db, user_id)
    valued_net = [replace(v, valeur=v.valeur - crd_par_holding.get(v.holding.id, 0.0)) for v in valued]
    valeur_totale_nette = sum(v.valeur for v in valued_net) - crd_non_rattache

    brut = _calculer_expo(db, valued, valeur_totale_brute)
    net = _calculer_expo(db, valued_net, valeur_totale_nette)

    return {
        **brut,
        "valeur_totale_nette": net["valeur_totale"],
        "repartition_geo_nette": net["repartition_geo"],
        "repartition_classe_nette": net["repartition_classe"],
        "plus_grosse_ligne_ticker_nette": net["plus_grosse_ligne_ticker"],
        "plus_grosse_ligne_pct_nette": net["plus_grosse_ligne_pct"],
        "top5_lignes_pct_nette": net["top5_lignes_pct"],
        "premiere_zone_geo_nette": net["premiere_zone_geo"],
        "premiere_zone_geo_pct_nette": net["premiere_zone_geo_pct"],
        "part_estimee_manuelle_pct_nette": net["part_estimee_manuelle_pct"],
    }
