"""Déclaration de patrimoine PDF paramétrable (backlog 2.Q.2) — destinée à un tiers
concret (banque pour un prêt, notaire pour une donation), à la différence du relevé
PDF monolithique existant (§ D.1, `services/pdf_export_service.py`) : sélection
actif par actif de ce qui figure au document, filtrage par détenteur, et reprise du
profil (revenus/dépenses/taux d'imposition) pour le taux d'endettement et le reste
à vivre attendus par un prêteur. Réutilise telles quelles les fonctions de calcul
déjà exposées ailleurs (`analysis_service`, `detenteurs_service`, `loan_service`,
`objectifs_service`, `budget_service`) — ce module ne fait que sélectionner et
mettre en forme, jamais de nouveau calcul métier."""

from datetime import date, datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from ..models import Detenteur, Holding, Loan
from . import analysis_service, budget_service, detenteurs_service, loan_service, objectifs_service, preferences_service
from .csv_export import formater_nombre

_COULEUR_FILET = colors.HexColor("#e2e8f0")


def _avec_separateurs_milliers(nombre: str) -> str:
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


def _date_fr(d: datetime | date | None) -> str:
    return d.strftime("%d/%m/%Y") if d else "date inconnue"


def _methode_valorisation(v: analysis_service.ValuedHolding) -> str:
    """Méthode de valorisation de CETTE ligne (backlog 2.Q.2, exigence explicite du
    document : jamais un chiffre présenté sans dire d'où il vient)."""
    h = v.holding
    if h.valeur_estimee is not None:
        return f"Valeur estimée déclarée le {_date_fr(h.date_valeur_estimee)}"
    if v.a_des_donnees:
        md = h.market_data
        return f"Cours de marché au {_date_fr(md.derniere_maj if md else None)}"
    return "Prix de revient (non coté)"


def _table(lignes: list[tuple[str, str]] | list[tuple[str, str, str]], largeurs: list[float]) -> Table:
    table = Table(lignes, colWidths=[largeur * cm for largeur in largeurs])
    table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, _COULEUR_FILET),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def _pied_de_page(canvas, doc) -> None:
    """Pagination (exigence explicite du backlog 2.Q.2) : numéro de page en bas,
    absent du relevé PDF existant (§ D.1) — un document tenant sur une page n'en
    avait pas besoin, une déclaration détaillée multi-pages si."""
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawString(2 * cm, 1.3 * cm, f"Généré le {date.today().strftime('%d/%m/%Y')} par Application Patrimoine")
    canvas.drawRightString(A4[0] - 2 * cm, 1.3 * cm, f"Page {doc.page}")
    canvas.restoreState()


def generer_pdf_declaration(
    db: Session,
    user_id: int,
    *,
    holding_ids: list[int] | None,
    loan_ids: list[int] | None,
    detenteur_id: int | None,
    destinataire: str | None,
    inclure_profil: bool,
) -> bytes:
    """`holding_ids`/`loan_ids` à `None` = toutes les lignes du foyer ; une liste
    (même vide) restreint explicitement la sélection — c'est la différence entre
    "tout" et "rien coché", qu'une liste vide par défaut confondrait.

    `detenteur_id` : ne montre que les actifs/emprunts avec une quotité attribuée à
    CE détenteur (`detenteurs_service.compute_parts`), valorisés à sa part — un actif
    non réparti (100 % foyer implicite) n'apparaît donc dans AUCUNE déclaration
    individuelle, seulement dans la déclaration foyer entier (même règle que
    `patrimoine_service.compute_patrimoine_net`, § 3.11). Un emprunt non rattaché à
    un actif (backlog 2.M.2, rattachement simple) ne peut être imputé à aucun
    détenteur et n'apparaît alors que dans la déclaration foyer entier."""
    holdings_query = db.query(Holding).filter(Holding.user_id == user_id)
    if holding_ids is not None:
        holdings_query = holdings_query.filter(Holding.id.in_(holding_ids))
    holdings = holdings_query.all()
    valued = analysis_service.value_holdings(holdings)

    loans_query = db.query(Loan).filter(Loan.user_id == user_id)
    if loan_ids is not None:
        loans_query = loans_query.filter(Loan.id.in_(loan_ids))
    loans = loans_query.all()

    detenteur = db.get(Detenteur, detenteur_id) if detenteur_id is not None else None

    lignes_actifs: list[tuple[Holding, float, str]] = []
    for v in valued:
        if detenteur_id is not None:
            part = detenteurs_service.compute_parts(db, v.holding, v.valeur).get(detenteur_id)
            if part is None:
                continue
            valeur_affichee = part["part_detenue"]
        else:
            valeur_affichee = v.valeur
        lignes_actifs.append((v.holding, valeur_affichee, _methode_valorisation(v)))
    total_actifs = sum(valeur for _, valeur, _ in lignes_actifs)

    lignes_passifs: list[tuple[Loan, float]] = []
    if detenteur_id is not None:
        for v in valued:
            # `loans` est déjà filtré sur `loan_ids` ci-dessus : cette recherche ne
            # considère donc que les emprunts explicitement sélectionnés.
            emprunt = next((loan for loan in loans if loan.holding_id == v.holding.id), None)
            if emprunt is None:
                continue
            part = detenteurs_service.compute_parts(db, v.holding, v.valeur).get(detenteur_id)
            if part is None:
                continue
            part_dette = round(part["part_detenue"] - part["part_nette"], 2)
            if part_dette > 0:
                lignes_passifs.append((emprunt, part_dette))
    else:
        lignes_passifs = [(loan, loan_service.compute_capital_restant_du(loan)) for loan in loans]
    total_passifs = sum(valeur for _, valeur in lignes_passifs)

    styles = getSampleStyleSheet()
    tampon = BytesIO()
    doc = SimpleDocTemplate(tampon, pagesize=A4, topMargin=2 * cm, bottomMargin=2.2 * cm, leftMargin=2 * cm, rightMargin=2 * cm)
    elements = []

    elements.append(Paragraph("Déclaration de patrimoine", styles["Title"]))
    elements.append(Paragraph(f"Situation au {date.today().strftime('%d/%m/%Y')}", styles["Normal"]))
    if destinataire:
        elements.append(Paragraph(f"Destinataire : {destinataire}", styles["Normal"]))
    if detenteur:
        elements.append(Paragraph(f"Détenteur : {detenteur.nom}", styles["Normal"]))
    elements.append(Spacer(1, 0.6 * cm))

    elements.append(Paragraph("Actifs déclarés", styles["Heading2"]))
    if lignes_actifs:
        entetes = [("Actif", "Méthode de valorisation", "Valeur")]
        lignes = entetes + [(h.nom or h.ticker, methode, _euros(valeur)) for h, valeur, methode in lignes_actifs]
        elements.append(_table(lignes, [6, 6, 3.5]))
    else:
        elements.append(Paragraph("Aucun actif sélectionné.", styles["Normal"]))
    elements.append(Spacer(1, 0.5 * cm))

    elements.append(Paragraph("Passifs déclarés", styles["Heading2"]))
    if lignes_passifs:
        entetes = [("Emprunt", "Capital restant dû")]
        lignes = entetes + [(loan.libelle, _euros(valeur)) for loan, valeur in lignes_passifs]
        elements.append(_table(lignes, [10, 5.5]))
    else:
        elements.append(Paragraph("Aucun passif déclaré.", styles["Normal"]))
    elements.append(Spacer(1, 0.5 * cm))

    elements.append(Paragraph("Synthèse", styles["Heading2"]))
    elements.append(
        _table(
            [
                ("Actifs déclarés", _euros(total_actifs)),
                ("Passifs déclarés", _euros(total_passifs)),
                ("Patrimoine net déclaré", _euros(total_actifs - total_passifs)),
            ],
            [10, 5.5],
        )
    )

    if inclure_profil:
        elements.append(Spacer(1, 0.5 * cm))
        elements.append(Paragraph("Profil emprunteur", styles["Heading2"]))
        indicateurs = objectifs_service.compute_indicateurs_situation(db, user_id)
        aujourdhui = date.today()
        jonction = budget_service.compute_jonction_patrimoine(
            db, user_id, aujourdhui.replace(day=1).isoformat(), aujourdhui.isoformat()
        )
        taux_imposition = _taux_imposition_saisi(db, user_id)
        elements.append(
            _table(
                [
                    ("Revenus nets mensuels moyens (3 derniers mois)", _euros(indicateurs["revenus_nets_mensuels_moyens"])),
                    ("Dépenses mensuelles moyennes (3 derniers mois)", _euros(indicateurs["depenses_mensuelles_moyennes"])),
                    ("Mensualités d'emprunt totales", _euros(indicateurs["mensualites_totales"])),
                    ("Taux d'endettement", _pourcentage(indicateurs["taux_endettement_pct"])),
                    ("Reste à vivre (mois en cours)", _euros(jonction["reste_a_vivre"])),
                    ("Taux d'imposition déclaré", _pourcentage(taux_imposition)),
                ],
                [10, 5.5],
            )
        )
        elements.append(Spacer(1, 0.2 * cm))
        elements.append(
            Paragraph(
                "Taux d'imposition saisi par l'utilisateur, repris tel quel — l'application ne réalise aucun calcul fiscal.",
                styles["Normal"],
            )
        )

    doc.build(elements, onFirstPage=_pied_de_page, onLaterPages=_pied_de_page)
    return tampon.getvalue()


def _taux_imposition_saisi(db: Session, user_id: int) -> float | None:
    return preferences_service.lire_taux_imposition_pct(db, user_id)
