"""Endpoints d'import Ledger (`POST /api/transactions/import-ledger/apercu` et
`POST /api/transactions/import-ledger`, retour utilisateur du 11/09/2026) — même
esprit que `test_transaction_import_resynchronisation.py`, format Ledger."""

from app.models import Compte, Etablissement, Transaction

from .conftest import ID_UTILISATEUR_TEST

EN_TETE = (
    "Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,"
    "Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export"
)


def _ligne(hash_: str = "0xabc", ticker: str = "BTC", type_: str = "IN", montant: str = "0.001", countervalue: str = "37.80") -> str:
    return f"2024-01-19T10:26:23.000Z,Confirmed,{ticker},{type_},{montant},0.0001,{hash_},Bitcoin,xpub123,EUR,{countervalue},40.00"


def _csv(*lignes: str) -> bytes:
    return "\n".join([EN_TETE, *lignes]).encode("utf-8")


def _apercu(client, contenu: bytes) -> dict:
    return client.post("/api/transactions/import-ledger/apercu", files={"file": ("ledger.csv", contenu, "text/csv")}).json()


def _confirmer(client, contenu: bytes, devises: list[str] | None = None, **overrides):
    apercu = _apercu(client, contenu)
    payload = {
        "file_token": apercu["file_token"],
        "etablissement_nom": "Ledger",
        "devises_selectionnees": devises if devises is not None else [d["ticker"] for d in apercu["devises"]],
        **overrides,
    }
    return client.post("/api/transactions/import-ledger", json=payload)


def test_apercu_liste_les_devises_et_les_etablissements(client):
    corps = _apercu(client, _csv(_ligne(hash_="0x1", ticker="BTC"), _ligne(hash_="0x2", ticker="ETH")))

    tickers = {d["ticker"] for d in corps["devises"]}
    assert tickers == {"BTC", "ETH"}
    assert corps["lignes_lues"] == 2
    assert corps["etablissements"] == []


def test_confirmer_cree_un_etablissement_et_un_compte_ledger(client, db):
    reponse = _confirmer(client, _csv(_ligne()))

    corps = reponse.json()
    assert corps["importees"] == 1
    assert corps["comptes_crees"] == 1

    etablissement = db.query(Etablissement).filter(Etablissement.user_id == ID_UTILISATEUR_TEST).one()
    assert etablissement.nom == "Ledger"
    compte = db.query(Compte).filter(Compte.user_id == ID_UTILISATEUR_TEST).one()
    assert compte.nom == "Ledger"
    assert compte.etablissement_id == etablissement.id


def test_confirmer_sans_devise_selectionnee_est_refuse(client):
    apercu = _apercu(client, _csv(_ligne()))

    reponse = client.post(
        "/api/transactions/import-ledger",
        json={"file_token": apercu["file_token"], "etablissement_nom": "Ledger", "devises_selectionnees": []},
    )

    assert reponse.status_code == 400


def test_decocher_une_devise_lexclut_de_limport(client, db):
    reponse = _confirmer(client, _csv(_ligne(hash_="0x1", ticker="BTC"), _ligne(hash_="0x2", ticker="ETH")), devises=["BTC"])

    assert reponse.json()["importees"] == 1
    symboles = {t.symbol for t in db.query(Transaction).filter(Transaction.user_id == ID_UTILISATEUR_TEST).all()}
    assert symboles == {"BTC"}


def test_position_crypto_apparait_dans_le_portefeuille_apres_import(client):
    _confirmer(client, _csv(_ligne(ticker="BTC", montant="0.001", countervalue="37.80")))

    holdings = client.get("/api/portfolio/holdings").json()
    assert len(holdings) == 1
    assert holdings[0]["ticker"] == "BTC"
    assert holdings[0]["type_actif"] == "CRYPTO"
    assert holdings[0]["origine"] == "reconstruit"
    assert holdings[0]["quantite"] == 0.001


def test_reimport_du_meme_fichier_ne_duplique_pas(client, db):
    contenu = _csv(_ligne(hash_="0x1"))
    _confirmer(client, contenu)

    reponse = _confirmer(client, contenu)

    corps = reponse.json()
    assert corps["importees"] == 0
    assert corps["doublons_ignores"] == 1
    assert db.query(Transaction).filter(Transaction.user_id == ID_UTILISATEUR_TEST).count() == 1


def test_reimport_avec_montant_corrige_met_a_jour_la_ligne(client, db):
    _confirmer(client, _csv(_ligne(hash_="0x1", countervalue="37.80")))

    reponse = _confirmer(client, _csv(_ligne(hash_="0x1", countervalue="42.00")))

    corps = reponse.json()
    assert corps["mises_a_jour"] == 1
    assert corps["doublons_ignores"] == 0
    transaction = db.query(Transaction).filter(Transaction.user_id == ID_UTILISATEUR_TEST).one()
    assert transaction.amount == -42.00


def test_lignes_ignorees_sont_comptees_dans_le_resultat(client):
    reponse = _confirmer(client, _csv(_ligne(hash_="0x1", ticker="BTC"), "2024-01-19T10:26:23.000Z,Pending,ETH,IN,1,0,0x2,Ethereum,xpub,EUR,10,10"))

    assert reponse.json()["lignes_ignorees"] == 1
