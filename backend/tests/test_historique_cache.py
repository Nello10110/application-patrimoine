"""Verrouille le comportement du cache persistant d'historiques (`historique_cache`,
LOT 4.4/4.5) : écriture/lecture, expiration à `DUREE_VALIDITE_HEURES`, invalidation
ciblée ou totale, format des clés nommées."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect

from app.models import HistoriqueCache
from app.services import historique_cache


def test_table_historique_cache_creee_par_create_all(db):
    """La table est créée par la migration automatique au démarrage (LOT 4.4/4.5),
    comme toutes les autres : `Base.metadata.create_all`, sans étape manuelle
    supplémentaire — cf. `app.main`/`app.database.run_startup_migrations`."""
    inspecteur = inspect(db.get_bind())
    assert "historique_cache" in inspecteur.get_table_names()
    colonnes = {c["name"] for c in inspecteur.get_columns("historique_cache")}
    assert colonnes == {"cle", "contenu_json", "derniere_maj"}


def test_ecrire_puis_lire_renvoie_le_contenu(db):
    historique_cache.ecrire(db, "cle-test", {"a": 1, "b": [1, 2, 3]})
    assert historique_cache.lire(db, "cle-test") == {"a": 1, "b": [1, 2, 3]}


def test_lire_renvoie_none_si_absent(db):
    assert historique_cache.lire(db, "inexistante") is None


def test_lire_renvoie_none_au_dela_de_la_duree_de_validite(db):
    historique_cache.ecrire(db, "cle-test", {"a": 1})
    entree = db.get(HistoriqueCache, "cle-test")
    entree.derniere_maj = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        hours=historique_cache.DUREE_VALIDITE_HEURES + 1
    )
    db.commit()

    assert historique_cache.lire(db, "cle-test") is None


def test_lire_dans_la_limite_de_validite(db):
    historique_cache.ecrire(db, "cle-test", {"a": 1})
    entree = db.get(HistoriqueCache, "cle-test")
    entree.derniere_maj = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        hours=historique_cache.DUREE_VALIDITE_HEURES - 1
    )
    db.commit()

    assert historique_cache.lire(db, "cle-test") == {"a": 1}


def test_ecrire_ecrase_une_entree_existante_sans_dupliquer_la_ligne(db):
    historique_cache.ecrire(db, "cle-test", {"a": 1})
    historique_cache.ecrire(db, "cle-test", {"a": 2})

    assert historique_cache.lire(db, "cle-test") == {"a": 2}
    assert db.query(HistoriqueCache).count() == 1


def test_invalider_une_cle_precise_laisse_les_autres_intactes(db):
    historique_cache.ecrire(db, "cle-1", {"a": 1})
    historique_cache.ecrire(db, "cle-2", {"a": 2})

    historique_cache.invalider(db, "cle-1")

    assert historique_cache.lire(db, "cle-1") is None
    assert historique_cache.lire(db, "cle-2") == {"a": 2}


def test_invalider_sans_cle_purge_tout_le_cache(db):
    historique_cache.ecrire(db, "cle-1", {"a": 1})
    historique_cache.ecrire(db, "cle-2", {"a": 2})

    historique_cache.invalider(db)

    assert historique_cache.lire(db, "cle-1") is None
    assert historique_cache.lire(db, "cle-2") is None


def test_cles_nommees_construisent_le_format_attendu():
    assert historique_cache.cle_historique_ligne("AAA") == "historique_ligne:AAA"
    assert historique_cache.cle_historique_ligne("FR0000120271") == "historique_ligne:FR0000120271"
    assert historique_cache.cle_historique_portefeuille(1) == "historique_portefeuille:1"
    assert historique_cache.cle_historique_portefeuille(42) == "historique_portefeuille:42"


def test_invalider_historiques_portefeuille_purge_tous_les_utilisateurs_sans_toucher_aux_lignes(db):
    historique_cache.ecrire(db, historique_cache.cle_historique_portefeuille(1), {"a": 1})
    historique_cache.ecrire(db, historique_cache.cle_historique_portefeuille(2), {"a": 2})
    historique_cache.ecrire(db, historique_cache.cle_historique_ligne("AAA"), {"prix": 1})

    historique_cache.invalider_historiques_portefeuille(db)

    assert historique_cache.lire(db, historique_cache.cle_historique_portefeuille(1)) is None
    assert historique_cache.lire(db, historique_cache.cle_historique_portefeuille(2)) is None
    assert historique_cache.lire(db, historique_cache.cle_historique_ligne("AAA")) == {"prix": 1}
