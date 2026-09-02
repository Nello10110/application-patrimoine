"""Résolution des clés de chiffrement (backlog Y.3) : accepter une phrase secrète
usuelle en plus d'une vraie clé Fernet, sans jamais casser l'existant.

Les deux propriétés vitales de ce module — et les seules qui, si elles se cassaient,
rendraient des données définitivement illisibles — sont la RÉTROCOMPATIBILITÉ (une
clé Fernet déjà en service reste utilisée telle quelle) et le DÉTERMINISME (une même
phrase redonne toujours la même clé, y compris d'un process à l'autre et d'une
version à l'autre).
"""

import pytest
from cryptography.fernet import Fernet

from app.services import cles_chiffrement

PHRASE_64 = "ToXuOMXb7pkEEaPqXcYpq5vioZ1x9VyZGShcSy5OXQJf431albHwXPrpMB8halz6"


def _cle(valeur: str) -> bytes:
    return cles_chiffrement.cle_fernet_depuis(valeur, nom_variable="PATRIMOINE_BACKUP_KEY")


# ---------------------------------------------------------------------------
# Rétrocompatibilité — la propriété à ne JAMAIS casser
# ---------------------------------------------------------------------------


def test_une_vraie_cle_fernet_est_utilisee_telle_quelle():
    """Toute donnée déjà chiffrée avec une clé Fernet doit rester déchiffrable :
    la dériver à nouveau produirait une clé différente et rendrait illisibles
    toutes les sauvegardes existantes."""
    cle = Fernet.generate_key().decode()

    assert _cle(cle) == cle.encode("utf-8")


def test_une_donnee_chiffree_avec_une_cle_fernet_reste_dechiffrable():
    """Vérification de bout en bout de la propriété ci-dessus, sur un vrai
    chiffrement/déchiffrement plutôt que sur l'égalité des octets."""
    cle = Fernet.generate_key().decode()
    jeton = Fernet(cle.encode()).encrypt(b"donnees historiques")

    assert Fernet(_cle(cle)).decrypt(jeton) == b"donnees historiques"


# ---------------------------------------------------------------------------
# Dérivation d'une phrase secrète
# ---------------------------------------------------------------------------


def test_une_phrase_longue_est_acceptee_et_permet_un_aller_retour():
    """Cas d'usage à l'origine de cette évolution : une chaîne de 64 caractères
    produite par un gestionnaire de mots de passe."""
    fernet = Fernet(_cle(PHRASE_64))

    assert fernet.decrypt(fernet.encrypt(b"secret")) == b"secret"


def test_la_derivation_est_deterministe():
    """Sans déterminisme, une sauvegarde ne serait plus déchiffrable au
    redémarrage suivant — la panne la plus coûteuse imaginable ici."""
    assert _cle(PHRASE_64) == _cle(PHRASE_64)


def test_la_derivation_est_stable_dans_le_temps():
    """Verrou sur la valeur EXACTE produite par la phrase de référence : toute
    modification du sel, de l'algorithme ou du nombre d'itérations rendrait
    illisibles les sauvegardes déjà chiffrées, et doit donc échouer ici plutôt que
    de passer inaperçue jusqu'à la prochaine restauration."""
    assert _cle(PHRASE_64) == b"-6KXVPL3XDXv0YXOJL1VfzmOEDvgJE5tscxusuJMLTw="


def test_deux_phrases_differentes_donnent_des_cles_differentes():
    assert _cle(PHRASE_64) != _cle(PHRASE_64[:-1] + "7")


def test_la_cle_derivee_est_un_format_fernet_valide():
    Fernet(_cle(PHRASE_64))  # ne doit pas lever


# ---------------------------------------------------------------------------
# Refus des phrases trop faibles
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "valeur",
    [
        pytest.param("motdepasse", id="mot-de-passe-courant"),
        pytest.param("a" * 31, id="un-caractere-sous-le-seuil"),
        pytest.param("", id="vide"),
    ],
)
def test_une_phrase_trop_courte_est_refusee(valeur):
    """Accepter une phrase libre sans plancher reviendrait à laisser protéger tout
    un patrimoine par « motdepasse » — le sel étant fixe (cf. docstring du module),
    c'est ce plancher qui rend le compromis acceptable."""
    with pytest.raises(cles_chiffrement.PhraseSecreteTropCourteError):
        _cle(valeur)


def test_le_message_de_refus_nomme_la_variable_et_dit_quoi_faire():
    """Ce texte est affiché tel quel dans le statut d'un job ou l'écran Réglages :
    c'est souvent le seul indice dont dispose l'exploitant."""
    with pytest.raises(cles_chiffrement.PhraseSecreteTropCourteError) as exc:
        cles_chiffrement.cle_fernet_depuis("court", nom_variable="PATRIMOINE_BACKUP_KEY")

    message = str(exc.value)
    assert "PATRIMOINE_BACKUP_KEY" in message
    assert str(cles_chiffrement.LONGUEUR_MINIMALE_PHRASE) in message
    assert "MANUEL_EXPLOITATION" in message


def test_une_phrase_exactement_au_seuil_est_acceptee():
    """Vérifie que le seuil est inclusif — une phrase de la longueur minimale
    exacte doit passer, pas être refusée à un caractère près."""
    Fernet(_cle("a" * cles_chiffrement.LONGUEUR_MINIMALE_PHRASE))
