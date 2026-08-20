"""LOT 4A — tests transverses au niveau des routes HTTP, complémentaires aux tests
unitaires des services : comptage des appels à `compute_positions` (LOT 4.3) et des
requêtes SQL (LOT 4.1) réellement émis pour servir une requête de l'API."""

from datetime import datetime, timezone

from sqlalchemy import event

from app.models import Holding, MarketDataCache
from app.services import portfolio_reconstruction

from .conftest import ID_UTILISATEUR_TEST


def test_get_performance_appelle_compute_positions_une_seule_fois(client, db, monkeypatch):
    """`compute_positions` rejoue tout le grand livre : verrou du LOT 4.3, il ne doit
    être appelé qu'une seule fois pour servir `GET /api/performance`.

    Constat fait en investiguant ce lot : cet appel était déjà unique pour cette route
    précise (`compute_performance` ne l'invoque qu'une fois lui-même) — la redondance
    que ce lot élimine se produit quand plusieurs fonctions consommant `compute_positions`
    sont enchaînées par un même appelant (cf. `test_performance_service.
    test_positions_partagees_evite_un_recalcul_quand_plusieurs_fonctions_sont_enchainees`,
    qui la démontre directement). Ce test-ci verrouille que ce lot n'a pas régressé et
    empêche qu'une future modification de la route réintroduise un second appel sans
    passer par le paramètre `positions` désormais disponible."""
    for i in range(5):
        ticker = f"T{i}"
        db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker=ticker, quantite=1.0, prix_revient_moyen=10.0))
        db.add(MarketDataCache(ticker=ticker, prix_actuel=12.0, derniere_maj=datetime.now(timezone.utc)))
    db.commit()

    compteur = {"n": 0}
    original = portfolio_reconstruction.compute_positions

    def _compte_et_calcule(db_, user_id_):
        compteur["n"] += 1
        return original(db_, user_id_)

    monkeypatch.setattr(portfolio_reconstruction, "compute_positions", _compte_et_calcule)

    reponse = client.get("/api/performance")

    assert reponse.status_code == 200
    assert compteur["n"] == 1


def test_get_holdings_ne_declenche_pas_une_requete_sql_par_ligne(client, db):
    """LOT 4.1, au niveau HTTP cette fois (complète le test unitaire de
    `test_analysis_service.py`) : `GET /api/portfolio/holdings` sur un portefeuille de
    plusieurs dizaines de lignes ne doit pas émettre un nombre de requêtes SQL
    proportionnel au nombre de lignes."""
    nombre_lignes = 50
    maintenant = datetime.now(timezone.utc)
    for i in range(nombre_lignes):
        ticker = f"H{i}"
        db.add(Holding(user_id=ID_UTILISATEUR_TEST, ticker=ticker, quantite=1.0, prix_revient_moyen=10.0))
        db.add(MarketDataCache(ticker=ticker, prix_actuel=12.0, derniere_maj=maintenant))
    db.commit()

    requetes = []

    def _compter(conn, cursor, statement, parameters, context, executemany):
        requetes.append(statement)

    moteur = db.get_bind()
    event.listen(moteur, "before_cursor_execute", _compter)
    try:
        reponse = client.get("/api/portfolio/holdings")
    finally:
        event.remove(moteur, "before_cursor_execute", _compter)

    assert reponse.status_code == 200
    assert len(reponse.json()) == nombre_lignes
    # Sans `lazy="selectin"` : de l'ordre de 1 (holdings) + 50 (une par `.market_data`,
    # dans `value_holdings` appelé par `compute_holding_returns`) requêtes. Avec le
    # correctif, le total reste borné, très inférieur à `nombre_lignes`.
    assert len(requetes) < nombre_lignes
