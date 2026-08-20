"""Verrouille `services/auth_service.py` : hachage/vérification de mot de passe,
création et expiration de jeton — sans passer par les routes HTTP (`test_auth_router.py`
s'en charge)."""

from datetime import timedelta

from app.models import AuthToken
from app.services import auth_service


def test_hash_password_produit_un_format_reconnu():
    hashed = auth_service.hash_password("mot-de-passe-solide")
    algo, iterations, sel, digest = hashed.split("$")
    assert algo == "pbkdf2_sha256"
    assert int(iterations) == auth_service.PBKDF2_ITERATIONS
    assert len(sel) == 32  # 16 octets en hexadécimal
    assert len(digest) == 64  # sha256 en hexadécimal


def test_verify_password_bon_mot_de_passe():
    hashed = auth_service.hash_password("mot-de-passe-solide")
    assert auth_service.verify_password("mot-de-passe-solide", hashed) is True


def test_verify_password_mauvais_mot_de_passe():
    hashed = auth_service.hash_password("mot-de-passe-solide")
    assert auth_service.verify_password("autre-chose", hashed) is False


def test_verify_password_format_invalide_ne_leve_pas():
    assert auth_service.verify_password("peu importe", "pas-un-hash-valide") is False


def test_creer_utilisateur_normalise_lemail(db):
    user = auth_service.creer_utilisateur(db, "  Paul@Example.com  ", "mot-de-passe-solide")
    assert user.email == "paul@example.com"
    assert auth_service.utilisateur_par_email(db, "PAUL@EXAMPLE.COM") is not None


def test_creer_token_expire_dans_le_futur(db):
    user = auth_service.creer_utilisateur(db, "paul@example.com", "mot-de-passe-solide")
    token = auth_service.creer_token(db, user)
    assert token.expires_at > token.created_at
    assert (token.expires_at - token.created_at) == timedelta(days=auth_service.TOKEN_TTL_JOURS)


def test_utilisateur_par_token_retrouve_le_bon_utilisateur(db):
    user = auth_service.creer_utilisateur(db, "paul@example.com", "mot-de-passe-solide")
    token = auth_service.creer_token(db, user)

    retrouve = auth_service.utilisateur_par_token(db, token.token)

    assert retrouve is not None
    assert retrouve.id == user.id


def test_utilisateur_par_token_absent_renvoie_none(db):
    assert auth_service.utilisateur_par_token(db, "jeton-inexistant") is None


def test_utilisateur_par_token_expire_renvoie_none(db):
    user = auth_service.creer_utilisateur(db, "paul@example.com", "mot-de-passe-solide")
    token = auth_service.creer_token(db, user)
    token.expires_at = token.created_at - timedelta(days=1)
    db.commit()

    assert auth_service.utilisateur_par_token(db, token.token) is None


def test_supprimer_token_revoque_laccess(db):
    user = auth_service.creer_utilisateur(db, "paul@example.com", "mot-de-passe-solide")
    token = auth_service.creer_token(db, user)

    auth_service.supprimer_token(db, token.token)

    assert auth_service.utilisateur_par_token(db, token.token) is None
    assert db.get(AuthToken, token.token) is None
