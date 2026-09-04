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
    # Écran de rattrapage bloquant (revue du 03/09/2026, compte obligatoire sur une
    # ligne financière) : pas une colonne de `User`, calculé depuis
    # `comptes_service.compter_holdings_sans_compte` et posé explicitement par
    # `routers/auth.py` sur chaque réponse contenant un `UserOut` — même patron que
    # `onboarding_termine` ci-dessus. Tant que > 0, le frontend affiche l'écran de
    # rattrapage plutôt que l'application (sauf pour un `invite`, lecture seule, qui
    # ne peut rien y corriger).
    holdings_sans_compte: int = 0


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class OidcStatus(BaseModel):
    enabled: bool
    # Texte choisi par variable d'environnement (`PATRIMOINE_OIDC_DISPLAY_NAME`) pour
    # le bouton de connexion — jamais un nom de fournisseur figé dans le code, cf.
    # `oidc_service.DISPLAY_NAME_PAR_DEFAUT`.
    display_name: str = "SSO"


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
    # Écran d'administration des comptes (Réglages → Comptes & sécurité) : `None` =
    # compte mot de passe local, une chaîne = provisionné/lié via ce fournisseur SSO
    # (son `display_name`, cf. `oidc_service.charger_config` — pas seulement un
    # booléen, pour afficher directement lequel). Posé explicitement par
    # `routers/auth.py`, jamais rempli par `model_validate` (calculé, pas une
    # colonne de `User`).
    oidc_display_name: str | None = None
    # Calculés depuis le journal d'accès/les jetons de session, jamais des colonnes
    # de `User` — mêmes conventions que `oidc_display_name` ci-dessus.
    derniere_connexion: datetime | None = None
    sessions_actives: int = 0
    verrouille_jusqua: datetime | None = None


class HouseholdMemberUpdate(BaseModel):
    """Modification d'un compte du foyer (revue du 04/09/2026) — rôle et/ou nom
    d'utilisateur, chacun facultatif (mise à jour partielle). Jamais utilisé sur le
    propriétaire lui-même : `update_household_member` (routers/auth.py) refuse toute
    modification sur son propre compte, via le même garde IDOR que la suppression
    (`owner_user_id != current_user.id`)."""

    role: str | None = None
    username: str | None = None

    @field_validator("role")
    @classmethod
    def _valider_role(cls, v: str | None) -> str | None:
        if v is not None and v not in ROLES_ASSIGNABLES:
            raise ValueError("Le rôle doit être 'membre' ou 'invite'")
        return v

    @field_validator("username")
    @classmethod
    def _valider_username(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not (2 <= len(v) <= 32):
            raise ValueError(MESSAGE_NOM_UTILISATEUR_INVALIDE)
        return v
