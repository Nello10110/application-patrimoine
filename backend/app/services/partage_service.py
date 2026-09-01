"""Lien de partage révocable en lecture seule (backlog 2.Q.1) — premier point
d'accès PUBLIC de l'application (aucune authentification). Réutilise les mêmes
briques que l'authentification (`auth_service`) pour le code optionnel (hachage
`pbkdf2_sha256`) et le verrouillage temporaire après échecs répétés, mais avec ses
propres tables (`LienPartage`, `PartageAcces`) : un lien public n'a ni compte ni
identifiant utilisateur à verrouiller, seulement un jeton.

Surface volontairement restreinte à des sections AGRÉGÉES (patrimoine net,
exposition consolidée, rentabilité, budget, objectifs) — jamais le détail position
par position, les transactions, ni les libellés de compte. `masquer_valeurs`
convertit chaque montant en pourcentage plutôt que de l'omettre silencieusement :
la forme de la répartition reste visible, jamais son échelle."""

import secrets
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from ..models import LienPartage, PartageAcces
from . import auth_service, budget_service, objectifs_service, patrimoine_service, performance_service

SEUIL_TENTATIVES = 5
FENETRE_VERROUILLAGE_MINUTES = 15
DUREE_VERROUILLAGE_MINUTES = 15
DUREE_MAX_JOURS = 365


def _maintenant_naif() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def creer_lien(
    db: Session,
    user_id: int,
    *,
    nom: str,
    detenteur_id: int | None,
    duree_jours: int,
    inclure_patrimoine_net: bool,
    inclure_repartition: bool,
    inclure_performance: bool,
    inclure_budget: bool,
    inclure_objectifs: bool,
    masquer_valeurs: bool,
    code: str | None,
) -> LienPartage:
    lien = LienPartage(
        token=secrets.token_hex(32),
        user_id=user_id,
        nom=nom.strip(),
        detenteur_id=detenteur_id,
        inclure_patrimoine_net=inclure_patrimoine_net,
        inclure_repartition=inclure_repartition,
        inclure_performance=inclure_performance,
        inclure_budget=inclure_budget,
        inclure_objectifs=inclure_objectifs,
        masquer_valeurs=masquer_valeurs,
        code_hash=auth_service.hash_password(code) if code else None,
        expires_at=_maintenant_naif() + timedelta(days=duree_jours),
    )
    db.add(lien)
    db.commit()
    db.refresh(lien)
    return lien


def lister_liens(db: Session, user_id: int) -> list[LienPartage]:
    return db.query(LienPartage).filter(LienPartage.user_id == user_id).order_by(LienPartage.created_at.desc()).all()


def lien_du_foyer(db: Session, user_id: int, lien_id: int) -> LienPartage | None:
    return db.query(LienPartage).filter(LienPartage.id == lien_id, LienPartage.user_id == user_id).first()


def revoquer_lien(db: Session, lien: LienPartage) -> None:
    lien.revoked_at = _maintenant_naif()
    db.commit()


def lien_valide_par_token(db: Session, token: str) -> LienPartage | None:
    """`None` si le jeton est absent, révoqué, ou expiré — la route publique répond
    404 de façon identique dans les trois cas, pour ne jamais laisser deviner lequel
    des trois s'applique."""
    lien = db.query(LienPartage).filter(LienPartage.token == token).first()
    if lien is None or lien.revoked_at is not None:
        return None
    if lien.expires_at < _maintenant_naif():
        return None
    return lien


def verrouillage_actif(db: Session, lien_id: int) -> datetime | None:
    """Même mécanique que `auth_service.verrouillage_actif`, scopée par lien plutôt
    que par compte : 5 échecs de code en 15 minutes glissantes verrouillent la
    consultation de CE lien pendant 15 minutes."""
    maintenant = _maintenant_naif()
    depuis = maintenant - timedelta(minutes=FENETRE_VERROUILLAGE_MINUTES)
    echecs = (
        db.query(PartageAcces)
        .filter(
            PartageAcces.lien_id == lien_id,
            PartageAcces.resultat == "code_incorrect",
            PartageAcces.timestamp >= depuis,
        )
        .order_by(PartageAcces.timestamp.asc())
        .all()
    )
    if len(echecs) < SEUIL_TENTATIVES:
        return None
    declencheur = echecs[SEUIL_TENTATIVES - 1].timestamp
    fin_verrouillage = declencheur + timedelta(minutes=DUREE_VERROUILLAGE_MINUTES)
    return fin_verrouillage if fin_verrouillage > maintenant else None


def journaliser_acces(db: Session, lien_id: int, ip: str | None, resultat: str) -> None:
    db.add(PartageAcces(lien_id=lien_id, ip=ip, resultat=resultat))
    db.commit()


def verifier_code(lien: LienPartage, code: str | None) -> bool:
    if lien.code_hash is None:
        return True
    if not code:
        return False
    return auth_service.verify_password(code, lien.code_hash)


def _repartition_masquee(items: list[dict], total: float, masquer: bool) -> list[dict]:
    return [
        {
            "categorie": item["categorie"],
            "valeur": None if masquer else item["valeur"],
            "pourcentage": round(item["valeur"] / total * 100, 1) if total > 0 else 0.0,
        }
        for item in items
    ]


def compute_payload(db: Session, lien: LienPartage) -> dict:
    """Construit la vue publique du lien : n'appelle que les fonctions de calcul déjà
    utilisées par les écrans authentifiés (aucune duplication de logique métier),
    puis convertit leur sortie vers une forme dédiée au partage (jamais les schémas
    internes tels quels, pour ne jamais exposer un champ ajouté plus tard par
    inadvertance à un lien public)."""
    m = lien.masquer_valeurs
    payload: dict = {"nom_lien": lien.nom, "masque": m, "detenteur_id": lien.detenteur_id}

    if lien.inclure_patrimoine_net:
        net = patrimoine_service.compute_patrimoine_net(db, lien.user_id, lien.detenteur_id)
        payload["patrimoine_net"] = {
            "patrimoine_net": None if m else net["patrimoine_net"],
            "actifs_totaux": None if m else net["actifs_totaux"],
            "passifs_totaux": None if m else net["passifs_totaux"],
            "repartition_par_classe": _repartition_masquee(net["repartition_par_classe"], net["actifs_totaux"], m),
        }
    else:
        payload["patrimoine_net"] = None

    if lien.inclure_repartition:
        expo = patrimoine_service.compute_exposition_consolidee(db, lien.user_id)
        payload["exposition"] = {
            "valeur_totale": None if m else expo["valeur_totale"],
            "repartition_geo": _repartition_masquee(expo["repartition_geo"], expo["valeur_totale"], m),
            "repartition_classe": _repartition_masquee(expo["repartition_classe"], expo["valeur_totale"], m),
            # `plus_grosse_ligne_ticker` (interne) n'est JAMAIS repris ici, même sans
            # masquage : la charge publique reste strictement agrégée, jamais le nom
            # d'une position individuelle (cf. docstring de `LienPartage`).
            "plus_grosse_ligne_pct": expo["plus_grosse_ligne_pct"],
            "top5_lignes_pct": expo["top5_lignes_pct"],
            "premiere_zone_geo": expo["premiere_zone_geo"],
            "premiere_zone_geo_pct": expo["premiere_zone_geo_pct"],
        }
    else:
        payload["exposition"] = None

    if lien.inclure_performance:
        perf = performance_service.compute_performance(db, lien.user_id)
        payload["performance"] = {
            "valeur_totale": None if m else perf["valeur_totale"],
            "cout_total_investi": None if m else perf["cout_total_investi"],
            "gain_perte_total": None if m else perf["gain_perte_total"],
            "rendement_simple_pct": perf["rendement_simple_pct"],
            "rendement_annualise_pct": perf["rendement_annualise_pct"],
            "dividendes_percus": None if m else perf["dividendes_percus"],
            "frais_payes": None if m else perf["frais_payes"],
        }
    else:
        payload["performance"] = None

    if lien.inclure_budget:
        aujourdhui = date.today()
        date_debut = aujourdhui.replace(day=1).isoformat()
        date_fin = aujourdhui.isoformat()
        resume = budget_service.compute_summary(db, lien.user_id, date_debut, date_fin)
        total_sorties = resume["sorties"]
        payload["budget"] = {
            "periode_debut": date_debut,
            "periode_fin": date_fin,
            "entrees": None if m else resume["entrees"],
            "sorties": None if m else resume["sorties"],
            "disponible": None if m else resume["disponible"],
            "repartition_sorties": [
                {
                    "categorie": item["categorie_nom"],
                    "valeur": None if m else item["montant"],
                    "pourcentage": round(item["montant"] / total_sorties * 100, 1) if total_sorties > 0 else 0.0,
                }
                for item in resume["repartition_sorties"]
            ],
        }
    else:
        payload["budget"] = None

    if lien.inclure_objectifs:
        details = objectifs_service.list_objectifs_detail(db, lien.user_id)
        payload["objectifs"] = [
            {
                "nom": o["nom"],
                "type": o["type"],
                "echeance": o["echeance"],
                "progression_pct": o["progression_pct"],
                "diagnostic": o["diagnostic"],
                "retard_mois": o["retard_mois"],
            }
            for o in details
        ]
    else:
        payload["objectifs"] = None

    return payload
