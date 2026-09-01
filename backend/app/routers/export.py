"""Export CSV du portefeuille (LOT 5.2), compatible Excel en locale française
(cf. `services/csv_export.py` pour le détail du format). Trois exports indépendants
plutôt qu'un fichier unique : chacun a une granularité et un usage propres — une
ligne par position, une ligne par écriture du grand livre, un indicateur par ligne
pour la synthèse de rentabilité — que mélanger dans un seul fichier obligerait à
aplatir artificiellement."""

from datetime import date as date_

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Detenteur, Holding, Transaction, User
from ..schemas import DeclarationPatrimoineRequest
from ..services import analysis_service, auth_service, declaration_patrimoine_service, pdf_export_service, performance_service
from ..services.csv_export import construire_csv, formater_horodatage, formater_nombre

router = APIRouter(prefix="/api/export", tags=["export"])


def _nom_fichier(base: str) -> str:
    """Nom de fichier daté (jour de l'export) : deux exports pris à des dates
    différentes ne s'écrasent pas dans le dossier de téléchargement du navigateur."""
    return f"{base}-{date_.today().isoformat()}.csv"


def _reponse_csv(contenu: str, nom_fichier: str) -> Response:
    return Response(
        content=contenu.encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{nom_fichier}"'},
    )


def _formater_date_fr(date_iso: str | None) -> str:
    """`Transaction.date`/`premiere_transaction` sont stockées en 'AAAA-MM-JJ' :
    reformatées en 'JJ/MM/AAAA', seul format qu'Excel FR et un utilisateur français
    lisent sans ambiguïté."""
    if not date_iso:
        return ""
    annee, mois, jour = date_iso.split("-")
    return f"{jour}/{mois}/{annee}"


@router.get("/positions")
def export_positions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    holdings = db.query(Holding).filter(Holding.user_id == auth_service.id_foyer(current_user)).order_by(Holding.ticker).all()
    valeur_par_ticker = {v.holding.ticker: v.valeur for v in analysis_service.value_holdings(holdings)}
    rendements = performance_service.compute_holding_returns(db, auth_service.id_foyer(current_user))

    en_tetes = [
        "Ticker",
        "Nom",
        "Type d'actif",
        "Compte",
        "Origine",
        "Quantité",
        "Prix de revient",
        "Prix actuel",
        "Valeur",
        "Rendement depuis achat (%)",
        "Rendement annualisé (%)",
        "Secteur",
        "Pays",
        "Dernière mise à jour du cours",
    ]
    lignes = []
    for h in holdings:
        md = h.market_data
        rendement = rendements.get(h.ticker, {})
        lignes.append(
            [
                h.ticker,
                h.nom or "",
                h.type_actif or "",
                h.compte or "",
                h.origine,
                formater_nombre(h.quantite),
                formater_nombre(h.prix_revient_moyen),
                formater_nombre(md.prix_actuel if md else None),
                formater_nombre(valeur_par_ticker.get(h.ticker)),
                formater_nombre(rendement.get("rendement_depuis_achat_pct")),
                formater_nombre(rendement.get("rendement_annualise_pct")),
                (md.secteur if md else None) or "",
                (md.pays if md else None) or "",
                formater_horodatage(md.derniere_maj if md else None),
            ]
        )
    return _reponse_csv(construire_csv(en_tetes, lignes), _nom_fichier("positions"))


@router.get("/transactions")
def export_transactions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == auth_service.id_foyer(current_user))
        .order_by(Transaction.datetime_utc.asc())
        .all()
    )

    en_tetes = [
        "Date",
        "Catégorie",
        "Type",
        "Classe d'actif",
        "Symbole",
        "Nom",
        "Quantité",
        "Prix",
        "Montant",
        "Frais",
        "Taxe",
        "Description",
    ]
    lignes = [
        [
            _formater_date_fr(tx.date),
            tx.category,
            tx.type,
            tx.asset_class or "",
            tx.symbol or "",
            tx.name or "",
            formater_nombre(tx.shares),
            formater_nombre(tx.price),
            formater_nombre(tx.amount),
            formater_nombre(tx.fee),
            formater_nombre(tx.tax),
            tx.description or "",
        ]
        for tx in transactions
    ]
    return _reponse_csv(construire_csv(en_tetes, lignes), _nom_fichier("transactions"))


# Libellés (ordre d'affichage) des indicateurs de `performance_service.compute_performance`,
# et la façon de mettre en forme chacun : la plupart sont des montants/pourcentages
# (`formater_nombre`), à l'exception du nombre de transactions (entier brut) et de la
# date de première transaction (déjà une chaîne 'AAAA-MM-JJ', reformatée en 'JJ/MM/AAAA').
_LIBELLES_PERFORMANCE = [
    ("valeur_positions", "Valeur des positions"),
    ("valeur_totale", "Valeur totale"),
    ("cout_total_investi", "Coût total investi"),
    ("gain_perte_total", "Gain / perte total"),
    ("rendement_simple_pct", "Rendement simple (%)"),
    ("rendement_annualise_pct", "Rendement annualisé (%)"),
    ("dividendes_percus", "Dividendes perçus"),
    ("interets_percus", "Intérêts perçus"),
    ("autres_revenus", "Autres revenus"),
    ("frais_payes", "Frais payés"),
    ("impots_preleves", "Impôts prélevés"),
    ("gains_realises", "Gains réalisés"),
    ("gains_latents", "Gains latents"),
    ("nombre_transactions", "Nombre de transactions"),
    ("premiere_transaction", "Date de la première transaction"),
]


@router.get("/performance")
def export_performance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    performance = performance_service.compute_performance(db, auth_service.id_foyer(current_user))

    lignes = []
    for cle, libelle in _LIBELLES_PERFORMANCE:
        valeur = performance[cle]
        if cle == "nombre_transactions":
            texte = str(valeur)
        elif cle == "premiere_transaction":
            texte = _formater_date_fr(valeur)
        else:
            texte = formater_nombre(valeur)
        lignes.append([libelle, texte])

    return _reponse_csv(construire_csv(["Libellé", "Valeur"], lignes), _nom_fichier("performance"))


@router.get("/patrimoine.pdf")
def export_patrimoine_pdf(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Relevé de patrimoine PDF (roadmap Phase 3, § D.1) — au-delà des trois CSV
    ci-dessus, une photographie mise en forme du patrimoine net, de sa répartition
    et de la rentabilité globale, cf. `services/pdf_export_service.py`."""
    contenu = pdf_export_service.generer_pdf_patrimoine(db, auth_service.id_foyer(current_user))
    nom_fichier = f"patrimoine-{date_.today().isoformat()}.pdf"
    return Response(content=contenu, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{nom_fichier}"'})


@router.post("/declaration-patrimoine.pdf")
def export_declaration_patrimoine_pdf(
    payload: DeclarationPatrimoineRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Déclaration de patrimoine PDF paramétrable (backlog 2.Q.2) — sélection actif
    par actif, filtrage par détenteur, reprise du profil pour un tiers concret
    (banque, notaire). `POST` (pas `GET`) : la sélection peut porter sur un grand
    nombre d'identifiants, mal adapté à une chaîne de requête."""
    user_id = auth_service.id_foyer(current_user)
    if payload.detenteur_id is not None:
        detenteur = db.get(Detenteur, payload.detenteur_id)
        if detenteur is None or detenteur.user_id != user_id:
            raise HTTPException(status_code=404, detail="Détenteur introuvable")

    contenu = declaration_patrimoine_service.generer_pdf_declaration(
        db,
        user_id,
        holding_ids=payload.holding_ids,
        loan_ids=payload.loan_ids,
        detenteur_id=payload.detenteur_id,
        destinataire=payload.destinataire,
        inclure_profil=payload.inclure_profil,
    )
    nom_fichier = f"declaration-patrimoine-{date_.today().isoformat()}.pdf"
    return Response(content=contenu, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{nom_fichier}"'})
