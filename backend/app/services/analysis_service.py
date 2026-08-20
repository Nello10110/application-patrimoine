"""Calcul de la répartition réelle du portefeuille (géo/secteur) et des indicateurs de risque."""

from dataclasses import dataclass

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import SOURCE_INDICE, TYPES_ACTIF_PATRIMOINE_MANUEL, FundComposition, Holding
from .reference_indices import NON_CATEGORISE, label_for_sector


# Libellé affiché pour regrouper les lignes sans compte renseigné (LOT 5.1), plutôt
# que de les écarter du total ou de laisser un libellé vide/ambigu dans la répartition.
COMPTE_SANS_ANNOTATION = "Sans compte renseigné"


@dataclass
class ValuedHolding:
    holding: Holding
    valeur: float
    region: str | None
    pays: str | None
    secteur_label: str | None
    a_des_donnees: bool


def holdings_financiers(db: Session) -> list[Holding]:
    """Portefeuille FINANCIER seul (actions/ETF/crypto/obligations/private equity, ou
    type non renseigné) — exclut l'immobilier/SCPI/assurance-vie/PER (Phase 1 de
    `docs/ROADMAP.md`, cf. `models.TYPES_ACTIF_PATRIMOINE_MANUEL`), qui n'entrent ni
    dans le look-through géo/sectoriel, ni dans les objectifs, ni dans la rentabilité
    boursière (`performance_service.compute_performance`) — ils entrent en revanche
    dans le patrimoine net (`services/patrimoine_service.py`), qui n'utilise pas cette
    fonction et reste sur `db.query(Holding).all()`.

    `.notin_()` seul exclurait aussi les lignes `type_actif IS NULL` (sémantique SQL :
    `NULL NOT IN (...)` vaut NULL, pas TRUE) — `or_(.is_(None), ...)` les garde,
    puisqu'une ligne sans type renseigné est un cas normal du portefeuille financier
    existant (saisie manuelle sans type précisé), pas un nouvel actif patrimonial."""
    return (
        db.query(Holding)
        .filter(or_(Holding.type_actif.is_(None), Holding.type_actif.notin_(TYPES_ACTIF_PATRIMOINE_MANUEL)))
        .all()
    )


def value_holdings(holdings: list[Holding]) -> list[ValuedHolding]:
    """Valorise chaque ligne (prix actuel, ou coût de revient à défaut de cotation).

    `Holding.valeur_estimee` (Phase 1 de `docs/ROADMAP.md`, immobilier/SCPI/assurance-vie/
    PER — cf. `models.TYPES_ACTIF_PATRIMOINE_MANUEL`) est un montant ABSOLU en euros,
    prioritaire sur `prix * quantite` quand renseigné : `quantite` vaut 1 par convention
    pour ces lignes, la multiplication resterait correcte, mais autant ne pas en
    dépendre. `a_des_donnees=True` dans ce cas : une estimation manuelle tenue à jour
    par l'utilisateur est une vraie donnée, à ne pas confondre avec le repli « valorisé
    au coût faute de cotation » (`PRIVATE_FUND`/`BOND`, `a_des_donnees=False`)."""
    valued = []
    for h in holdings:
        if h.valeur_estimee is not None:
            valued.append(
                ValuedHolding(holding=h, valeur=h.valeur_estimee, region=None, pays=None, secteur_label=None, a_des_donnees=True)
            )
            continue
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


def categorie_propre_a_la_ligne(v: ValuedHolding, type_: str) -> str:
    """Catégorie d'une ligne quand aucune composition interne n'est disponible pour
    elle (ce n'est pas un fonds, ou son look-through est introuvable).

    Cas particulier des fonds : le pays renvoyé par le fournisseur de données pour un
    ETF est son pays de DOMICILIATION (Irlande, Luxembourg pour la quasi-totalité des
    ETF européens), pas celui de ses actifs sous-jacents. Le retenir classerait un ETF
    S&P 500 en "Europe" — une erreur bien pire qu'une absence de donnée. Faute de
    composition ET de repli par l'indice suivi, un fonds reste donc explicitement non
    catégorisé géographiquement.
    """
    if type_ == "geo" and v.holding.type_actif == "FUND":
        return NON_CATEGORISE
    valeur = v.region if type_ == "geo" else v.secteur_label
    return valeur or NON_CATEGORISE


def breakdown_with_lookthrough(db: Session, valued: list[ValuedHolding], type_: str) -> dict[str, float]:
    """Répartition géo/secteur du portefeuille : les fonds/ETF sont éclatés sur
    plusieurs catégories selon leur composition interne (`FundComposition`) plutôt
    que laissés en bloc dans "Non catégorisé". `type_` vaut "geo" ou "sector"."""
    comp_by_ticker = _fund_composition_lookup(db, [v.holding.ticker for v in valued], type_)

    totals: dict[str, float] = {}
    for v in valued:
        rows = comp_by_ticker.get(v.holding.ticker)
        if rows:
            for row in rows:
                totals[row.categorie] = totals.get(row.categorie, 0.0) + v.valeur * row.poids
        else:
            categorie = categorie_propre_a_la_ligne(v, type_)
            totals[categorie] = totals.get(categorie, 0.0) + v.valeur
    return totals


def holdings_in_category(db: Session, valued: list[ValuedHolding], type_: str, categorie: str) -> list[dict]:
    """Détail des lignes qui composent une catégorie donnée (pour le camembert de
    composition) — même logique que `breakdown_with_lookthrough` mais sans sommer."""
    comp_by_ticker = _fund_composition_lookup(db, [v.holding.ticker for v in valued], type_)

    lignes = []
    for v in valued:
        rows = comp_by_ticker.get(v.holding.ticker)
        if rows:
            contribution = v.valeur * sum(row.poids for row in rows if row.categorie == categorie)
        else:
            contribution = v.valeur if categorie_propre_a_la_ligne(v, type_) == categorie else 0.0

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


def compute_data_quality(db: Session, valued: list[ValuedHolding]) -> dict:
    """Qualifie, en euros et en pourcentage de la valeur totale, l'origine de la
    répartition géographique affichée à l'écran (cf. 2.1/2.3) — le tableau de bord
    compare réel et cible, encore faut-il savoir à quel point le "réel" est mesuré
    plutôt qu'estimé. Trois catégories, non exclusives entre elles pour la dernière :

    - composition réelle : géographie connue avec certitude, soit parce que la
      ligne est un fonds dont Yahoo fournit `top_holdings` (`FundComposition.source
      == SOURCE_COMPOSITION`), soit parce que c'est une ligne individuelle (action...)
      dont le pays de cotation est connu ;
    - estimée par indice : fonds sans `top_holdings`, dont la géographie est déduite
      du nom de l'indice suivi (`FundComposition.source == SOURCE_INDICE`) ;
    - non catégorisée : aucune donnée géographique disponible, ni composition ni
      indice reconnu (finit dans "Non catégorisé" des graphiques) ;
    - sans cotation (2.3) : lignes valorisées à leur coût de revient faute de cours
      (`not a_des_donnees`) — indépendant des trois catégories précédentes, une ligne
      sans cotation peut très bien avoir, par ailleurs, une géographie connue.
    """
    comp_by_ticker = _fund_composition_lookup(db, [v.holding.ticker for v in valued], "geo")
    valeur_totale = sum(v.valeur for v in valued)

    valeur_composition_reelle = 0.0
    valeur_estimee_par_indice = 0.0
    valeur_non_categorisee = 0.0
    valeur_sans_cotation = 0.0

    for v in valued:
        rows = comp_by_ticker.get(v.holding.ticker)
        if rows:
            # Toutes les lignes géo d'un même ticker sont posées ensemble par un
            # seul appel à `fetch_fund_composition` : leur source est forcément
            # identique, on peut se fier à la première.
            if rows[0].source == SOURCE_INDICE:
                valeur_estimee_par_indice += v.valeur
            else:
                valeur_composition_reelle += v.valeur
        elif categorie_propre_a_la_ligne(v, "geo") != NON_CATEGORISE:
            valeur_composition_reelle += v.valeur
        else:
            valeur_non_categorisee += v.valeur

        if not v.a_des_donnees:
            valeur_sans_cotation += v.valeur

    def pct(valeur: float) -> float:
        return round(valeur / valeur_totale * 100, 1) if valeur_totale > 0 else 0.0

    return {
        "valeur_composition_reelle": round(valeur_composition_reelle, 2),
        "pct_composition_reelle": pct(valeur_composition_reelle),
        "valeur_estimee_par_indice": round(valeur_estimee_par_indice, 2),
        "pct_estimee_par_indice": pct(valeur_estimee_par_indice),
        "valeur_non_categorisee": round(valeur_non_categorisee, 2),
        "pct_non_categorisee": pct(valeur_non_categorisee),
        "valeur_sans_cotation": round(valeur_sans_cotation, 2),
        "pct_sans_cotation": pct(valeur_sans_cotation),
    }


def compute_cout_gestion_consolide(valued: list[ValuedHolding]) -> dict:
    """Coût de gestion annuel consolidé des fonds/ETF détenus (roadmap Phase 3, § E.3) —
    somme, pour chaque ligne `type_actif == "FUND"`, de sa valeur actuelle × son TER
    (`MarketDataCache.frais_gestion_pct`, mis en cache par
    `market_data_service.fetch_frais_gestion`). `couverture_pct` indique la part de la
    valeur des fonds pour laquelle un TER est effectivement connu — même logique de
    transparence que `compute_data_quality` ci-dessus : ne jamais présenter une
    estimation partielle comme un chiffre complet sans le dire."""
    valeur_fonds = 0.0
    valeur_fonds_avec_ter_connu = 0.0
    cout_annuel_estime = 0.0

    for v in valued:
        if v.holding.type_actif != "FUND":
            continue
        valeur_fonds += v.valeur
        md = v.holding.market_data
        ter = md.frais_gestion_pct if md else None
        if ter is not None:
            valeur_fonds_avec_ter_connu += v.valeur
            cout_annuel_estime += v.valeur * ter / 100

    couverture_pct = round(valeur_fonds_avec_ter_connu / valeur_fonds * 100, 1) if valeur_fonds > 0 else 0.0

    return {
        "valeur_fonds": round(valeur_fonds, 2),
        "valeur_fonds_avec_ter_connu": round(valeur_fonds_avec_ter_connu, 2),
        "couverture_pct": couverture_pct,
        "cout_annuel_estime": round(cout_annuel_estime, 2),
    }


def repartition_par_compte(valued: list[ValuedHolding]) -> list[dict]:
    """Répartition de la VALEUR ACTUELLE du portefeuille par compte (LOT 5.1).

    Le compte (`models.Holding.compte`) est une annotation manuelle par ligne : le
    grand livre de transactions importé (format Trade Republic) ne porte aucune
    information de compte, il est donc impossible d'en déduire une rentabilité
    (XIRR, gains réalisés) par compte a posteriori — seule une répartition de la
    valeur actuelle est calculable ici, jamais une performance. Les lignes sans
    compte renseigné sont regroupées sous `COMPTE_SANS_ANNOTATION` plutôt que
    d'être écartées du total (le portefeuille reste entièrement représenté)."""
    totaux: dict[str, float] = {}
    for v in valued:
        compte = v.holding.compte or COMPTE_SANS_ANNOTATION
        totaux[compte] = totaux.get(compte, 0.0) + v.valeur

    valeur_totale = sum(v.valeur for v in valued)
    items = [
        {
            "compte": compte,
            "valeur": round(valeur, 2),
            "pourcentage": round(valeur / valeur_totale * 100, 1) if valeur_totale > 0 else 0.0,
        }
        for compte, valeur in totaux.items()
    ]
    items.sort(key=lambda i: -i["valeur"])
    return items
