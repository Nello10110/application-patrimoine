"""Inscription/connexion/sessions/journal d'accès/gestion du foyer (Milestone 1 +
backlog 2.L.2). `register`/`login` sont les deux seules routes de toute l'API à
rester accessibles sans jeton — cf. `main.py`, qui protège tous les autres
routeurs via `dependencies=[Depends(get_current_user)]`."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..auth import get_current_token, get_current_user, require_role
from ..database import get_db
from ..models import ROLE_PROPRIETAIRE, AccessLogEntry, AuthToken, Detenteur, PerimetreInvite, User
from ..schemas import (
    AccessLogEntryOut,
    AuthResponse,
    HouseholdMemberCreate,
    HouseholdMemberOut,
    HouseholdMemberRoleUpdate,
    LoginRequest,
    OidcStatus,
    RegisterRequest,
    SessionOut,
    UserOut,
)
from ..services import auth_service, comptes_service, oidc_service, preferences_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

MESSAGE_NOM_UTILISATEUR_DEJA_UTILISE = "Ce nom d'utilisateur est déjà pris."
MESSAGE_IDENTIFIANTS_INVALIDES = "Nom d'utilisateur ou mot de passe incorrect."
MESSAGE_INSCRIPTION_FERMEE = "L'inscription ouverte est fermée. Demandez à votre propriétaire de foyer de créer votre compte."
MESSAGE_COMPTE_SSO_SEUL = "Ce compte se connecte uniquement via SSO."


def _adresse_client(request: Request) -> str | None:
    return request.client.host if request.client else None


def _user_out(db: Session, user: User) -> UserOut:
    """`UserOut.model_validate` seul ne remplit jamais `onboarding_termine` (pas une
    colonne de `User`, cf. schémas) — ce helper centralise le calcul depuis
    `preferences_service` pour les trois routes qui renvoient un utilisateur complet
    (`register`/`login`/`me`), afin que le frontend connaisse l'état de l'assistant
    de configuration initiale dès la connexion, sans appel supplémentaire."""
    sortie = UserOut.model_validate(user)
    sortie.onboarding_termine = preferences_service.onboarding_termine(db, user.id)
    # `id_foyer`, pas `user.id` : les lignes financières appartiennent au foyer
    # (`Holding.user_id == id_foyer`), pas à chaque membre individuellement — un
    # membre voit donc le même compteur que le propriétaire (même écran de
    # rattrapage, cf. `comptes_service.compter_holdings_sans_compte`).
    sortie.holdings_sans_compte = comptes_service.compter_holdings_sans_compte(db, auth_service.id_foyer(user))
    return sortie


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
    return AuthResponse(token=token.token, user=_user_out(db, user))


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
    return AuthResponse(token=token.token, user=_user_out(db, user))


# --- Connexion SSO (OIDC applicatif) ----------------------------------------------
#
# status/login/callback sont publiques, comme /register et /login ci-dessus. Ce flux
# ne fait JAMAIS confiance à un en-tête de proxy — toute la logique de sécurité vit
# dans `services/oidc_service.py` (docstring de module à lire avant toute
# modification ici). Ces routes ne sont que la tuyauterie HTTP autour de ce service.
# La configuration elle-même (issuer/client id/redirect uri/frontend url/secret/
# activation/mapping des claims) est entièrement portée par des variables
# d'environnement (`PATRIMOINE_OIDC_*`) — aucune administration à chaud possible,
# un redémarrage du backend est nécessaire pour toute modification.


@router.get("/oidc/status", response_model=OidcStatus)
def oidc_status():
    config = oidc_service.charger_config()
    if config is None:
        return OidcStatus(enabled=False)
    return OidcStatus(enabled=True, display_name=config.display_name)


@router.get("/oidc/login")
def oidc_login():
    config = oidc_service.charger_config()
    if config is None:
        raise HTTPException(status_code=404, detail="Connexion SSO non configurée sur ce déploiement.")
    code_verifier, code_challenge = oidc_service.code_verifier_et_challenge()
    state = oidc_service.construire_state(code_verifier, config.client_secret)
    return RedirectResponse(oidc_service.url_autorisation(config, state, code_challenge))


@router.get("/oidc/callback")
def oidc_callback(request: Request, db: Session = Depends(get_db)):
    config = oidc_service.charger_config()
    if config is None:
        raise HTTPException(status_code=404, detail="Connexion SSO non configurée sur ce déploiement.")

    def _redirection_erreur(message: str) -> RedirectResponse:
        from urllib.parse import quote

        return RedirectResponse(f"{config.frontend_url}/?oidc_error={quote(message)}")

    erreur_fournisseur = request.query_params.get("error")
    if erreur_fournisseur:
        return _redirection_erreur(f"Connexion SSO refusée ({erreur_fournisseur}).")

    code = request.query_params.get("code")
    state_recu = request.query_params.get("state")
    if not code or not state_recu:
        return _redirection_erreur("Réponse du fournisseur SSO incomplète. Réessayez.")

    ip = _adresse_client(request)
    try:
        code_verifier = oidc_service.verifier_state(state_recu, config.client_secret)
        jeton_fournisseur = oidc_service.echanger_code(config, code, code_verifier)
        claims = oidc_service.recuperer_identite(config, jeton_fournisseur["access_token"])
        user = oidc_service.resoudre_ou_provisionner_utilisateur(db, config, claims)
    except oidc_service.OidcError as err:
        auth_service.journaliser_acces(db, "?", None, ip, "echec", "oidc_echec")
        return _redirection_erreur(str(err))

    verrouille_jusqua = auth_service.verrouillage_actif(db, user.username)
    if verrouille_jusqua is not None:
        auth_service.journaliser_acces(db, user.username, user.id, ip, "echec", "compte_verrouille")
        return _redirection_erreur(f"Trop de tentatives. Réessayez après {verrouille_jusqua.strftime('%H:%M UTC')}.")

    token = auth_service.creer_token(db, user, ip=ip, user_agent=request.headers.get("User-Agent"))
    auth_service.journaliser_acces(db, user.username, user.id, ip, "succes", "oidc")
    return RedirectResponse(f"{config.frontend_url}/#token={token.token}")


@router.post("/logout", status_code=204)
def logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_row: AuthToken = Depends(get_current_token),
):
    auth_service.journaliser_acces(db, current_user.username, current_user.id, token_row.ip, "succes", None, action="logout")
    auth_service.supprimer_token(db, token_row.token)


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _user_out(db, current_user)


@router.post("/onboarding/terminer", response_model=UserOut)
def terminer_onboarding(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Marque l'assistant de configuration initiale (welcome board) comme terminé ou
    explicitement passé pour ce compte — appelée aussi bien par le bouton "Terminer"
    que par "Passer l'assistant" côté frontend (`WelcomeWizard.tsx`), dans les deux cas
    l'assistant ne doit plus jamais réapparaître à la prochaine connexion. Pas de
    restriction de rôle : un compte membre/invité qui l'appellerait (jamais exposé
    dans son propre parcours, l'assistant est réservé au propriétaire côté frontend)
    ne ferait que marquer son propre drapeau, sans effet visible pour personne d'autre."""
    preferences_service.marquer_onboarding_termine(db, current_user.id)
    db.commit()
    return _user_out(db, current_user)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_row: AuthToken = Depends(get_current_token),
):
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
def get_access_log(
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PROPRIETAIRE)),
):
    entrees = auth_service.lister_journal_acces(db, page, max(1, min(page_size, 200)))
    return [AccessLogEntryOut.model_validate(e) for e in entrees]


def _nom_affiche_oidc(membre: User) -> str | None:
    """`None` = compte mot de passe local. Sinon, le `display_name` du fournisseur
    SSO actuellement configuré (ou son défaut si la configuration a depuis été
    désactivée/modifiée : le compte reste provisionné via SSO, l'affichage ne doit
    pas dépendre de l'état ACTUEL de la config pour ça)."""
    if membre.oidc_subject is None:
        return None
    config = oidc_service.charger_config()
    return config.display_name if config is not None else oidc_service.DISPLAY_NAME_PAR_DEFAUT


def _household_member_out(db: Session, membre: User) -> HouseholdMemberOut:
    """Cas d'un seul membre (création/changement de rôle) — la liste (`GET`) groupe
    les mêmes requêtes pour tout le foyer en une fois plutôt que d'appeler ceci par
    membre, pour éviter un N+1."""
    sortie = HouseholdMemberOut.model_validate(membre)
    sortie.detenteur_ids = [p.detenteur_id for p in db.query(PerimetreInvite).filter(PerimetreInvite.user_id == membre.id).all()]
    sortie.oidc_display_name = _nom_affiche_oidc(membre)
    sortie.derniere_connexion = auth_service.dernieres_connexions_reussies(db, [membre.id]).get(membre.id)
    sortie.sessions_actives = auth_service.nombre_sessions_actives(db, [membre.id]).get(membre.id, 0)
    sortie.verrouille_jusqua = auth_service.verrouillage_actif(db, membre.username)
    return sortie


@router.post("/household-members", response_model=HouseholdMemberOut)
def create_household_member(
    payload: HouseholdMemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PROPRIETAIRE)),
):
    if auth_service.utilisateur_par_username(db, payload.username) is not None:
        raise HTTPException(status_code=400, detail=MESSAGE_NOM_UTILISATEUR_DEJA_UTILISE)
    membre = auth_service.creer_utilisateur(db, payload.username, payload.password, role=payload.role, owner_user_id=current_user.id)
    if payload.detenteur_ids:
        detenteurs_valides = (
            db.query(Detenteur).filter(Detenteur.id.in_(payload.detenteur_ids), Detenteur.user_id == current_user.id).all()
        )
        for detenteur in detenteurs_valides:
            db.add(PerimetreInvite(user_id=membre.id, detenteur_id=detenteur.id))
        db.commit()
    return _household_member_out(db, membre)


@router.get("/household-members", response_model=list[HouseholdMemberOut])
def list_household_members(db: Session = Depends(get_db), current_user: User = Depends(require_role(ROLE_PROPRIETAIRE))):
    """Écran d'administration des comptes (revue du 04/09/2026) : inclut désormais le
    propriétaire lui-même en première position — avec un seul compte connecté (le cas
    le plus courant sur un premier déploiement), la liste ne montrait jusque-là RIEN,
    ce qui laissait croire que l'écran ne fonctionnait pas. Le propriétaire reste en
    lecture seule ici (rôle non éditable, pas de suppression) : `update_household_member_role`/
    `delete_household_member` continuent de 404 sur son propre id (`owner_user_id`
    vaut `None`, jamais égal à `current_user.id`), c'est le frontend qui n'affiche
    tout simplement pas ces contrôles sur sa ligne."""
    membres = db.query(User).filter(User.owner_user_id == current_user.id).order_by(User.created_at).all()
    tous = [current_user, *membres]
    ids = [u.id for u in tous]
    detenteur_ids_par_membre: dict[int, list[int]] = {}
    for p in db.query(PerimetreInvite).filter(PerimetreInvite.user_id.in_(ids)).all():
        detenteur_ids_par_membre.setdefault(p.user_id, []).append(p.detenteur_id)
    dernieres = auth_service.dernieres_connexions_reussies(db, ids)
    sessions = auth_service.nombre_sessions_actives(db, ids)
    resultats = []
    for membre in tous:
        sortie = HouseholdMemberOut.model_validate(membre)
        sortie.detenteur_ids = detenteur_ids_par_membre.get(membre.id, [])
        sortie.oidc_display_name = _nom_affiche_oidc(membre)
        sortie.derniere_connexion = dernieres.get(membre.id)
        sortie.sessions_actives = sessions.get(membre.id, 0)
        # Pas batchable simplement (fenêtre glissante par utilisateur) — foyer
        # restreint en pratique, un aller-retour de plus par membre reste négligeable.
        sortie.verrouille_jusqua = auth_service.verrouillage_actif(db, membre.username)
        resultats.append(sortie)
    return resultats


@router.patch("/household-members/{id}", response_model=HouseholdMemberOut)
def update_household_member_role(
    id: int,
    payload: HouseholdMemberRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_PROPRIETAIRE)),
):
    membre = db.get(User, id)
    if membre is None or membre.owner_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    membre.role = payload.role
    db.commit()
    db.refresh(membre)
    return _household_member_out(db, membre)


@router.delete("/household-members/{id}", status_code=204)
def delete_household_member(id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role(ROLE_PROPRIETAIRE))):
    membre = db.get(User, id)
    if membre is None or membre.owner_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    db.query(PerimetreInvite).filter(PerimetreInvite.user_id == membre.id).delete()
    db.query(AuthToken).filter(AuthToken.user_id == membre.id).delete()
    # Le journal d'accès SURVIT à la suppression du compte, par conception (cf.
    # docstring d'`AccessLogEntry`) : effacer les traces de connexion en supprimant
    # un membre viderait le journal de son intérêt. On détache donc la référence au
    # lieu de supprimer les lignes — `username_saisi` continue de dire QUI s'était
    # connecté. Sans ce détachement, la ligne gardait un `user_id` pointant dans le
    # vide : 10 entrées orphelines constatées en base réelle lors de la revue du
    # 03/09/2026 (`PRAGMA foreign_key_check`).
    db.query(AccessLogEntry).filter(AccessLogEntry.user_id == membre.id).update({"user_id": None})
    db.delete(membre)
    db.commit()
