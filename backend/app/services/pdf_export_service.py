"""Génère le relevé de patrimoine PDF (roadmap Phase 3, § D.1) — une photographie
datée du patrimoine net, de sa répartition par classe d'actif et par compte, et de
la rentabilité globale du portefeuille financier. Réutilise telles quelles les
fonctions de calcul déjà exposées par les écrans existants (`patrimoine_service`,
`performance_service`, `analysis_service`) : ce module ne calcule rien lui-même,
il se contente d'une mise en forme PDF de données déjà validées ailleurs."""

from datetime import date
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from . import analysis_service, patrimoine_service, performance_service
from .analysis_service import COMPTE_SANS_ANNOTATION
from .csv_export import formater_nombre

_COULEUR_FILET = colors.HexColor("#e2e8f0")  # slate-200, cohérent avec l'identité visuelle du frontend


def _avec_separateurs_milliers(nombre: str) -> str:
    """Insère l'espace séparateur de milliers français (absent de `formater_nombre`,
    dont le format brut convient au CSV mais pas à un document destiné à être lu)."""
    signe, chiffres = ("-", nombre[1:]) if nombre.startswith("-") else ("", nombre)
    groupes = []
    while len(chiffres) > 3:
        groupes.insert(0, chiffres[-3:])
        chiffres = chiffres[:-3]
    groupes.insert(0, chiffres)
    return signe + " ".join(groupes)


def _euros(valeur: float | None) -> str:
    formate = formater_nombre(valeur, 0)
    return f"{_avec_separateurs_milliers(formate)} €" if formate else "—"


def _pourcentage(valeur: float | None) -> str:
    formate = formater_nombre(valeur, 1)
    return f"{formate} %" if formate else "—"


def _table_deux_colonnes(lignes: list[tuple[str, str]]) -> Table:
    table = Table(lignes, colWidths=[10 * cm, 5 * cm])
    table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, _COULEUR_FILET),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ]
        )
    )
    return table


def generer_pdf_patrimoine(db: Session) -> bytes:
    """Construit le PDF en mémoire (jamais écrit sur disque) et renvoie son contenu
    binaire — l'appelant (`routers/export.py`) le sert directement en réponse HTTP,
    comme les exports CSV existants."""
    styles = getSampleStyleSheet()
    tampon = BytesIO()
    doc = SimpleDocTemplate(
        tampon, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm
    )
    elements = []

    elements.append(Paragraph("Relevé de patrimoine", styles["Title"]))
    elements.append(Paragraph(f"Situation au {date.today().strftime('%d/%m/%Y')}", styles["Normal"]))
    elements.append(Spacer(1, 0.6 * cm))

    patrimoine = patrimoine_service.compute_patrimoine_net(db)
    elements.append(Paragraph("Patrimoine net", styles["Heading2"]))
    elements.append(
        _table_deux_colonnes(
            [
                ("Actifs totaux", _euros(patrimoine["actifs_totaux"])),
                ("Passifs (emprunts)", _euros(patrimoine["passifs_totaux"])),
                ("Patrimoine net", _euros(patrimoine["patrimoine_net"])),
            ]
        )
    )
    elements.append(Spacer(1, 0.5 * cm))

    if patrimoine["repartition_par_classe"]:
        elements.append(Paragraph("Répartition par classe d'actif", styles["Heading2"]))
        elements.append(
            _table_deux_colonnes([(item["categorie"], _euros(item["valeur"])) for item in patrimoine["repartition_par_classe"]])
        )
        elements.append(Spacer(1, 0.5 * cm))

    performance = performance_service.compute_performance(db)
    if performance["nombre_transactions"] > 0:
        elements.append(Paragraph("Rentabilité globale (portefeuille financier)", styles["Heading2"]))
        elements.append(
            _table_deux_colonnes(
                [
                    ("Valeur des positions", _euros(performance["valeur_positions"])),
                    ("Coût total investi", _euros(performance["cout_total_investi"])),
                    ("Gain / perte total", _euros(performance["gain_perte_total"])),
                    ("Rendement annualisé", _pourcentage(performance["rendement_annualise_pct"])),
                    ("Dividendes perçus", _euros(performance["dividendes_percus"])),
                    ("Gains réalisés", _euros(performance["gains_realises"])),
                ]
            )
        )
        elements.append(Spacer(1, 0.5 * cm))

    holdings = analysis_service.holdings_financiers(db)
    valued = analysis_service.value_holdings(holdings)
    comptes = analysis_service.repartition_par_compte(valued)
    a_des_comptes_annotes = any(c["compte"] != COMPTE_SANS_ANNOTATION for c in comptes)
    if a_des_comptes_annotes:
        elements.append(Paragraph("Répartition par compte", styles["Heading2"]))
        elements.append(_table_deux_colonnes([(c["compte"], _euros(c["valeur"])) for c in comptes]))

    doc.build(elements)
    return tampon.getvalue()
