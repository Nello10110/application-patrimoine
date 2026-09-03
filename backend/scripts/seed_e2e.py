#!/usr/bin/env python3
"""Peuple une base SQLite jetable avec un jeu de données déterministe pour la suite
de tests E2E (Playwright, `frontend/e2e/`) — jamais utilisé contre une vraie base.

Toute la donnée métier (comptes, actifs, emprunts, transactions, budget...) est
créée en appelant le VRAI backend HTTP (`--base-url`), déjà démarré sur la base
cible : les mêmes règles de validation qu'un utilisateur réel s'appliquent, ce qui
est en soi une première vérification de cohérence. Seule exception : les cours
(`MarketDataCache`) et la composition d'un fonds (`FundComposition`), qu'aucune
route n'expose en écriture directe (par conception — ces tables ne sont alimentées
que par `market_data_service`/`justetf_service`, jamais par l'utilisateur) : posés
en base directement via les modèles SQLAlchemy de l'application, une fois le compte
et les lignes créés côté API. `PATRIMOINE_DB` doit être positionnée AVANT d'importer
quoi que ce soit sous `app.*`, sur le MÊME fichier que celui ouvert par `--base-url`
(cf. `app/database.py`, qui résout la base une seule fois à l'import du module).

Écrit un résumé JSON (`--out`) — identifiants créés, identifiants/agrégats attendus
— consommé par `frontend/e2e/global-setup.ts` pour piloter les tests sans dupliquer
ces valeurs à la main dans chaque fichier de spécification.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

USERNAME = "e2e_owner"
PASSWORD = "E2eTest1234!"

# Valeurs choisies pour que les agrégats "simples" (sommes) soient calculables à la
# main et verrouillés dans le JSON de sortie — cf. docstring de module. Les agrégats
# qui dépendent d'une formule non triviale (XIRR, amortissement théorique d'emprunt)
# ne sont PAS recalculés ici : `verify_e2e_seed.py` les relit depuis l'API après
# seed et les fige comme valeurs de référence après inspection manuelle, plutôt que
# de réimplémenter ces formules une seconde fois dans ce script.
PRIX_AAPL = 200.0
QUANTITE_AAPL = 10.0
PRIX_REVIENT_AAPL = 150.0

PRIX_FUND = 120.0
QUANTITE_FUND = 5.0
PRIX_REVIENT_FUND = 100.0

PRIX_NVDA = 70.0

VALEUR_APPART = 300000.0
PRIX_REVIENT_APPART = 280000.0
CAPITAL_RESTANT_DU_MANUEL = 240000.0

VALEUR_LIVRET = 15000.0

VALEUR_FINANCIER_ATTENDUE = round(
    QUANTITE_AAPL * PRIX_AAPL + QUANTITE_FUND * PRIX_FUND + 20.0 * PRIX_NVDA, 2
)
PATRIMOINE_NET_ATTENDU = round(
    VALEUR_FINANCIER_ATTENDUE + VALEUR_APPART + VALEUR_LIVRET - CAPITAL_RESTANT_DU_MANUEL, 2
)


def _client(base_url: str) -> httpx.Client:
    return httpx.Client(base_url=base_url, timeout=20.0)


def _iso_il_y_a(jours: int) -> str:
    return (datetime.now(UTC) - timedelta(days=jours)).date().isoformat()


def _enregistrer(client: httpx.Client) -> str:
    r = client.post("/api/auth/register", json={"username": USERNAME, "password": PASSWORD})
    r.raise_for_status()
    token = r.json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    # Assistant de configuration initiale (welcome board) : un compte fraîchement
    # inscrit a `onboarding_termine=False` (cf. `routers/auth.py`) et verrait donc
    # l'assistant à la place de l'application — sans intérêt pour la suite E2E, qui
    # teste les écrans applicatifs, pas ce parcours. Terminé ici via le VRAI endpoint
    # (même philosophie que le reste de ce script), comme le ferait un propriétaire
    # qui vient de configurer son instance.
    r = client.post("/api/auth/onboarding/terminer")
    r.raise_for_status()
    return token


def _creer_detenteurs(client: httpx.Client) -> tuple[int, int]:
    alice = client.post("/api/detenteurs", json={"nom": "Alice", "type": "personne"})
    alice.raise_for_status()
    bob = client.post("/api/detenteurs", json={"nom": "Bob", "type": "personne"})
    bob.raise_for_status()
    return alice.json()["id"], bob.json()["id"]


def _creer_holdings_financiers(client: httpx.Client) -> tuple[int, str, int, str, int]:
    # `compte_nom` (écran Comptes, backlog X.1) : les deux lignes financières
    # partagent un même compte créé à la volée, PEA E2E — exerce un compte
    # multi-lignes, cas d'usage principal des quotités définies au niveau du compte.
    aapl = client.post(
        "/api/portfolio/holdings",
        json={
            "ticker": "E2EAAPL", "quantite": QUANTITE_AAPL, "prix_revient_moyen": PRIX_REVIENT_AAPL,
            "type_actif": "STOCK", "compte_nom": "PEA E2E",
        },
    )
    aapl.raise_for_status()
    fund = client.post(
        "/api/portfolio/holdings",
        json={
            "ticker": "E2EFUND", "quantite": QUANTITE_FUND, "prix_revient_moyen": PRIX_REVIENT_FUND,
            "type_actif": "FUND", "compte_nom": "PEA E2E",
        },
    )
    fund.raise_for_status()
    aapl_j, fund_j = aapl.json(), fund.json()
    return aapl_j["id"], aapl_j["ticker"], fund_j["id"], fund_j["ticker"], aapl_j["compte"]["id"]


def _creer_immobilier(client: httpx.Client) -> tuple[int, str, int]:
    # `compte_nom` : un bien immobilier rattaché à son propre compte structurel —
    # exerce le cas explicitement demandé par l'utilisateur (« compter potentiellement
    # l'immobilier sur un compte »), un compte mono-ligne comme une assurance-vie.
    holding = client.post(
        "/api/portfolio/holdings",
        json={
            "ticker": "E2E-APPART",
            "quantite": 1,
            "prix_revient_moyen": PRIX_REVIENT_APPART,
            "type_actif": "REAL_ESTATE",
            "valeur_estimee": VALEUR_APPART,
            "date_acquisition": _iso_il_y_a(900),
            "compte_nom": "Compte immobilier E2E",
        },
    )
    holding.raise_for_status()
    h = holding.json()

    detail = client.put(
        f"/api/portfolio/holdings/{h['ticker']}/immobilier",
        json={
            "type_location": "nue",
            "loyer_mensuel": 1200.0,
            "charges_mensuelles": 150.0,
            "frais_annuels": 1800.0,
            "surface_m2": 65.0,
            "nb_pieces": 3,
            "annee_construction": 2005,
            "dpe": "D",
        },
    )
    detail.raise_for_status()

    # Deux points d'historique de valorisation datés, en plus de la valeur courante
    # posée à la création — exerce le tableau/graphique d'historique.
    for jours, valeur in ((700, 290000.0), (365, 295000.0)):
        pt = client.put(
            f"/api/portfolio/holdings/{h['ticker']}/valorisation",
            json={"valeur": valeur, "date": _iso_il_y_a(jours)},
        )
        pt.raise_for_status()

    return h["id"], h["ticker"], h["compte"]["id"]


def _creer_epargne(client: httpx.Client) -> tuple[int, str, int]:
    # `compte_nom` : mêmes règles que l'écran Épargne (`AjoutCompteForm`), qui crée
    # toujours un compte 1:1 pour chaque ligne — reproduit ici via l'API directement.
    holding = client.post(
        "/api/portfolio/holdings",
        json={
            "ticker": "E2E-LIVRETA",
            "quantite": 1,
            "type_actif": "REGULATED_SAVINGS",
            "valeur_estimee": VALEUR_LIVRET,
            "taux_pct": 3.0,
            "versement_mensuel": 200.0,
            "date_acquisition": _iso_il_y_a(600),
            "compte_nom": "Livret A E2E",
        },
    )
    holding.raise_for_status()
    h = holding.json()

    for jours, valeur in ((400, 12000.0), (150, 13500.0)):
        pt = client.put(
            f"/api/portfolio/holdings/{h['ticker']}/valorisation",
            json={"valeur": valeur, "date": _iso_il_y_a(jours)},
        )
        pt.raise_for_status()

    return h["id"], h["ticker"], h["compte"]["id"]


def _repartir_quotites(client: httpx.Client, ticker_aapl: str, ticker_appart: str, alice_id: int, bob_id: int) -> None:
    for ticker, part_alice, part_bob in ((ticker_aapl, 60.0, 40.0), (ticker_appart, 50.0, 50.0)):
        r = client.put(
            f"/api/portfolio/holdings/{ticker}/quotites",
            json={"quotites": [{"detenteur_id": alice_id, "quotite_pct": part_alice}, {"detenteur_id": bob_id, "quotite_pct": part_bob}]},
        )
        r.raise_for_status()


def _creer_etablissement(client: httpx.Client) -> int:
    r = client.post("/api/comptes/etablissements", json={"nom": "Banque E2E"})
    r.raise_for_status()
    return r.json()["id"]


def _rattacher_etablissement(client: httpx.Client, compte_pea_id: int, etablissement_id: int) -> None:
    r = client.patch(f"/api/comptes/{compte_pea_id}", json={"etablissement_id": etablissement_id})
    r.raise_for_status()


def _repartir_quotites_compte(client: httpx.Client, compte_pea_id: int, alice_id: int, bob_id: int) -> None:
    # Écran Comptes (backlog X.1) : une seule répartition pour tout le compte PEA E2E
    # (AAPL + FUND) plutôt que ligne par ligne — écrase la quotité 60/40 déjà posée
    # sur AAPL par `_repartir_quotites` ci-dessus (comportement documenté et attendu :
    # la validation remplace la répartition actuellement enregistrée) et pose la
    # même répartition sur FUND, jamais réglée ligne par ligne jusqu'ici.
    r = client.put(
        f"/api/comptes/{compte_pea_id}/quotites",
        json={"quotites": [{"detenteur_id": alice_id, "quotite_pct": 60.0}, {"detenteur_id": bob_id, "quotite_pct": 40.0}]},
    )
    r.raise_for_status()


def _creer_emprunt(client: httpx.Client, holding_appart_id: int) -> int:
    loan = client.post(
        "/api/loans",
        json={
            "libelle": "Prêt appartement E2E",
            "capital_initial": 250000.0,
            "taux_annuel_pct": 3.5,
            "mensualite": 1200.0,
            "date_debut": f"{_iso_il_y_a(900)}T00:00:00",
            "duree_mois": 240,
            "capital_restant_du_manuel": CAPITAL_RESTANT_DU_MANUEL,
        },
    )
    loan.raise_for_status()
    loan_id = loan.json()["id"]
    r = client.patch(f"/api/loans/{loan_id}", json={"holding_id": holding_appart_id})
    r.raise_for_status()
    return loan_id


def _csv_transactions() -> bytes:
    """Grand livre minimal pour le ticker E2ENVDA (distinct des tickers saisis
    manuellement ci-dessus, cf. docstring de module : le grand livre reconstruit
    depuis ce CSV remplacerait une ligne manuelle de même ticker, `origine` faisant
    foi côté serveur — jamais de collision volontaire ici)."""
    achat_dt = f"{_iso_il_y_a(500)}T09:00:00"
    dividende_dt = f"{_iso_il_y_a(200)}T09:00:00"
    lignes = [
        "datetime,date,category,type,asset_class,symbol,name,shares,price,amount,fee,tax,description,transaction_id",
        f"{achat_dt},{achat_dt[:10]},TRADING,BUY,STOCK,E2ENVDA,NVIDIA E2E,20,50,-1000,-1,0,Achat E2E,e2e-tx-buy-1",
        f"{dividende_dt},{dividende_dt[:10]},CASH,DIVIDEND,STOCK,E2ENVDA,NVIDIA E2E,20,,15,0,-2,Dividende E2E,e2e-tx-div-1",
    ]
    return ("\n".join(lignes) + "\n").encode("utf-8")


def _importer_transactions(client: httpx.Client) -> None:
    """Import en deux temps depuis le 03/09/2026 (compte/établissement
    obligatoires) : `/import/apercu` renvoie un `file_token`, `/import` (confirmation)
    n'accepte plus de fichier — un nom de compte/établissement par défaut suffit ici,
    ce script ne vérifie pas l'écran d'aperçu lui-même (couvert par les tests
    Playwright dédiés)."""
    files = {"file": ("releve_e2e.csv", _csv_transactions(), "text/csv")}
    apercu = client.post("/api/transactions/import/apercu", files=files)
    apercu.raise_for_status()
    r = client.post(
        "/api/transactions/import",
        json={"file_token": apercu.json()["file_token"], "etablissement_nom": "Trade Republic E2E"},
    )
    r.raise_for_status()


def _creer_objectif(client: httpx.Client, holding_livret_id: int) -> int:
    r = client.post(
        "/api/objectifs/",
        json={
            "nom": "Fonds d'urgence E2E",
            "type": "precaution",
            "montant_cible": 20000.0,
            "echeance": (datetime.now(UTC) + timedelta(days=700)).date().isoformat(),
            "rendement_hypothese_pct": 2.0,
            "holding_ids": [holding_livret_id],
        },
    )
    r.raise_for_status()
    return r.json()["id"]


def _creer_salaires(client: httpx.Client) -> None:
    annee = datetime.now(UTC).year
    for payload in (
        {
            "annee": annee, "nom": "Salaire Alice", "montant": 45000.0, "type_montant": "brut",
            "periodicite": "annuel", "statut": "cadre", "taux_imposition_pct": 11.0,
        },
        {
            "annee": annee, "nom": "Salaire Bob", "montant": 2200.0, "type_montant": "net",
            "periodicite": "mensuel", "statut": "non_cadre", "taux_imposition_pct": 8.0,
        },
    ):
        r = client.post("/api/salaire/", json=payload)
        r.raise_for_status()


def _csv_mouvements_bancaires() -> bytes:
    """3 mois de mouvements, dates relatives à AUJOURD'HUI (jamais des dates fixes) :
    la détection de charge récurrente (`budget_recurrences_service`) exige un
    libellé identique revu au moins deux fois, dont la dernière occurrence dans les
    45 derniers jours — figer des dates calendaires casserait ce test dès que la
    suite tournerait plus de 45 jours après avoir été écrite."""
    lignes = ["date,libelle,montant,compte"]
    for mois_offset in (0, 1, 2):
        jour_salaire = _iso_il_y_a(mois_offset * 30 + 2)
        jour_loyer = _iso_il_y_a(mois_offset * 30 + 3)
        jour_epargne = _iso_il_y_a(mois_offset * 30 + 4)
        jour_courses = _iso_il_y_a(mois_offset * 30 + 10)
        lignes.append(f"{jour_salaire},Virement salaire,2500.00,Compte courant")
        lignes.append(f"{jour_loyer},Loyer appartement,-1200.00,Compte courant")
        lignes.append(f"{jour_epargne},Virement vers Livret A,-200.00,Compte courant")
        lignes.append(f"{jour_courses},Supermarche Leclerc,-85.30,Compte courant")
    return ("\n".join(lignes) + "\n").encode("utf-8")


def _importer_budget(client: httpx.Client) -> None:
    files = {"file": ("mouvements_e2e.csv", _csv_mouvements_bancaires(), "text/csv")}
    preview = client.post("/api/budget/import/csv/preview", files=files)
    preview.raise_for_status()
    token = preview.json()["file_token"]

    confirm = client.post(
        "/api/budget/import/csv/confirm",
        json={
            "file_token": token,
            "date_col": "date",
            "libelle_col": "libelle",
            "montant_col": "montant",
            "compte": "Compte courant",
        },
    )
    confirm.raise_for_status()

    categories = client.get("/api/budget/categories")
    categories.raise_for_status()
    categorie_logement = next(c["id"] for c in categories.json() if c["nom"] == "Logement")
    categorie_epargne = next(c["id"] for c in categories.json() if c["nom"] == "Épargne")

    regle = client.post("/api/budget/regles", json={"motif": "loyer", "categorie_id": categorie_logement})
    regle.raise_for_status()
    reappliquer = client.post("/api/budget/regles/reappliquer")
    reappliquer.raise_for_status()

    # Catégorisation manuelle d'un mouvement (backlog § N.1 : distincte d'une
    # catégorisation par règle, cf. `categorise_manuellement`) — exerce le menu
    # déroulant par ligne de `MouvementsSection` en plus de la règle en masse.
    mouvements = client.get(
        "/api/budget/mouvements",
        params={"date_debut": _iso_il_y_a(95), "date_fin": _iso_il_y_a(0)},
    )
    mouvements.raise_for_status()
    mouvement_epargne = next(m for m in mouvements.json() if m["libelle"] == "Virement vers Livret A")
    categoriser = client.patch(
        f"/api/budget/mouvements/{mouvement_epargne['id']}",
        json={"categorie_id": categorie_epargne},
    )
    categoriser.raise_for_status()


def _seed_market_data(db_path: str) -> None:
    """Cours et composition posés directement en base (cf. docstring de module) —
    `PATRIMOINE_DB` doit être positionnée avant tout import sous `app.*`."""
    import os

    os.environ["PATRIMOINE_DB"] = db_path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    from app.database import SessionLocal  # noqa: PLC0415
    from app.models import FundComposition, MarketDataCache  # noqa: PLC0415

    db = SessionLocal()
    try:
        db.add_all(
            [
                MarketDataCache(
                    ticker="E2EAAPL", nom="Apple E2E", prix_actuel=PRIX_AAPL, devise="EUR",
                    secteur="Technology", pays="United States", region="Amérique du Nord",
                ),
                MarketDataCache(
                    ticker="E2EFUND", nom="Fonds E2E Monde", prix_actuel=PRIX_FUND, devise="EUR",
                ),
                MarketDataCache(
                    ticker="E2ENVDA", nom="NVIDIA E2E", prix_actuel=PRIX_NVDA, devise="EUR",
                    secteur="Technology", pays="United States", region="Amérique du Nord",
                ),
            ]
        )
        db.add_all(
            [
                FundComposition(ticker="E2EFUND", type="geo", categorie="Europe", poids=0.6, source="composition"),
                FundComposition(ticker="E2EFUND", type="geo", categorie="Amérique du Nord", poids=0.4, source="composition"),
                FundComposition(
                    ticker="E2EFUND", type="sector", categorie="Technologies de l'information",
                    poids=1.0, source="composition",
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="URL du backend E2E déjà démarré (ex. http://127.0.0.1:8010)")
    parser.add_argument("--db", required=True, help="Chemin du fichier SQLite ouvert par ce même backend")
    parser.add_argument("--out", required=True, help="Chemin du fichier JSON de résumé à écrire")
    args = parser.parse_args()

    client = _client(args.base_url)
    _enregistrer(client)
    alice_id, bob_id = _creer_detenteurs(client)
    etablissement_id = _creer_etablissement(client)
    holding_aapl_id, ticker_aapl, holding_fund_id, ticker_fund, compte_pea_id = _creer_holdings_financiers(client)
    holding_appart_id, ticker_appart, compte_immobilier_id = _creer_immobilier(client)
    holding_livret_id, ticker_livret, compte_livret_id = _creer_epargne(client)
    _rattacher_etablissement(client, compte_pea_id, etablissement_id)
    _repartir_quotites(client, ticker_aapl, ticker_appart, alice_id, bob_id)
    _repartir_quotites_compte(client, compte_pea_id, alice_id, bob_id)
    loan_id = _creer_emprunt(client, holding_appart_id)
    _importer_transactions(client)
    objectif_id = _creer_objectif(client, holding_livret_id)
    _creer_salaires(client)
    _importer_budget(client)
    client.close()

    _seed_market_data(args.db)

    resume = {
        "username": USERNAME,
        "password": PASSWORD,
        "detenteurs": {"alice_id": alice_id, "bob_id": bob_id},
        "holdings": {
            "aapl": {"id": holding_aapl_id, "ticker": ticker_aapl},
            "fund": {"id": holding_fund_id, "ticker": ticker_fund},
            "appartement": {"id": holding_appart_id, "ticker": ticker_appart},
            "livret": {"id": holding_livret_id, "ticker": ticker_livret},
        },
        "etablissement_id": etablissement_id,
        "comptes": {
            "pea": {"id": compte_pea_id, "nom": "PEA E2E"},
            "immobilier": {"id": compte_immobilier_id, "nom": "Compte immobilier E2E"},
            "livret": {"id": compte_livret_id, "nom": "Livret A E2E"},
        },
        "loan_id": loan_id,
        "objectif_id": objectif_id,
        "attendu": {
            "valeur_financiere": VALEUR_FINANCIER_ATTENDUE,
            "patrimoine_net": PATRIMOINE_NET_ATTENDU,
            "capital_restant_du_manuel": CAPITAL_RESTANT_DU_MANUEL,
            "valeur_appartement": VALEUR_APPART,
            "valeur_livret": VALEUR_LIVRET,
        },
    }
    Path(args.out).write_text(json.dumps(resume, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Seed E2E terminé : {args.out}")


if __name__ == "__main__":
    main()
