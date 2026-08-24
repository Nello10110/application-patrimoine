"""Inscription/connexion/sessions/journal d'accès/gestion du foyer (Milestone 1 +
backlog 2.L.2). `register`/`login` sont les deux seules routes de toute l'API à
rester accessibles sans jeton — cf. `main.py`, qui protège tous les autres
routeurs via `dependencies=[Depends(get_current_user)]`."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..auth import get_current_token, get_current_user, require_role
from ..database import get_db
from ..models import ROLE_PROPRIETAIRE, AuthToken, Detenteur, PerimetreInvite, User
from ..schemas import AccessLogEntryOut, AuthResponse, HouseholdMemberCreate, HouseholdMemberOut, LoginRequest, OidcStatus, RegisterRequest, SessionOut, UserOut
from ..services import auth_service, oidc_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

MESSAGE_NOM_UTILISATEUR_DEJA_UTILISE = "Ce nom d'utilisateur est déjà pris."
MESSAGE_IDENTIFIANTS_INVALIDES = "Nom d'utilisateur ou mot de passe incorrect."
MESSAGE_INSCRIPTION_FERMEE = "L'inscription ouverte est fermée. Demandez à votre propriétaire de foyer de créer votre compte."
MESSAGE_COMPTE_SSO_SEUL = "Ce compte se connecte uniquement via Authentik."


def _adresse_client(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Ouverte UNIQUEMENT pour créer le tout premier compte (bootstrap du
    propriétaire, backlog 2.L.2) — au-delà, les comptes du foyer (membre/invité) se
    créent exclusivement via `POST /household-members`, réservé au propriétaire :
    un rôle ne doit jamais être auto-attribué par la personne qui s'inscrit."""
    if db.query(User).count() > 0:
        raise HTTPException(status_code=403, detail=MESSAGE_INSCRIPTION_FERMEE)
    if auth_service.utilisateur_par_username(db, payload.username) is not None:
        raise HTTPException(status_code=400, detail=MESSAGE_NOM_UTILISATEUR_DEJA_UTILISE)
    user = auth_service.creer_utilisateur(db, payload.username, payload.password)
    token = auth_service.creer_token(db, user)
    return AuthResponse(token=token.token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _adresse_client(request)
    verrouille_jusqua = auth_service.verrouillage_actif(db, payload.username)
    if verrouille_jusqua is not None:
        auth_service.journaliser_acces(db, payload.username, None, ip, "echec", "compte_verrouille")
        raise HTTPException(
            status_code=429,
            detail=f"Trop de tentatives. Réessayez après {verrouille_jusqua.strftime('%H:%M UTC')}.",
        )
    user = auth_service.utilisateur_par_username(db, payload.username)
    if user is None:
        auth_service.journaliser_acces(db, payload.username, None, ip, "echec", "compte_inconnu")
        raise HTTPException(status_code=401, detail=MESSAGE_IDENTIFIANTS_INVALIDES)
    if user.password_hash is None:
        auth_service.journaliser_acces(db, payload.username, user.id, ip, "echec", "compte_sso_seul")
        raise HTTPException(status_code=401, detail=MESSAGE_COMPTE_SSO_SEUL)
    if not auth_service.verify_password(payload.password, user.password_hash):
        auth_service.journaliser_acces(db, payload.username, user.id, ip, "echec", "mot_de_passe_incorrect")
        raise HTTPException(status_code=401, detail=MESSAGE_IDENTIFIANTS_INVALIDES)
    token = auth_service.creer_token(db, user, ip=ip, user_agent=request.headers.get("User-Agent"))
    auth_service.journaliser_acces(db, payload.username, user.id, ip, "succes", None)
    return AuthResponse(token=token.token, user=UserOut.model_validate(user))


# --- Connexion SSO Authentik (OIDC applicatif) -----------------------------------
#
# Toutes publiques, comme /register et /login ci-dessus. Ce flux ne fait JAMAIS
# confiance à un en-tête de proxy — toute la logique de sécurité vit dans
# `services/oidc_service.py` (docstring de module à lire avant toute modification
# ici). Ces trois routes ne sont que la tuyauterie HTTP autour de ce service.


@router.get("/oidc/status", response_model=OidcStatus)
def oidc_status():
    return OidcStatus(enabled=oidc_service.enabled())


@router.get("/oidc/login")
def oidc_login():
    if not oidc_service.enabled():
        raise HTTPException(status_code=404, detail="Connexion Authentik non configurée sur ce déploiement.")
    code_verifier, code_challenge = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(code_verifier)
    return RedirectResponse(oidc_service.url_autorisation(state, code_challenge))


@router.get("/oidc/callback")
def oidc_callback(request: Request, db: Session = Depends(get_db)):
    if not oidc_service.enabled():
        raise HTTPException(status_code=404, detail="Connexion Authentik non configurée sur ce déploiement.")

    def _redirection_erreur(message: str) -> RedirectResponse:
        from urllib.parse import quote

        return RedirectResponse(f"{oidc_service.frontend_url()}/?oidc_error={quote(message)}")

    erreur_authentik = request.query_params.get("error")
    if erreur_authentik:
        return _redirection_erreur(f"Connexion Authentik refusée ({erreur_authentik}).")

    code = request.query_params.get("code")
    state_recu = request.query_params.get("state")
    if not code or not state_recu:
        return _redirection_erreur("Réponse Authentik incomplète. Réessayez.")

    ip = _adresse_client(request)
    try:
        code_verifier = oidc_service.verifier_state(state_recu)
        jeton_authentik = oidc_service.echanger_code(code, code_verifier)
        claims = oidc_service.recuperer_identite(jeton_authentik["access_token"])
        user = oidc_service.resoudre_ou_provisionner_utilisateur(db, claims)
    except oidc_service.OidcError as err:
        auth_service.journaliser_acces(db, "?", None, ip, "echec", "oidc_echec")
        return _redirection_erreur(str(err))

    verrouille_jusqua = auth_service.verrouillage_actif(db, user.username)
    if verrouille_jusqua is not None:
        auth_service.journaliser_acces(db, user.username, user.id, ip, "echec", "compte_verrouille")
        return _redirection_erreur(f"Trop de tentatives. Réessayez après {verrouille_jusqua.strftime('%H:%M UTC')}.")

    token = auth_service.creer_token(db, user, ip=ip, user_agent=request.headers.get("User-Agent"))
    auth_service.journaliser_acces(db, user.username, user.id, ip, "succes", "oidc")
    return RedirectResponse(f"{oidc_service.frontend_url()}/#token={token.token}")


@router.post("/logout", status_code=204)
def logout(db: Session = Depends(get_db), current_user: User = Depends(get_current_user), token_row: AuthToken = Depends(get_current_token)):
    auth_service.journaliser_acces(db, current_user.username, current_user.id, token_row.ip, "succes", None, action="logout")
    auth_service.supprimer_token(db, token_row.token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user), token_row: AuthToken = Depends(get_current_token)):
    sessions = auth_service.lister_sessions(db, current_user.id)
    resultats = []
    for session in sessions:
        sortie = SessionOut.model_validate(session)
        sortie.est_courante = session.token == token_row.token
        resultats.append(sortie)
    return resultats


@router.delete("/sessions/{id_session}", status_code=204)
def revoke_session(id_session: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = auth_service.session_par_id(db, id_session)
    if session is None or session.user_id != current_user.id:
        # 404, pas 403 : ne pas confirmer l'existence de la session d'un autre
        # utilisateur (même pattern IDOR que le reste de l'application).
        raise HTTPException(status_code=404, detail="Session introuvable")
    auth_service.revoquer_session(db, session)


@router.get("/access-log", response_model=list[AccessLogEntryOut])
def get_access_log(page: int = 1, page_size: int = 50, db: Session = Depends(get_db), current_user: User = Depends(require_role(ROLE_PROPRIETAIRE))):
    entrees = auth_service.lister_journal_acces(db, page, max(1, min(page_size, 200)))
    return [AccessLogEntryOut.model_validate(e) for e in entrees]


@router.post("/household-members", response_model=HouseholdMemberOut)
def create_household_member(payload: HouseholdMemberCreate, db: Session = Depends(get_db), current_user: User = Depends(require_role(ROLE_PROPRIETAIRE))):
    if auth_service.utilisateur_par_username(db, payload.username) is not None:
        raise HTTPException(status_code=400, detail=MESSAGE_NOM_UTILISATEUR_DEJA_UTILISE)
    membre = auth_service.creer_utilisateur(db, payload.username, payload.password, role=payload.role, owner_user_id=current_user.id)
    detenteur_ids = []
    if payload.detenteur_ids:
        detenteurs_valides = (
            db.query(Detenteur).filter(Detenteur.id.in_(payload.detenteur_ids), Detenteur.user_id == current_user.id).all()
        )
        for detenteur in detenteurs_valides:
            db.add(PerimetreInvite(user_id=membre.id, detenteur_id=detenteur.id))
            detenteur_ids.append(detenteur.id)
        db.commit()
    sortie = HouseholdMemberOut.model_validate(membre)
    sortie.detenteur_ids = detenteur_ids
    return sortie


@router.get("/household-members", response_model=list[HouseholdMemberOut])
def list_household_members(db: Session = Depends(get_db), current_user: User = Depends(require_role(ROLE_PROPRIETAIRE))):
    membres = db.query(User).filter(User.owner_user_id == current_user.id).order_by(User.created_at).all()
    resultats = []
    for membre in membres:
        sortie = HouseholdMemberOut.model_validate(membre)
        sortie.detenteur_ids = [p.detenteur_id for p in db.query(PerimetreInvite).filter(PerimetreInvite.user_id == membre.id).all()]
        resultats.append(sortie)
    return resultats


@router.delete("/household-members/{id}", status_code=204)
def delete_household_member(id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(ROLE_PROPRIETAIRE))):
    membre = db.get(User, id)
    if membre is None or membre.owner_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    db.query(PerimetreInvite).filter(PerimetreInvite.user_id == membre.id).delete()
    db.query(AuthToken).filter(AuthToken.user_id == membre.id).delete()
    db.delete(membre)
    db.commit()
