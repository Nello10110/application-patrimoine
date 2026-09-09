"""Logos réels des établissements (retour utilisateur du 05/09/2026) : récupération
depuis le site officiel de l'établissement ou depuis une URL/une image fournie par
l'utilisateur, normalisation en PNG, et mise à jour hebdomadaire planifiée.

Trois partis pris, tous délibérés :

1. **Toujours re-servi par notre backend, jamais un `<img src="https://cdn…">`.**
   Une application de patrimoine exposée sur un serveur personnel n'a pas à
   signaler à un tiers, à chaque affichage, quelles banques le foyer utilise. Le
   téléchargement a lieu ici, une fois, et l'image vit ensuite en base (donc dans
   la sauvegarde chiffrée et dans l'export du foyer, cf. `models.Etablissement.logo_png`).

2. **Tout est reconverti en PNG** (`normaliser_en_png`), y compris une image
   téléversée. Un SVG peut embarquer du script : servi tel quel depuis notre
   propre origine, il deviendrait un vecteur XSS. Passer par Pillow garantit que
   ce qui est stocké est une image matricielle inerte, redimensionnée et ré-encodée
   — le contenu d'origine n'est jamais restitué octet pour octet.

3. **Toute URL est validée avant d'être contactée** (`_verifier_url_publique`) :
   l'utilisateur peut saisir n'importe quelle URL, et c'est le SERVEUR qui la
   télécharge. Sans contrôle, `http://127.0.0.1:8000/...` ou `http://169.254.169.254/`
   transformerait ce champ en SSRF vers le réseau interne du homelab. Chaque saut
   de redirection est revalidé pour la même raison.
"""

from __future__ import annotations

import base64
import hashlib
import ipaddress
import logging
import socket
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from ..models import Etablissement, LogoCatalogue
from . import etablissements_connus

logger = logging.getLogger("patrimoine.logos")

SOURCE_CATALOGUE = "catalogue"
SOURCE_URL = "url"
SOURCE_UPLOAD = "upload"

TAILLE_MAX_TELECHARGEMENT_OCTETS = 2 * 1024 * 1024  # 2 Mo : un logo légitime pèse quelques Ko
TAILLE_CIBLE_PX = 128
TIMEOUT_SECONDES = 8
MAX_REDIRECTIONS = 3
_USER_AGENT = "Mozilla/5.0 (compatible; PatrimoineBot/1.0)"

# Formats matriciels que Pillow sait ouvrir sans dépendance supplémentaire. Le SVG
# est volontairement absent : le rastériser demanderait cairosvg, et le servir tel
# quel poserait le problème de sécurité décrit en tête de module.
FORMATS_ACCEPTES = {"PNG", "JPEG", "WEBP", "ICO", "GIF", "BMP"}


class LogoError(Exception):
    """Base des erreurs de ce module — toutes portent un message affichable tel quel."""


class UrlNonAutoriseeError(LogoError):
    pass


class TelechargementError(LogoError):
    pass


class ImageInvalideError(LogoError):
    pass


def _verifier_url_publique(url: str) -> None:
    """Refuse tout ce qui n'est pas une URL http(s) publique. Toutes les adresses
    résolues doivent être publiques : un nom de domaine parfaitement banal peut
    pointer vers 127.0.0.1 (ou vers une IP interne du homelab), et il suffit d'UNE
    adresse interne dans la réponse DNS pour que la requête parte au mauvais
    endroit."""
    analyse = urlparse(url)
    if analyse.scheme not in ("http", "https"):
        raise UrlNonAutoriseeError("Seules les adresses http(s) sont acceptées.")
    if not analyse.hostname:
        raise UrlNonAutoriseeError("Adresse invalide (nom de domaine manquant).")

    try:
        infos = socket.getaddrinfo(analyse.hostname, analyse.port or (443 if analyse.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise UrlNonAutoriseeError(f"Nom de domaine introuvable : {analyse.hostname}") from exc

    for info in infos:
        adresse = ipaddress.ip_address(info[4][0])
        if not adresse.is_global or adresse.is_multicast:
            raise UrlNonAutoriseeError(
                "Cette adresse pointe vers le réseau local ou une adresse réservée — refusée par sécurité."
            )


def _telecharger(url: str) -> bytes:
    """Télécharge une URL déjà validée, en revalidant chaque redirection et en
    bornant la taille lue (un serveur hostile peut annoncer 1 Ko et envoyer 10 Go)."""
    courante = url
    for _ in range(MAX_REDIRECTIONS + 1):
        _verifier_url_publique(courante)
        reponse = requests.get(
            courante,
            headers={"User-Agent": _USER_AGENT},
            timeout=TIMEOUT_SECONDES,
            allow_redirects=False,
            stream=True,
        )
        if reponse.is_redirect or reponse.is_permanent_redirect:
            cible = reponse.headers.get("Location")
            reponse.close()
            if not cible:
                raise TelechargementError("Redirection sans destination.")
            courante = urljoin(courante, cible)
            continue

        if reponse.status_code != 200:
            reponse.close()
            raise TelechargementError(f"Le serveur a répondu {reponse.status_code}.")

        contenu = bytearray()
        for morceau in reponse.iter_content(chunk_size=8192):
            contenu.extend(morceau)
            if len(contenu) > TAILLE_MAX_TELECHARGEMENT_OCTETS:
                reponse.close()
                raise TelechargementError("Image trop volumineuse (plus de 2 Mo).")
        reponse.close()
        if not contenu:
            raise TelechargementError("Réponse vide.")
        return bytes(contenu)

    raise TelechargementError("Trop de redirections.")


def normaliser_en_png(contenu: bytes) -> bytes:
    """Décode, redimensionne et ré-encode en PNG. Lève `ImageInvalideError` sur tout
    ce qui n'est pas une image matricielle reconnue — un fichier renommé en `.png`,
    un SVG, un PDF."""
    try:
        image = Image.open(BytesIO(contenu))
        format_source = (image.format or "").upper()
        if format_source not in FORMATS_ACCEPTES:
            raise ImageInvalideError(
                f"Format d'image non pris en charge ({format_source or 'inconnu'}) — attendu : PNG, JPEG, WEBP, ICO."
            )
        image = image.convert("RGBA")
        image.thumbnail((TAILLE_CIBLE_PX, TAILLE_CIBLE_PX))
        sortie = BytesIO()
        image.save(sortie, format="PNG", optimize=True)
        return sortie.getvalue()
    except UnidentifiedImageError as exc:
        raise ImageInvalideError("Fichier illisible : ce n'est pas une image.") from exc
    except ImageInvalideError:
        raise
    except Exception as exc:  # décodage Pillow en échec sur une image corrompue
        raise ImageInvalideError(f"Image illisible : {exc}") from exc


def recuperer_depuis_url(url: str) -> bytes:
    """URL saisie par l'utilisateur → PNG normalisé."""
    return normaliser_en_png(_telecharger(url))


def _candidats_conventionnels(domaine: str) -> list[str]:
    """`apple-touch-icon` d'abord : c'est l'icône haute résolution (180 px) quand
    elle existe. `favicon.ico` n'est PAS ici — il est essayé en dernier recours
    seulement (cf. `recuperer_pour_domaine`) : plusieurs banques n'y servent qu'un
    16×16, moche une fois affiché, alors qu'elles déclarent une bien meilleure icône
    dans le `<head>` de leur page d'accueil."""
    return [
        f"https://{domaine}/apple-touch-icon.png",
        f"https://{domaine}/apple-touch-icon-precomposed.png",
    ]


def _icones_declarees_dans_la_page(domaine: str) -> list[str]:
    """URLs d'icônes déclarées dans le `<head>` de la page d'accueil. Beaucoup de
    sites bancaires ne servent pas `/apple-touch-icon.png` à la racine mais
    déclarent leurs icônes explicitement — sans cette étape, la moitié du catalogue
    retomberait sur le badge généré."""
    try:
        html = _telecharger(f"https://{domaine}/")
    except LogoError:
        return []
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        return []

    urls: list[tuple[int, str]] = []
    for balise in soup.find_all("link"):
        rel = " ".join(balise.get("rel") or []).lower()
        href = balise.get("href")
        if not href or "icon" not in rel:
            continue
        # Priorité aux plus grandes : `apple-touch-icon` fait 180 px, un favicon
        # déclaré avec `sizes` annonce sa taille, le reste passe en dernier.
        if "apple-touch-icon" in rel:
            priorite = 0
        else:
            tailles = balise.get("sizes") or ""
            try:
                priorite = -int(str(tailles).lower().split("x")[0])
            except ValueError:
                priorite = 1
        urls.append((priorite, urljoin(f"https://{domaine}/", href)))

    return [url for _, url in sorted(urls, key=lambda couple: couple[0])]


def _essayer_domaine(domaine: str, erreurs: list[str]) -> bytes | None:
    candidats = (
        _candidats_conventionnels(domaine)
        + _icones_declarees_dans_la_page(domaine)
        + [f"https://{domaine}/favicon.ico"]
    )
    for url in candidats:
        try:
            return recuperer_depuis_url(url)
        except LogoError as exc:
            erreurs.append(f"{url} : {exc}")
    return None


def recuperer_pour_domaine(domaine: str) -> bytes:
    """Logo officiel d'un établissement du catalogue : emplacements conventionnels,
    puis icônes déclarées dans la page d'accueil, puis `favicon.ico` en dernier
    recours. Réessaie avec le préfixe `www.` — plusieurs banques ne répondent que
    là — avant d'abandonner. Lève `TelechargementError` si aucune piste n'aboutit
    (cas réel de certains sites protégés contre les robots : l'appelant retombe
    alors sur le badge généré, ou l'utilisateur fournit lui-même une image)."""
    erreurs: list[str] = []
    domaines = [domaine] if domaine.startswith("www.") else [domaine, f"www.{domaine}"]
    for candidat in domaines:
        png = _essayer_domaine(candidat, erreurs)
        if png is not None:
            return png
    logger.info("aucun logo récupérable pour %s (%s)", domaine, " | ".join(erreurs[:3]))
    raise TelechargementError(f"Aucun logo récupérable sur {domaine}.")


def appliquer_logo(
    db: Session,
    etablissement: Etablissement,
    png: bytes,
    source: str,
    source_url: str | None = None,
    commit: bool = True,
) -> bool:
    """Pose le PNG sur l'établissement. Renvoie `False` (sans rien écrire) quand
    l'image est identique à celle déjà stockée — cas normal du job hebdomadaire,
    un logo bougeant rarement."""
    empreinte = hashlib.sha256(png).hexdigest()
    inchange = etablissement.logo_empreinte == empreinte and etablissement.logo_source == source
    if inchange:
        return False

    etablissement.logo_png = base64.b64encode(png).decode("ascii")
    etablissement.logo_empreinte = empreinte
    etablissement.logo_source = source
    etablissement.logo_source_url = source_url
    etablissement.logo_maj_le = datetime.now(UTC).replace(tzinfo=None)
    if commit:
        db.commit()
        db.refresh(etablissement)
    return True


def retirer_logo(db: Session, etablissement: Etablissement) -> None:
    etablissement.logo_png = None
    etablissement.logo_empreinte = None
    etablissement.logo_source = None
    etablissement.logo_source_url = None
    etablissement.logo_maj_le = None
    db.commit()


def data_uri(etablissement: Etablissement) -> str | None:
    if not etablissement.logo_png:
        return None
    return f"data:image/png;base64,{etablissement.logo_png}"


@dataclass
class ResumeRafraichissement:
    traites: int = 0
    mis_a_jour: int = 0
    inchanges: int = 0
    echecs: int = 0


def rafraichir_logos(db: Session) -> ResumeRafraichissement:
    """Job hebdomadaire : re-télécharge les logos issus du catalogue (depuis le site
    officiel) et ceux issus d'une URL saisie (depuis cette même URL).

    Un logo TÉLÉVERSÉ n'est jamais touché : c'est un choix explicite de
    l'utilisateur, que rien d'automatique ne doit écraser. Un établissement sans
    logo n'est pas non plus démarché : poser un logo est une action volontaire,
    ce job ne fait qu'entretenir l'existant."""
    resume = ResumeRafraichissement()
    etablissements = (
        db.query(Etablissement).filter(Etablissement.logo_source.in_([SOURCE_CATALOGUE, SOURCE_URL])).all()
    )
    for etablissement in etablissements:
        resume.traites += 1
        try:
            if etablissement.logo_source == SOURCE_URL and etablissement.logo_source_url:
                png = recuperer_depuis_url(etablissement.logo_source_url)
                source_url = etablissement.logo_source_url
            else:
                domaine = etablissements_connus.domaine_pour(etablissement.logo_key)
                if not domaine:
                    resume.echecs += 1
                    continue
                png = recuperer_pour_domaine(domaine)
                source_url = None
            if appliquer_logo(db, etablissement, png, etablissement.logo_source, source_url):
                resume.mis_a_jour += 1
            else:
                resume.inchanges += 1
        except LogoError as exc:
            # Un établissement en échec (site indisponible, logo retiré du site) ne
            # doit jamais empêcher les suivants : le logo actuel reste en place.
            logger.info("logo non rafraîchi pour « %s » : %s", etablissement.nom, exc)
            resume.echecs += 1
        except Exception:
            db.rollback()
            logger.exception("échec inattendu du rafraîchissement du logo de « %s »", etablissement.nom)
            resume.echecs += 1
    return resume


# Cache PARTAGÉ du catalogue (retour utilisateur du 09/09/2026, cf. `models.LogoCatalogue`) :
# les logos affichés dans le SÉLECTEUR, avant même la création d'un `Etablissement`.

# Une clé en échec (BNP Paribas, 403 systématique — cf. `etablissements_connus.py`)
# n'est retentée qu'après ce délai : sans lui, un site qui refuse toute récupération
# serait redémarché à chaque redémarrage du process, indéfiniment.
DELAI_NOUVELLE_TENTATIVE_CATALOGUE = timedelta(hours=24)


def _recuperer_png_catalogue(cle: str) -> bytes | None:
    """RÉSEAU SEUL, aucun accès DB — pensé pour tourner dans un thread parmi
    d'autres (cf. `rafraichir_logos_catalogue` ci-dessous, qui paralléllise les ~12
    domaines plutôt que de les essayer un par un : en série, la première ouverture
    du sélecteur après un redémarrage attendrait la somme de tous les délais
    d'expiration au lieu du plus lent d'entre eux)."""
    domaine = etablissements_connus.domaine_pour(cle)
    if not domaine:
        return None
    try:
        return recuperer_pour_domaine(domaine)
    except LogoError as exc:
        logger.info("logo de catalogue non récupérable pour « %s » : %s", cle, exc)
        return None


def rafraichir_logos_catalogue(db: Session, forcer: bool = False) -> None:
    """Complète/rafraîchit le cache partagé — clés jamais tentées, ou dont la
    dernière tentative dépasse `DELAI_NOUVELLE_TENTATIVE_CATALOGUE` (`forcer=True`,
    job hebdomadaire : ignore ce délai, retente tout le catalogue). N'écrit qu'APRÈS
    que tous les téléchargements (parallèles) sont revenus — jamais d'accès DB
    pendant qu'un thread de fetch tourne encore, une `Session` SQLAlchemy n'étant
    pas conçue pour être partagée entre threads."""
    maintenant = datetime.now(UTC).replace(tzinfo=None)
    existants = {c.logo_key: c for c in db.query(LogoCatalogue).all()}
    a_tenter = [
        cle
        for cle in etablissements_connus.DOMAINES
        if forcer
        or (cache := existants.get(cle)) is None
        or cache.derniere_tentative_le is None
        or maintenant - cache.derniere_tentative_le > DELAI_NOUVELLE_TENTATIVE_CATALOGUE
    ]
    if not a_tenter:
        return

    with ThreadPoolExecutor(max_workers=min(8, len(a_tenter))) as executeur:
        resultats = dict(zip(a_tenter, executeur.map(_recuperer_png_catalogue, a_tenter), strict=True))

    for cle, png in resultats.items():
        cache = existants.get(cle)
        if cache is None:
            cache = LogoCatalogue(logo_key=cle)
            db.add(cache)
            existants[cle] = cache
        cache.derniere_tentative_le = maintenant
        if png is not None:
            cache.logo_png = base64.b64encode(png).decode("ascii")
    db.commit()
    logger.info(
        "cache de logos du catalogue : %d clé(s) tentée(s), %d réussie(s)",
        len(a_tenter),
        sum(1 for png in resultats.values() if png is not None),
    )


def data_uri_catalogue(cache: LogoCatalogue) -> str | None:
    if not cache.logo_png:
        return None
    return f"data:image/png;base64,{cache.logo_png}"
