"""Export et import de toutes les données du foyer (backlog X.6) — sauvegarde
portable, migration d'instance, remise à plat avant manipulation.

Distinct de `routers/export.py` (extraits CSV/PDF thématiques, à lire dans Excel,
non ré-importables) : ici un JSON complet et ré-importable, cf.
`services/donnees_service.py` pour le périmètre exact et la doctrine.

Rôle : `_proprietaire_seul` dans `main.py` — exporter, c'est emporter tout le
patrimoine du foyer dans un fichier ; importer, c'est l'effacer et le remplacer.
Ni l'un ni l'autre n'a de sens pour un membre, encore moins pour un invité.
"""

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import EffacerFoyerRequest
from ..services import auth_service, donnees_service, historique_cache, preferences_service

router = APIRouter(prefix="/api/donnees", tags=["donnees"])

# Un export complet reste petit (quelques Mo pour un très gros foyer : ce sont des
# lignes de patrimoine, pas des pièces jointes). Ce plafond écarte surtout l'envoi
# accidentel d'un fichier sans rapport, avant même de tenter de le désérialiser.
TAILLE_MAX_IMPORT = 50 * 1024 * 1024

# Phrase à taper pour confirmer une remise à zéro complète du foyer, quand aucun nom
# de foyer n'a été renseigné (cf. `effacer` ci-dessous) — sinon, le nom du foyer lui-même.
PHRASE_CONFIRMATION_PAR_DEFAUT = "SUPPRIMER"


@router.get("/export")
def exporter(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Télécharge l'intégralité des données du foyer dans un fichier JSON."""
    document = donnees_service.exporter_foyer(db, auth_service.id_foyer(current_user))
    contenu = json.dumps(document, ensure_ascii=False, indent=2)
    nom_fichier = f"patrimoine-export-{date.today().isoformat()}.json"
    return Response(
        content=contenu.encode("utf-8"),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{nom_fichier}"'},
    )


@router.post("/import/apercu")
async def apercu_import(file: UploadFile, current_user: User = Depends(get_current_user)):
    """Valide le fichier et renvoie son décompte par table, SANS rien modifier —
    permet à l'écran de confirmation d'annoncer ce qui va être importé (et donc ce
    qui va remplacer l'existant) avant que l'utilisateur ne s'engage."""
    document = await _lire_document(file)
    try:
        donnees_service.valider(document)
    except donnees_service.FichierExportInvalideError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "exporte_le": document.get("exporte_le"),
        "contenu": donnees_service.resume(document),
    }


@router.post("/import")
async def importer(
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remplace INTÉGRALEMENT le patrimoine du foyer par le contenu du fichier.

    Opération destructrice et sans annulation possible : l'interface demande une
    confirmation explicite (cf. `ImportDonneesCard.tsx`), après avoir affiché
    l'aperçu ci-dessus.
    """
    document = await _lire_document(file)
    user_id = auth_service.id_foyer(current_user)
    try:
        contenu = donnees_service.importer_foyer(db, user_id, document)
    except donnees_service.FichierExportInvalideError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - remonté en 400 avec le motif réel
        raise HTTPException(status_code=400, detail=f"Import impossible : {exc}") from exc
    # Les historiques mis en cache décrivent un patrimoine qui n'existe plus.
    historique_cache.invalider_historiques_patrimoine(db)
    return {"ok": True, "contenu": contenu}


@router.post("/effacer")
def effacer(
    payload: EffacerFoyerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remise à zéro COMPLÈTE et destructrice du foyer (revue du 05/09/2026, demande
    directe de l'utilisateur) : efface tout le patrimoine (comme un import qui
    n'importerait rien derrière, cf. `donnees_service.reinitialiser_foyer`) — jamais
    les comptes utilisateurs du foyer (propriétaire/membres/invités), qui restent
    connectables et vides ensuite.

    Confirmation exigée dans le corps de la requête (`confirmation`), vérifiée ici
    plutôt que de faire confiance à la seule confirmation côté IHM (`Modale.tsx`) :
    le nom du foyer s'il est renseigné, sinon le mot `PHRASE_CONFIRMATION_PAR_DEFAUT`
    — même principe que la confirmation par nom avant suppression d'un dépôt GitHub.
    """
    user_id = auth_service.id_foyer(current_user)
    attendu = preferences_service.lire_nom_foyer(db, user_id) or PHRASE_CONFIRMATION_PAR_DEFAUT
    if payload.confirmation.strip() != attendu:
        raise HTTPException(status_code=400, detail=f"Confirmation incorrecte. Tapez exactement « {attendu} » pour confirmer.")

    ids_comptes_foyer = [
        ligne.id for ligne in db.query(User.id).filter((User.id == user_id) | (User.owner_user_id == user_id)).all()
    ]
    donnees_service.reinitialiser_foyer(db, user_id, ids_comptes_foyer)
    # Les historiques mis en cache décrivent un patrimoine qui n'existe plus.
    historique_cache.invalider_historiques_patrimoine(db)
    return {"ok": True}


async def _lire_document(file: UploadFile) -> dict:
    contenu = await file.read()
    if len(contenu) > TAILLE_MAX_IMPORT:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux pour être un export de patrimoine.")
    if not contenu.strip():
        raise HTTPException(status_code=400, detail="Le fichier est vide.")
    try:
        return json.loads(contenu.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Le fichier n'est pas un JSON lisible.") from exc
