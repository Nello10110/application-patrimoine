"""Verrouille `services/logo_service.py` (logos réels des établissements, retour
utilisateur du 05/09/2026) : garde SSRF sur les URL saisies, normalisation en PNG,
non-réécriture d'une image inchangée, et respect d'un logo téléversé par le job
hebdomadaire.

Aucun test ne touche le réseau : `_telecharger` est systématiquement remplacé.
"""

import socket
from io import BytesIO

import pytest
from PIL import Image

from app.services import comptes_service, logo_service

from .conftest import ID_UTILISATEUR_TEST


def png_factice(taille: tuple[int, int] = (32, 32), couleur: str = "red") -> bytes:
    tampon = BytesIO()
    Image.new("RGBA", taille, couleur).save(tampon, format="PNG")
    return tampon.getvalue()


def _resoudre_vers(monkeypatch, ip: str) -> None:
    """Force la résolution DNS de n'importe quel nom vers `ip` — un domaine
    parfaitement banal peut pointer vers une adresse interne, c'est précisément ce
    que la garde doit intercepter."""
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]
    )


# ---------------------------------------------------------------------------
# Garde SSRF
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://exemple.fr/logo.png",
        "javascript:alert(1)",
        "https:///logo.png",  # pas de nom de domaine
    ],
)
def test_url_non_http_refusee(url):
    with pytest.raises(logo_service.UrlNonAutoriseeError):
        logo_service._verifier_url_publique(url)


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.5", "192.168.1.10", "169.254.169.254", "::1"])
def test_url_qui_resout_vers_le_reseau_interne_refusee(monkeypatch, ip):
    """Cœur de la protection : l'utilisateur saisit une URL, c'est le SERVEUR qui la
    télécharge — sans ce contrôle, le champ deviendrait un SSRF vers le homelab
    (y compris `169.254.169.254`, l'adresse de métadonnées des hébergeurs cloud)."""
    _resoudre_vers(monkeypatch, ip)

    with pytest.raises(logo_service.UrlNonAutoriseeError):
        logo_service._verifier_url_publique("https://exemple-anodin.fr/logo.png")


def test_url_publique_acceptee(monkeypatch):
    _resoudre_vers(monkeypatch, "93.184.216.34")

    logo_service._verifier_url_publique("https://exemple.fr/logo.png")  # ne lève pas


def test_domaine_introuvable_refuse(monkeypatch):
    def _echoue(*a, **k):
        raise socket.gaierror("nom inconnu")

    monkeypatch.setattr(socket, "getaddrinfo", _echoue)

    with pytest.raises(logo_service.UrlNonAutoriseeError):
        logo_service._verifier_url_publique("https://domaine-qui-nexiste-pas.invalid/logo.png")


# ---------------------------------------------------------------------------
# Normalisation en PNG
# ---------------------------------------------------------------------------


def test_normaliser_redimensionne_et_reencode_en_png():
    grande = png_factice((512, 400))

    resultat = logo_service.normaliser_en_png(grande)

    image = Image.open(BytesIO(resultat))
    assert image.format == "PNG"
    assert max(image.size) <= logo_service.TAILLE_CIBLE_PX


def test_normaliser_convertit_un_jpeg_en_png():
    tampon = BytesIO()
    Image.new("RGB", (64, 64), "blue").save(tampon, format="JPEG")

    resultat = logo_service.normaliser_en_png(tampon.getvalue())

    assert Image.open(BytesIO(resultat)).format == "PNG"


def test_normaliser_refuse_un_svg():
    """Décision de conception : tout est matriciel. Un SVG peut embarquer du script,
    et servi depuis notre propre origine il deviendrait un vecteur XSS."""
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

    with pytest.raises(logo_service.ImageInvalideError):
        logo_service.normaliser_en_png(svg)


def test_normaliser_refuse_un_fichier_qui_nest_pas_une_image():
    with pytest.raises(logo_service.ImageInvalideError):
        logo_service.normaliser_en_png(b"ceci n'est pas une image")


# ---------------------------------------------------------------------------
# Application et rafraîchissement
# ---------------------------------------------------------------------------


def test_appliquer_logo_pose_les_champs(db):
    etablissement = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Boursorama", "boursorama")

    change = logo_service.appliquer_logo(db, etablissement, png_factice(), logo_service.SOURCE_CATALOGUE)

    assert change is True
    assert etablissement.logo_png is not None
    assert etablissement.logo_source == logo_service.SOURCE_CATALOGUE
    assert etablissement.logo_maj_le is not None
    assert logo_service.data_uri(etablissement).startswith("data:image/png;base64,")


def test_appliquer_logo_identique_ne_reecrit_rien(db):
    """Cas normal du job hebdomadaire : un logo bouge rarement, inutile de réécrire
    la ligne (et d'avancer sa date de mise à jour) à chaque passage."""
    etablissement = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Boursorama", "boursorama")
    png = png_factice()
    logo_service.appliquer_logo(db, etablissement, png, logo_service.SOURCE_CATALOGUE)
    date_initiale = etablissement.logo_maj_le

    change = logo_service.appliquer_logo(db, etablissement, png, logo_service.SOURCE_CATALOGUE)

    assert change is False
    assert etablissement.logo_maj_le == date_initiale


def test_retirer_logo_efface_tout(db):
    etablissement = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Boursorama", "boursorama")
    logo_service.appliquer_logo(db, etablissement, png_factice(), logo_service.SOURCE_CATALOGUE)

    logo_service.retirer_logo(db, etablissement)

    assert etablissement.logo_png is None
    assert etablissement.logo_source is None
    assert logo_service.data_uri(etablissement) is None


def test_rafraichir_ne_touche_jamais_un_logo_televerse(db, monkeypatch):
    """Demande explicite : le job hebdomadaire entretient ce qui est automatique, il
    n'écrase jamais un choix délibéré de l'utilisateur."""
    televerse = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Ma banque", "trade_republic")
    logo_service.appliquer_logo(db, televerse, png_factice(couleur="red"), logo_service.SOURCE_UPLOAD)
    empreinte_avant = televerse.logo_empreinte

    monkeypatch.setattr(logo_service, "recuperer_pour_domaine", lambda domaine: png_factice(couleur="blue"))
    resume = logo_service.rafraichir_logos(db)

    assert resume.traites == 0
    assert televerse.logo_empreinte == empreinte_avant


def test_rafraichir_met_a_jour_un_logo_de_catalogue(db, monkeypatch):
    etablissement = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Boursorama", "boursorama")
    logo_service.appliquer_logo(db, etablissement, png_factice(couleur="red"), logo_service.SOURCE_CATALOGUE)

    monkeypatch.setattr(logo_service, "recuperer_pour_domaine", lambda domaine: png_factice(couleur="blue"))
    resume = logo_service.rafraichir_logos(db)

    assert resume.mis_a_jour == 1
    assert etablissement.logo_source == logo_service.SOURCE_CATALOGUE


def test_rafraichir_recharge_une_url_saisie(db, monkeypatch):
    etablissement = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Ma banque", None)
    logo_service.appliquer_logo(
        db, etablissement, png_factice(couleur="red"), logo_service.SOURCE_URL, "https://exemple.fr/logo.png"
    )
    urls_appelees: list[str] = []

    def _recuperer(url: str) -> bytes:
        urls_appelees.append(url)
        return png_factice(couleur="green")

    monkeypatch.setattr(logo_service, "recuperer_depuis_url", _recuperer)
    resume = logo_service.rafraichir_logos(db)

    assert urls_appelees == ["https://exemple.fr/logo.png"]
    assert resume.mis_a_jour == 1
    assert etablissement.logo_source_url == "https://exemple.fr/logo.png"


def test_rafraichir_un_echec_nempeche_pas_les_suivants(db, monkeypatch):
    en_echec = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Site en panne", "boursorama")
    logo_service.appliquer_logo(db, en_echec, png_factice(couleur="red"), logo_service.SOURCE_CATALOGUE)
    ok = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Site qui répond", "fortuneo")
    logo_service.appliquer_logo(db, ok, png_factice(couleur="red"), logo_service.SOURCE_CATALOGUE)

    def _recuperer(domaine: str) -> bytes:
        if domaine == "boursobank.com":
            raise logo_service.TelechargementError("site injoignable")
        return png_factice(couleur="blue")

    monkeypatch.setattr(logo_service, "recuperer_pour_domaine", _recuperer)
    resume = logo_service.rafraichir_logos(db)

    assert resume.traites == 2
    assert resume.echecs == 1
    assert resume.mis_a_jour == 1
    # Le logo de l'établissement en échec reste en place, jamais effacé.
    assert en_echec.logo_png is not None


def test_rafraichir_ignore_un_etablissement_sans_logo(db, monkeypatch):
    """Poser un logo est une action volontaire : ce job entretient l'existant, il ne
    démarche pas les établissements qui n'en ont jamais eu."""
    comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Sans logo", "boursorama")
    monkeypatch.setattr(logo_service, "recuperer_pour_domaine", lambda domaine: png_factice())

    resume = logo_service.rafraichir_logos(db)

    assert resume.traites == 0
