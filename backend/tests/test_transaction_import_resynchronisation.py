"""Ré-import du grand livre de transactions (retour utilisateur du 10/09/2026) :
l'export Trade Republic est TOUJOURS l'historique complet, jamais un delta — un
second import du même fichier (ou d'un export plus récent qui recouvre le premier)
ne doit donc jamais dupliquer une ligne déjà connue (`transaction_id` + `user_id`),
mais RE-SYNCHRONISER son contenu si le courtier a corrigé un champ dans
l'intervalle (montant, frais, quantité...), au lieu de se contenter de l'ignorer.

`test_isolation_utilisateurs.py` verrouille déjà le dédoublonnage strict (même
fichier réimporté à l'identique = doublon ignoré, jamais dupliqué même entre deux
comptes courtier différents) — ce fichier-ci ajoute le cas symétrique : un champ
qui CHANGE entre deux imports doit mettre à jour la ligne existante, pas être
silencieusement perdu comme avant ce correctif."""

from app.models import Transaction

from .conftest import ID_UTILISATEUR_TEST

EN_TETE = "transaction_id,datetime,date,category,type,asset_class,symbol,name,shares,price,amount,fee,tax,description,mcc_code"


def _ligne(transaction_id: str, shares: float = 10, price: float = 150.5, amount: float = -1505.00, fee: float = 1.00) -> str:
    return (
        f"{transaction_id},2024-01-15T10:30:00.000Z,2024-01-15,TRADING,BUY,STOCK,US0378331005,Apple Inc,"
        f"{shares},{price},{amount},{fee},0.00,Achat,"
    )


def _csv(*lignes: str) -> bytes:
    return "\n".join([EN_TETE, *lignes]).encode("utf-8")


def _importer(client, contenu: bytes):
    apercu = client.post("/api/transactions/import/apercu", files={"file": ("grand_livre.csv", contenu, "text/csv")}).json()
    return client.post("/api/transactions/import", json={"file_token": apercu["file_token"], "etablissement_nom": "Banque Test"})


def test_reimport_identique_ne_duplique_pas_et_ne_signale_aucune_mise_a_jour(client, db):
    _importer(client, _csv(_ligne("tx-1")))

    reponse = _importer(client, _csv(_ligne("tx-1")))

    corps = reponse.json()
    assert corps["importees"] == 0
    assert corps["mises_a_jour"] == 0
    assert corps["doublons_ignores"] == 1
    assert db.query(Transaction).filter(Transaction.user_id == ID_UTILISATEUR_TEST).count() == 1


def test_reimport_avec_montant_corrige_met_a_jour_la_ligne_sans_la_dupliquer(client, db):
    _importer(client, _csv(_ligne("tx-1", amount=-1505.00)))

    reponse = _importer(client, _csv(_ligne("tx-1", amount=-1520.00)))

    corps = reponse.json()
    assert corps["importees"] == 0
    assert corps["mises_a_jour"] == 1
    assert corps["doublons_ignores"] == 0

    transactions = db.query(Transaction).filter(Transaction.user_id == ID_UTILISATEUR_TEST).all()
    assert len(transactions) == 1  # jamais dupliquée
    assert transactions[0].amount == -1520.00  # la valeur corrigée fait foi


def test_reimport_avec_quantite_et_prix_corriges_recalcule_le_portefeuille(client):
    _importer(client, _csv(_ligne("tx-1", shares=10, price=150.5, amount=-1505.00)))
    solde_initial = client.get("/api/portfolio/holdings").json()
    assert len(solde_initial) == 1
    assert solde_initial[0]["quantite"] == 10
    ticker = solde_initial[0]["ticker"]

    # Le courtier corrige la ligne : 12 titres au lieu de 10 (ex. un rétro-ajustement).
    _importer(client, _csv(_ligne("tx-1", shares=12, price=150.5, amount=-1806.00)))

    holdings = client.get("/api/portfolio/holdings").json()
    holding = next(h for h in holdings if h["ticker"] == ticker)
    assert holding["quantite"] == 12


def test_reimport_avec_un_fichier_mixte_compte_correctement_chaque_categorie(client, db):
    """Fichier complet Trade Republic type : une ligne inchangée, une corrigée, une
    toute nouvelle — chaque catégorie doit être comptée séparément, jamais fondue
    dans `importees` ou perdue."""
    _importer(client, _csv(_ligne("tx-inchangee"), _ligne("tx-a-corriger", amount=-1505.00)))

    reponse = _importer(
        client,
        _csv(
            _ligne("tx-inchangee"),
            _ligne("tx-a-corriger", amount=-1600.00),
            _ligne("tx-nouvelle"),
        ),
    )

    corps = reponse.json()
    assert corps["importees"] == 1  # tx-nouvelle
    assert corps["mises_a_jour"] == 1  # tx-a-corriger
    assert corps["doublons_ignores"] == 1  # tx-inchangee
    assert db.query(Transaction).filter(Transaction.user_id == ID_UTILISATEUR_TEST).count() == 3
