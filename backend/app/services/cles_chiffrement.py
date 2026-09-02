"""Résolution des clés de chiffrement symétrique de l'application (backlog Y.3).

Fernet exige une clé d'un format très précis — 32 octets en base64 url-safe, soit
44 caractères terminés par `=` — qu'on n'obtient qu'avec `Fernet.generate_key()`.
En exploitation, c'est une friction réelle : les générateurs de secrets usuels
(gestionnaires de mots de passe, `openssl rand`, interfaces de secrets des
plateformes d'hébergement) produisent des chaînes alphanumériques de 32/64
caractères, systématiquement refusées. L'exploitant se retrouvait devant un
message d'erreur pour une valeur qu'il avait toute raison de croire correcte
(retour utilisateur du 02/09/2026).

Ce module accepte donc **les deux formes** :

- une **vraie clé Fernet** (44 caractères base64 url-safe) est utilisée telle
  quelle — indispensable pour la rétrocompatibilité : les sauvegardes et secrets
  déjà chiffrés avec une telle clé doivent rester déchiffrables ;
- **toute autre phrase secrète** est DÉRIVÉE en clé Fernet par PBKDF2-HMAC-SHA256.

Deux points de conception méritent d'être explicités :

**Le sel est fixe.** Un sel aléatoire imposerait de le stocker à côté des données
chiffrées — donc un fichier annexe supplémentaire à ne jamais perdre sous peine de
rendre toutes les sauvegardes illisibles : un mode de panne pire que celui qu'on
cherche à éviter, pour un outil auto-hébergé. Un sel fixe n'affaiblit la dérivation
que face à un calcul précalculé sur des phrases FAIBLES et répandues ; d'où la
longueur minimale imposée ci-dessous, qui rend ce scénario sans objet (une phrase
de 32 caractères aléatoires dépasse largement toute table précalculable).

**Une longueur minimale est exigée.** Sans elle, accepter une phrase libre
reviendrait à laisser protéger l'intégralité d'un patrimoine par « motdepasse ».
32 caractères est le seuil retenu : c'est ce que produit par défaut un
gestionnaire de mots de passe, et cela laisse une marge confortable même avec un
alphabet restreint.
"""

from __future__ import annotations

import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Sel de dérivation — constante applicative, jamais un secret (un sel n'a pas à
# l'être). Versionné dans son nom : le faire évoluer invaliderait toutes les
# données déjà chiffrées par dérivation, ce qui exigerait une procédure de
# migration explicite, jamais un simple changement de valeur ici.
SEL_DERIVATION = b"application-patrimoine::derivation-cle::v1"

# Coût de la dérivation. Recommandation OWASP 2023 pour PBKDF2-HMAC-SHA256. Le coût
# (~0,3 s) est payé une fois par opération de chiffrement/déchiffrement — négligeable
# pour une sauvegarde quotidienne ou la lecture d'un secret OIDC, dissuasif pour une
# attaque par force brute.
ITERATIONS_PBKDF2 = 600_000

LONGUEUR_MINIMALE_PHRASE = 32


class PhraseSecreteTropCourteError(ValueError):
    """La valeur fournie n'est pas une clé Fernet et est trop courte pour être
    dérivée sans affaiblir le chiffrement."""


def _est_cle_fernet(valeur: str) -> bool:
    try:
        Fernet(valeur.encode("utf-8"))
    except (ValueError, TypeError):
        return False
    return True


def cle_fernet_depuis(valeur: str, *, nom_variable: str) -> bytes:
    """Rend une clé Fernet utilisable à partir de `valeur`.

    `nom_variable` n'intervient que dans le message d'erreur : c'est ce texte que
    l'exploitant lira dans le statut d'un job ou dans l'écran Réglages, il doit
    donc nommer la variable concernée.
    """
    if _est_cle_fernet(valeur):
        return valeur.encode("utf-8")

    if len(valeur) < LONGUEUR_MINIMALE_PHRASE:
        raise PhraseSecreteTropCourteError(
            f"{nom_variable} est trop courte ({len(valeur)} caractères) : il en faut au moins "
            f"{LONGUEUR_MINIMALE_PHRASE}, ou une clé Fernet de 44 caractères. "
            "Générez une phrase longue et aléatoire (gestionnaire de mots de passe, "
            "`openssl rand -base64 48`) — voir docs/MANUEL_EXPLOITATION.md §12."
        )

    derivation = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SEL_DERIVATION,
        iterations=ITERATIONS_PBKDF2,
    )
    return base64.urlsafe_b64encode(derivation.derive(valeur.encode("utf-8")))


def fernet_depuis(valeur: str, *, nom_variable: str) -> Fernet:
    return Fernet(cle_fernet_depuis(valeur, nom_variable=nom_variable))
