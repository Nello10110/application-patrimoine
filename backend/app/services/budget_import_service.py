"""Import de mouvements bancaires (backlog 2.N.1) : CSV avec mapping manuel de
colonnes (comme le relevé de positions du portefeuille, `csv_import.py`), OFX et
QIF qui n'en ont pas besoin (structure fixe). Déduplication sur
(date, montant, libellé normalisé) via un identifiant calculé quand la source n'en
fournit pas de stable ; catégorisation automatique par les règles de l'utilisateur.
"""

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime

import pandas as pd
from sqlalchemy.orm import Session

from ..models import MouvementBancaire
from . import budget_categories_service
from .csv_import import to_float


@dataclass
class MouvementBrut:
    date: str  # "YYYY-MM-DD"
    libelle: str
    montant: float
    transaction_id: str | None = None  # fourni par la source (OFX FITID) ; sinon calculé à l'import


@dataclass
class ImportResult:
    lignes_lues: int
    importees: int
    doublons_ignores: int
    lignes_ignorees: int  # date/montant illisible — jamais silencieux (LOT 7.4)
    categorisees_automatiquement: int


def _transaction_id_calcule(date: str, montant: float, libelle: str) -> str:
    base = f"{date}|{montant:.2f}|{budget_categories_service.normaliser(libelle)}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:32]


_FORMATS_DATE_JOUR_MOIS = ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d/%m/%y", "%m/%d/%y", "%d-%m-%Y")
# QIF vient de Quicken (US) : "02/01/2026" y signifie le 1er février, pas le 2
# janvier — priorité inverse de celle des relevés CSV français, sinon toute date
# QIF au jour <= 12 serait mal interprétée un mois sur deux.
_FORMATS_DATE_MOIS_JOUR = ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m/%d/%y", "%d/%m/%y", "%d-%m-%Y")


def _parser_date_flexible(valeur: str, prioriser_mois_jour: bool = False) -> str | None:
    valeur = valeur.strip()
    if not valeur:
        return None
    formats = _FORMATS_DATE_MOIS_JOUR if prioriser_mois_jour else _FORMATS_DATE_JOUR_MOIS
    for fmt in formats:
        try:
            return datetime.strptime(valeur, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# CSV (mapping manuel de colonnes, réutilise le cache d'upload de csv_import.py)
# ---------------------------------------------------------------------------


def mouvements_depuis_dataframe(
    df: pd.DataFrame,
    date_col: str,
    libelle_col: str,
    montant_col: str | None,
    debit_col: str | None,
    credit_col: str | None,
) -> tuple[list[MouvementBrut], int]:
    """Convertit les lignes déjà mappées en `MouvementBrut`. Renvoie aussi le nombre
    de lignes ignorées (date ou montant illisible) — jamais fondu silencieusement
    dans le total importé, pour ne jamais faire croire à un import complet qui a en
    réalité perdu des lignes en cours de route."""
    mouvements: list[MouvementBrut] = []
    ignorees = 0
    for _, row in df.iterrows():
        date = _parser_date_flexible(str(row.get(date_col, "")))
        libelle = str(row.get(libelle_col, "")).strip() or "(sans libellé)"

        if montant_col:
            montant = to_float(row.get(montant_col))
        else:
            debit = to_float(row.get(debit_col)) if debit_col else None
            credit = to_float(row.get(credit_col)) if credit_col else None
            if debit is not None and debit != 0:
                montant = -abs(debit)
            elif credit is not None:
                montant = abs(credit)
            else:
                montant = None

        if date is None or montant is None:
            ignorees += 1
            continue
        mouvements.append(MouvementBrut(date=date, libelle=libelle, montant=montant))
    return mouvements, ignorees


# ---------------------------------------------------------------------------
# OFX (SGML/XML des banques — structure fixe, pas de mapping)
# ---------------------------------------------------------------------------

_BLOC_TRANSACTION = re.compile(r"<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>)|$)", re.DOTALL | re.IGNORECASE)
_CHAMP_OFX = re.compile(r"<(\w+)>\s*([^<\r\n]*)", re.IGNORECASE)


def parse_ofx(content: bytes) -> list[MouvementBrut]:
    """OFX 1.x (SGML, balises non fermées) est le format le plus courant côté
    banques françaises. Pas de bibliothèque dédiée (cohérent avec la philosophie du
    projet, cf. `html.parser` plutôt que `lxml` ailleurs) : la structure `<TAG>valeur`
    répétée dans chaque bloc `<STMTTRN>` se parse fiablement par expression
    régulière, sans avoir besoin d'un vrai analyseur SGML/XML."""
    texte = content.decode("utf-8", errors="replace")
    mouvements: list[MouvementBrut] = []
    for bloc in _BLOC_TRANSACTION.findall(texte):
        champs = {m.group(1).upper(): m.group(2).strip() for m in _CHAMP_OFX.finditer(bloc)}
        date_brute = champs.get("DTPOSTED", "")
        montant_brut = champs.get("TRNAMT")
        if len(date_brute) < 8 or montant_brut is None:
            continue
        try:
            date = datetime.strptime(date_brute[:8], "%Y%m%d").strftime("%Y-%m-%d")
            montant = float(montant_brut)
        except ValueError:
            continue
        libelle = champs.get("NAME") or champs.get("MEMO") or "(sans libellé)"
        fitid = champs.get("FITID") or None
        mouvements.append(MouvementBrut(date=date, libelle=libelle, montant=montant, transaction_id=fitid))
    return mouvements


# ---------------------------------------------------------------------------
# QIF (format Quicken — un enregistrement par bloc séparé par une ligne "^")
# ---------------------------------------------------------------------------


def parse_qif(content: bytes) -> list[MouvementBrut]:
    texte = content.decode("utf-8", errors="replace")
    mouvements: list[MouvementBrut] = []
    date: str | None = None
    montant: float | None = None
    libelle_parts: list[str] = []

    def _cloturer():
        if date is not None and montant is not None:
            mouvements.append(MouvementBrut(date=date, montant=montant, libelle=" ".join(libelle_parts) or "(sans libellé)"))

    for ligne_brute in texte.splitlines():
        ligne = ligne_brute.strip()
        if not ligne:
            continue
        if ligne == "^":
            _cloturer()
            date, montant, libelle_parts = None, None, []
            continue
        code, valeur = ligne[0], ligne[1:].strip()
        if code == "D":
            date = _parser_date_flexible(valeur, prioriser_mois_jour=True)
        elif code in ("T", "U"):
            montant = to_float(valeur)
        elif code in ("P", "M") and valeur:
            libelle_parts.append(valeur)
    _cloturer()  # dernier enregistrement, si le fichier ne se termine pas par "^"
    return [m for m in mouvements if m.date is not None and m.montant is not None]


# ---------------------------------------------------------------------------
# Import unifié : déduplication + catégorisation automatique
# ---------------------------------------------------------------------------


def importer_mouvements(
    db: Session, user_id: int, mouvements: list[MouvementBrut], lignes_ignorees: int = 0, compte: str | None = None
) -> ImportResult:
    budget_categories_service.assurer_categories_par_defaut(db, user_id)
    regles = budget_categories_service.list_regles(db, user_id)
    existants = {
        row[0] for row in db.query(MouvementBancaire.transaction_id).filter(MouvementBancaire.user_id == user_id).all()
    }

    importees = 0
    doublons = 0
    categorisees = 0
    for m in mouvements:
        tx_id = m.transaction_id or _transaction_id_calcule(m.date, m.montant, m.libelle)
        if tx_id in existants:
            doublons += 1
            continue
        categorie_id = budget_categories_service.categorie_correspondante(m.libelle, regles)
        if categorie_id is not None:
            categorisees += 1
        db.add(
            MouvementBancaire(
                user_id=user_id,
                transaction_id=tx_id,
                date=m.date,
                libelle=m.libelle,
                montant=m.montant,
                compte=compte,
                categorie_id=categorie_id,
            )
        )
        existants.add(tx_id)
        importees += 1
    db.commit()

    return ImportResult(
        lignes_lues=len(mouvements) + lignes_ignorees,
        importees=importees,
        doublons_ignores=doublons,
        lignes_ignorees=lignes_ignorees,
        categorisees_automatiquement=categorisees,
    )


def reappliquer_regles(db: Session, user_id: int) -> int:
    """Réapplique les règles à tout mouvement non catégorisé manuellement (cf.
    `MouvementBancaire.categorise_manuellement`) — permet à une règle ajoutée après
    coup de corriger un mouvement déjà catégorisé par une règle plus ancienne, ou
    resté sans catégorie."""
    regles = budget_categories_service.list_regles(db, user_id)
    mouvements = (
        db.query(MouvementBancaire)
        .filter(MouvementBancaire.user_id == user_id, MouvementBancaire.categorise_manuellement.is_(False))
        .all()
    )
    modifies = 0
    for m in mouvements:
        nouvelle = budget_categories_service.categorie_correspondante(m.libelle, regles)
        if nouvelle != m.categorie_id:
            m.categorie_id = nouvelle
            modifies += 1
    db.commit()
    return modifies
