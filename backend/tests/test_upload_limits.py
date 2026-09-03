"""Garde-fou de taille des fichiers importés, et sa cohérence avec le proxy nginx.

Incident du 03/09/2026 : un export de transactions de 1,2 Mo était refusé avec
« Le fichier envoyé est trop volumineux » alors que la limite applicative est de
25 Mo. La cause n'était pas dans le code Python mais dans `nginx.conf`, qui ne
déclarait aucun `client_max_body_size` — nginx appliquait donc son défaut de 1 Mo
et rejetait la requête AVANT que l'application ne la voie. Aucun journal applicatif
n'en portait la trace, ce qui rendait le diagnostic difficile.
"""

import re
from pathlib import Path

import pytest

from app.services import upload_limits

CHEMIN_NGINX = Path(__file__).resolve().parent.parent.parent / "frontend" / "docker" / "nginx.conf"


def test_un_fichier_sous_la_limite_passe():
    upload_limits.verifier_taille_fichier(b"x" * (upload_limits.TAILLE_MAX_IMPORT_OCTETS - 1))


def test_un_fichier_au_dessus_de_la_limite_est_refuse():
    with pytest.raises(upload_limits.FichierTropVolumineuxError) as exc:
        upload_limits.verifier_taille_fichier(b"x" * (upload_limits.TAILLE_MAX_IMPORT_OCTETS + 1))

    message = str(exc.value)
    assert "25" in message, "le message doit annoncer la limite réellement appliquée"


def test_nginx_declare_une_limite_de_corps_de_requete():
    """Sans directive, nginx plafonne à 1 Mo — bien en dessous de ce que
    l'application accepte, et le rejet arrive avant tout code applicatif."""
    assert CHEMIN_NGINX.is_file(), f"configuration nginx introuvable : {CHEMIN_NGINX}"

    contenu = CHEMIN_NGINX.read_text(encoding="utf-8")

    assert "client_max_body_size" in contenu, (
        "nginx sans `client_max_body_size` retombe sur 1 Mo et rejette lui-même les "
        "imports, avec un message que rien côté application ne peut expliquer"
    )


def test_la_limite_nginx_est_alignee_sur_la_limite_applicative():
    """LE test qui compte : deux limites qui divergent produisent un refus
    inexplicable — l'application annonce 25 Mo, le proxy en applique 1."""
    contenu = CHEMIN_NGINX.read_text(encoding="utf-8")
    correspondance = re.search(r"client_max_body_size\s+(\d+)([kmg]?);", contenu, re.IGNORECASE)
    assert correspondance is not None, "directive `client_max_body_size` illisible"

    valeur = int(correspondance.group(1))
    facteurs = {"": 1, "k": 1024, "m": 1024 * 1024, "g": 1024 * 1024 * 1024}
    octets_nginx = valeur * facteurs[correspondance.group(2).lower()]

    assert octets_nginx >= upload_limits.TAILLE_MAX_IMPORT_OCTETS, (
        f"nginx accepte {octets_nginx} octets, l'application {upload_limits.TAILLE_MAX_IMPORT_OCTETS} : "
        "un fichier accepté par l'application serait rejeté par le proxy"
    )
