"""Robustesse des deux flux d'import de fichier (relevé de positions et grand
livre de transactions) : caractère transactionnel de l'import de relevé (LOT 3.3),
purge des fichiers en attente au bout de 30 minutes (LOT 3.5), plafond de taille
(LOT 3.6) et validation des colonnes mappées avant de commencer l'import (LOT 7.4).
"""

from datetime import datetime, timedelta, timezone

import pandas as pd

from app.models import ORIGINE_MANUEL, ORIGINE_RECONSTRUIT, Compte, Etablissement, Holding
from app.services import comptes_service, csv_import, transaction_import, upload_limits

from .conftest import ID_UTILISATEUR_TEST, make_holding

CSV_VALIDE = (
    "ticker,quantite\n"
    "AAA,10\n"
    "BBB,5\n"
    "CCC,3\n"
).encode("utf-8")


def _uploader_preview(client, contenu: bytes = CSV_VALIDE, nom: str = "portefeuille.csv"):
    reponse = client.post(
        "/api/portfolio/import/preview",
        files={"file": (nom, contenu, "text/csv")},
    )
    assert reponse.status_code == 200, reponse.text
    return reponse.json()


# ---------------------------------------------------------------------------
# 3.3 — import de relevé transactionnel : tout ou rien
# ---------------------------------------------------------------------------


def test_import_confirm_erreur_en_cours_de_boucle_ne_modifie_pas_le_portefeuille(client, db, monkeypatch):
    # Portefeuille initial, qui ne doit pas bouger si l'import échoue en cours de route.
    make_holding(db, ticker="EXIST", quantite=7.0, prix_revient_moyen=42.0)

    preview = _uploader_preview(client)

    appels = {"n": 0}
    original_to_float = csv_import.to_float

    def to_float_defaillant(valeur):
        appels["n"] += 1
        if appels["n"] == 2:  # 2e ligne (BBB) : simule un bug inattendu pendant le traitement
            raise RuntimeError("panne simulée pendant l'import")
        return original_to_float(valeur)

    monkeypatch.setattr(csv_import, "to_float", to_float_defaillant)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={
            "file_token": preview["file_token"],
            "ticker_col": "ticker",
            "quantite_col": "quantite",
            "replace_existing": True,
        },
    )

    assert reponse.status_code == 400
    assert "modifié" in reponse.json()["detail"] or "portefeuille" in reponse.json()["detail"].lower()

    # Le portefeuille initial est intact : ni vidé, ni partiellement réécrit.
    holdings = db.query(Holding).all()
    assert len(holdings) == 1
    assert holdings[0].ticker == "EXIST"
    assert holdings[0].quantite == 7.0


def test_import_confirm_cas_nominal_remplace_le_portefeuille(client, db):
    """`replace_existing` remplace les lignes gérées par l'utilisateur (saisie ou
    relevé précédemment importé) — cf. le test dédié plus bas pour la préservation
    des positions issues du grand livre."""
    make_holding(db, ticker="EXIST", quantite=7.0, origine=ORIGINE_MANUEL)

    preview = _uploader_preview(client)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={
            "file_token": preview["file_token"],
            "ticker_col": "ticker",
            "quantite_col": "quantite",
            "replace_existing": True,
        },
    )

    assert reponse.status_code == 200
    body = reponse.json()
    assert body["imported"] == 3
    assert body["skipped"] == 0

    tickers = {h.ticker for h in db.query(Holding).all()}
    assert tickers == {"AAA", "BBB", "CCC"}


# ---------------------------------------------------------------------------
# 7.4 — colonnes de mapping non validées
# ---------------------------------------------------------------------------


def test_import_confirm_colonne_ticker_introuvable_refuse_en_400(client):
    preview = _uploader_preview(client)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={
            "file_token": preview["file_token"],
            "ticker_col": "colonne_qui_nexiste_pas",
            "quantite_col": "quantite",
            "replace_existing": False,
        },
    )

    assert reponse.status_code == 400
    assert "colonne_qui_nexiste_pas" in reponse.json()["detail"]


def test_import_confirm_colonne_optionnelle_introuvable_refuse_en_400(client):
    preview = _uploader_preview(client)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={
            "file_token": preview["file_token"],
            "ticker_col": "ticker",
            "quantite_col": "quantite",
            "compte_col": "compte_absent",
            "replace_existing": False,
        },
    )

    assert reponse.status_code == 400
    assert "compte_absent" in reponse.json()["detail"]


def test_import_confirm_colonnes_valides_acceptees(client):
    preview = _uploader_preview(client)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={
            "file_token": preview["file_token"],
            "ticker_col": "ticker",
            "quantite_col": "quantite",
            "replace_existing": False,
        },
    )
    assert reponse.status_code == 200


# ---------------------------------------------------------------------------
# Refonte import (05/09/2026) — établissement obligatoire pour un compte CRÉÉ à la
# volée depuis la colonne Compte, alignement sur la même règle déjà appliquée à
# l'import du grand livre de transactions et à `CompteCreate`.
# ---------------------------------------------------------------------------

CSV_AVEC_COMPTE = (
    "ticker,quantite,compte\n"
    "AAA,10,PEA Boursorama\n"
).encode("utf-8")


def test_import_confirm_nouveau_compte_sans_etablissement_refuse_en_400(client):
    preview = _uploader_preview(client, CSV_AVEC_COMPTE)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={
            "file_token": preview["file_token"],
            "ticker_col": "ticker",
            "quantite_col": "quantite",
            "compte_col": "compte",
            "replace_existing": False,
        },
    )

    assert reponse.status_code == 400
    assert "Établissement requis" in reponse.json()["detail"]
    assert "PEA Boursorama" in reponse.json()["detail"]


def test_import_confirm_nouveau_compte_avec_etablissement_cree_le_compte_rattache(client, db):
    etablissement = comptes_service.create_etablissement(db, ID_UTILISATEUR_TEST, "Boursorama")
    preview = _uploader_preview(client, CSV_AVEC_COMPTE)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={
            "file_token": preview["file_token"],
            "ticker_col": "ticker",
            "quantite_col": "quantite",
            "compte_col": "compte",
            "etablissement_id": etablissement.id,
            "replace_existing": False,
        },
    )

    assert reponse.status_code == 200, reponse.text
    compte = db.query(Compte).filter(Compte.user_id == ID_UTILISATEUR_TEST, Compte.nom == "PEA Boursorama").first()
    assert compte is not None
    assert compte.etablissement_id == etablissement.id


def test_import_transactions_nouvel_etablissement_avec_logo_key(client, db):
    """Refonte import (05/09/2026) : `etablissement_logo_key` transmis à la création
    d'un nouvel établissement pendant l'import du grand livre (catalogue
    d'établissements connus, badge affiché côté frontend)."""
    from datetime import UTC, datetime

    token = "token-grand-livre-logo"
    transaction_import._PENDING_TRANSACTIONS[token] = (transaction_import.ParsedTransactions(), datetime.now(UTC))

    reponse = client.post(
        "/api/transactions/import",
        json={"file_token": token, "etablissement_nom": "Trade Republic", "etablissement_logo_key": "trade_republic"},
    )

    assert reponse.status_code == 200, reponse.text
    etablissement = db.query(Etablissement).filter(Etablissement.user_id == ID_UTILISATEUR_TEST, Etablissement.nom == "Trade Republic").first()
    assert etablissement is not None
    assert etablissement.logo_key == "trade_republic"


def test_import_confirm_compte_deja_existant_sans_etablissement_fourni_fonctionne(client, db):
    """Pas de régression : un compte déjà existant sous ce nom continue de
    fonctionner sans qu'un établissement soit fourni à cet import (son
    établissement actuel, s'il en a un, ne change pas ici)."""
    comptes_service.create_compte(db, ID_UTILISATEUR_TEST, "PEA Boursorama", None)
    preview = _uploader_preview(client, CSV_AVEC_COMPTE)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={
            "file_token": preview["file_token"],
            "ticker_col": "ticker",
            "quantite_col": "quantite",
            "compte_col": "compte",
            "replace_existing": False,
        },
    )

    assert reponse.status_code == 200, reponse.text


# ---------------------------------------------------------------------------
# 3.6 — taille des fichiers importés bornée
# ---------------------------------------------------------------------------


def test_import_preview_fichier_trop_volumineux_refuse_en_413(client, monkeypatch):
    monkeypatch.setattr(upload_limits, "TAILLE_MAX_IMPORT_OCTETS", 100)
    contenu = ("ticker,quantite\n" + "AAA,1\n" * 50).encode("utf-8")
    assert len(contenu) > 100

    reponse = client.post(
        "/api/portfolio/import/preview",
        files={"file": ("gros_fichier.csv", contenu, "text/csv")},
    )
    assert reponse.status_code == 413


def test_import_preview_fichier_taille_normale_acceptee(client):
    reponse = client.post(
        "/api/portfolio/import/preview",
        files={"file": ("portefeuille.csv", CSV_VALIDE, "text/csv")},
    )
    assert reponse.status_code == 200


def test_import_transactions_fichier_trop_volumineux_refuse_en_413(client, monkeypatch):
    """Le contrôle de taille se fait à l'étape d'APERÇU (revue du 03/09/2026, import
    du grand livre en deux temps) — `/import` (confirmation) ne reçoit plus de
    fichier, juste un `file_token` déjà validé."""
    monkeypatch.setattr(upload_limits, "TAILLE_MAX_IMPORT_OCTETS", 50)
    contenu = b"transaction_id,datetime,date,category,type,asset_class,symbol,name,shares,price,amount,fee,tax,description,mcc_code\n"
    assert len(contenu) > 50

    reponse = client.post(
        "/api/transactions/import/apercu",
        files={"file": ("grand_livre.csv", contenu, "text/csv")},
    )
    assert reponse.status_code == 413


# ---------------------------------------------------------------------------
# 3.5 — expiration des fichiers en attente d'import (30 minutes)
# ---------------------------------------------------------------------------


def test_get_pending_token_expire_renvoie_message_existant():
    parsed = csv_import.parse_upload("portefeuille.csv", CSV_VALIDE)

    # Fait vieillir artificiellement l'entrée au-delà de la durée d'expiration.
    df, _depose_le = csv_import._PENDING_IMPORTS[parsed.token]
    trop_vieux = datetime.now(timezone.utc) - csv_import.DUREE_EXPIRATION_PENDING - timedelta(seconds=1)
    csv_import._PENDING_IMPORTS[parsed.token] = (df, trop_vieux)

    try:
        csv_import.get_pending(parsed.token)
        assert False, "devait lever KeyError"
    except KeyError as exc:
        assert "introuvable ou expiré" in str(exc)


def test_get_pending_token_non_expire_fonctionne():
    parsed = csv_import.parse_upload("portefeuille.csv", CSV_VALIDE)
    df = csv_import.get_pending(parsed.token)
    assert list(df.columns) == ["ticker", "quantite"]


def test_import_confirm_token_expire_via_api_renvoie_404(client):
    preview = _uploader_preview(client)
    token = preview["file_token"]

    df, _depose_le = csv_import._PENDING_IMPORTS[token]
    trop_vieux = datetime.now(timezone.utc) - csv_import.DUREE_EXPIRATION_PENDING - timedelta(seconds=1)
    csv_import._PENDING_IMPORTS[token] = (df, trop_vieux)

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={"file_token": token, "ticker_col": "ticker", "quantite_col": "quantite", "replace_existing": False},
    )
    assert reponse.status_code == 404
    assert "introuvable ou expiré" in reponse.json()["detail"]


def test_remplacer_existant_epargne_les_lignes_du_grand_livre(db, client, monkeypatch):
    """« Remplacer le portefeuille existant » ne concerne que la partie que
    l'utilisateur gère lui-même : une position issue du grand livre de transactions
    appartient au grand livre et doit survivre à l'import d'un relevé de positions —
    la supprimer créerait un état que le prochain import rétablirait tout seul."""
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="RECONSTRUIT", quantite=5.0, prix_revient_moyen=10.0, origine=ORIGINE_RECONSTRUIT))
    db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker="MANUELLE", quantite=3.0, prix_revient_moyen=20.0, origine=ORIGINE_MANUEL))
    db.commit()

    df = pd.DataFrame({"Ticker": ["NOUVELLE"], "Qte": [7.0]})
    token = "token-remplacement"
    monkeypatch.setattr(csv_import, "_PENDING_IMPORTS", {token: (df, datetime.now(timezone.utc))})

    reponse = client.post(
        "/api/portfolio/import/confirm",
        json={"file_token": token, "ticker_col": "Ticker", "quantite_col": "Qte", "replace_existing": True},
    )
    assert reponse.status_code == 200

    tickers = {h.ticker for h in db.query(Holding).all()}
    assert tickers == {"RECONSTRUIT", "NOUVELLE"}
