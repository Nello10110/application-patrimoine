from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

from ..models import ROLES_ASSIGNABLES

MESSAGE_MOT_DE_PASSE_TROP_COURT = "Le mot de passe doit contenir au moins 8 caractères"
MESSAGE_NOM_UTILISATEUR_INVALIDE = "Le nom d'utilisateur doit contenir entre 2 et 32 caractères"


class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def _valider_username(cls, v: str) -> str:
        v = v.strip()
        if not (2 <= len(v) <= 32):
            raise ValueError(MESSAGE_NOM_UTILISATEUR_INVALIDE)
        return v

    @field_validator("password")
    @classmethod
    def _valider_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError(MESSAGE_MOT_DE_PASSE_TROP_COURT)
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    # Métadonnées d'affichage pures (backlog SSO, claim mapping) — `None` pour un
    # compte mot de passe local, jamais utilisées pour l'authentification.
    email: str | None = None
    nom: str | None = None
    # Assistant de configuration initiale (welcome board) : pas une colonne de `User`,
    # calculé depuis `UserParametre` (`services/preferences_service.onboarding_termine`)
    # et posé explicitement par `routers/auth.py` sur chaque réponse contenant un
    # `UserOut` — jamais rempli automatiquement par `model_validate`, absent de `User`.
    onboarding_termine: bool = False


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class OidcStatus(BaseModel):
    enabled: bool
    # Texte choisi par le propriétaire pour le bouton de connexion (Réglages) — jamais
    # un nom de fournisseur figé dans le code, cf. `oidc_service.DISPLAY_NAME_PAR_DEFAUT`.
    display_name: str = "SSO"


MESSAGE_CHAMP_OIDC_VIDE = "Ce champ ne peut pas être vide."


class OidcConfigOut(BaseModel):
    issuer: str | None
    client_id: str | None
    redirect_uri: str | None
    frontend_url: str | None
    secret_configure: bool
    cle_chiffrement_definie: bool
    enabled: bool
    display_name: str
    claim_username: str
    claim_email: str
    claim_nom: str


class OidcConfigUpdate(BaseModel):
    issuer: str
    client_id: str
    redirect_uri: str
    frontend_url: str
    client_secret: str | None = None
    enabled: bool = True
    display_name: str | None = None
    claim_username: str | None = None
    claim_email: str | None = None
    claim_nom: str | None = None

    @field_validator("issuer", "client_id", "redirect_uri", "frontend_url")
    @classmethod
    def _valider_non_vide(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError(MESSAGE_CHAMP_OIDC_VIDE)
        return v


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_session: str
    created_at: datetime
    expires_at: datetime
    derniere_utilisation: datetime
    ip: str | None
    user_agent: str | None
    est_courante: bool = False


class AccessLogEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    timestamp: datetime
    username_saisi: str
    ip: str | None
    action: str
    resultat: str
    raison: str | None


class HouseholdMemberCreate(BaseModel):
    username: str
    password: str
    role: str
    # Détenteurs auxquels un compte "invite" a accès en lecture (2.L.2) — ignoré
    # pour un compte "membre" (accès de type par ressource, pas par détenteur).
    detenteur_ids: list[int] = []

    @field_validator("username")
    @classmethod
    def _valider_username(cls, v: str) -> str:
        v = v.strip()
        if not (2 <= len(v) <= 32):
            raise ValueError(MESSAGE_NOM_UTILISATEUR_INVALIDE)
        return v

    @field_validator("password")
    @classmethod
    def _valider_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError(MESSAGE_MOT_DE_PASSE_TROP_COURT)
        return v

    @field_validator("role")
    @classmethod
    def _valider_role(cls, v: str) -> str:
        if v not in ROLES_ASSIGNABLES:
            raise ValueError("Le rôle doit être 'membre' ou 'invite'")
        return v


class HouseholdMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    created_at: datetime
    detenteur_ids: list[int] = []
    email: str | None = None
    nom: str | None = None
