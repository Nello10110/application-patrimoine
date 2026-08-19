"""Remise à niveau du portefeuille après un changement des règles de calcul
(`services/startup_maintenance`).

Le tableau `holdings` est un résultat figé : sans ce mécanisme, une mise à jour qui
change une règle de calcul laisse les prix de revient stockés à leur ancienne valeur
jusqu'au prochain import, sans qu'aucune erreur ne le signale.
"""

from datetime import datetime

import pytest

from app.models import Holding, Parametre
from app.services import historique_cache, startup_maintenance
from app.services.startup_maintenance import (
    CLE_VERSION_CALCUL,
    VERSION_CALCUL_PORTEFEUILLE,
    reconstruire_si_regles_de_calcul_modifiees,
)

from .conftest import make_transaction


def _version_en_base(db) -> str | None:
    parametre = db.get(Parametre, CLE_VERSION_CALCUL)
    return parametre.valeur if parametre else None


def test_reconstruit_quand_aucune_version_n_est_enregistree(db):
    """Cas d'une base existante mise à jour : aucune version n'a jamais été posée, et
    le portefeuille stocké date de l'ancienne règle de calcul."""
    make_transaction(db, symbol="AAA", shares=10.0, amount=-1000.0)
    # Prix de revient volontairement faux, comme s'il venait d'une version antérieure.
    db.add(Holding(ticker="AAA", quantite=10.0, prix_revient_moyen=1.0))
    db.commit()

    recalculees = reconstruire_si_regles_de_calcul_modifiees(db)

    assert recalculees == 1
    assert db.query(Holding).filter(Holding.ticker == "AAA").one().prix_revient_moyen == 100.0
    assert _version_en_base(db) == str(VERSION_CALCUL_PORTEFEUILLE)


def test_ne_refait_rien_au_demarrage_suivant(db):
    """Idempotence : c'est la propriété qui rend acceptable un appel à chaque démarrage."""
    make_transaction(db, symbol="BBB", shares=10.0, amount=-1000.0)
    db.commit()

    assert reconstruire_si_regles_de_calcul_modifiees(db) == 1
    assert reconstruire_si_regles_de_calcul_modifiees(db) is None
    assert reconstruire_si_regles_de_calcul_modifiees(db) is None


def test_reconstruit_quand_la_version_enregistree_est_anterieure(db):
    make_transaction(db, symbol="CCC", shares=4.0, amount=-400.0)
    db.add(Parametre(cle=CLE_VERSION_CALCUL, valeur=str(VERSION_CALCUL_PORTEFEUILLE - 1)))
    db.commit()

    assert reconstruire_si_regles_de_calcul_modifiees(db) == 1
    assert _version_en_base(db) == str(VERSION_CALCUL_PORTEFEUILLE)


def test_version_illisible_traitee_comme_absente(db):
    """Une valeur éditée à la main ne doit pas bloquer la remise à niveau."""
    make_transaction(db, symbol="DDD", shares=2.0, amount=-200.0)
    db.add(Parametre(cle=CLE_VERSION_CALCUL, valeur="n'importe quoi"))
    db.commit()

    assert reconstruire_si_regles_de_calcul_modifiees(db) == 1
    assert _version_en_base(db) == str(VERSION_CALCUL_PORTEFEUILLE)


def test_base_sans_transaction_pose_la_version_sans_rien_reconstruire(db):
    """Base neuve, ou portefeuille entièrement saisi à la main : il n'y a rien à
    reconstruire, et surtout rien à écraser."""
    db.add(Holding(ticker="MANUEL", quantite=3.0, prix_revient_moyen=50.0))
    db.commit()

    assert reconstruire_si_regles_de_calcul_modifiees(db) is None
    assert _version_en_base(db) == str(VERSION_CALCUL_PORTEFEUILLE)
    assert db.query(Holding).filter(Holding.ticker == "MANUEL").one().quantite == 3.0


def test_le_cache_d_historique_est_invalide_apres_reconstruction(db):
    """Les historiques en cache reposent sur les positions reconstruites : les garder
    afficherait une courbe incohérente avec les nouveaux chiffres."""
    make_transaction(db, symbol="EEE", shares=1.0, amount=-100.0)
    historique_cache.ecrire(db, historique_cache.cle_historique_portefeuille(), [{"date": "2026-01-01"}])
    db.commit()
    assert historique_cache.lire(db, historique_cache.cle_historique_portefeuille()) is not None

    reconstruire_si_regles_de_calcul_modifiees(db)

    assert historique_cache.lire(db, historique_cache.cle_historique_portefeuille()) is None


def test_un_echec_ne_fait_jamais_echouer_le_demarrage(db, monkeypatch, caplog):
    """L'appel a lieu à l'import du module applicatif : une exception qui remonterait
    empêcherait purement et simplement l'application de démarrer."""
    make_transaction(db, symbol="FFF", shares=1.0, amount=-100.0)
    db.commit()

    def _echouer(_db):
        raise RuntimeError("panne simulée")

    monkeypatch.setattr(startup_maintenance.portfolio_reconstruction, "rebuild_holdings", _echouer)

    with caplog.at_level("ERROR", logger="patrimoine.maintenance"):
        assert reconstruire_si_regles_de_calcul_modifiees(db) is None

    assert any("remise à niveau" in r.getMessage() for r in caplog.records)
    # La version n'est pas posée : la remise à niveau sera retentée au prochain démarrage.
    assert _version_en_base(db) is None


@pytest.mark.parametrize("datetime_utc", [datetime(2024, 1, 1), datetime(2026, 6, 30)])
def test_les_lignes_saisies_manuellement_survivent_a_la_remise_a_niveau(db, datetime_utc):
    """`rebuild_holdings` préserve déjà les lignes manuelles ; on le verrouille ici parce
    que cette remise à niveau s'exécute sans que l'utilisateur l'ait demandée."""
    from app.models import ORIGINE_MANUEL

    make_transaction(db, symbol="GGG", shares=5.0, amount=-500.0, datetime_utc=datetime_utc)
    db.add(Holding(ticker="A-LA-MAIN", quantite=7.0, prix_revient_moyen=12.0, origine=ORIGINE_MANUEL))
    db.commit()

    reconstruire_si_regles_de_calcul_modifiees(db)

    ligne = db.query(Holding).filter(Holding.ticker == "A-LA-MAIN").one()
    assert ligne.quantite == 7.0
    assert ligne.prix_revient_moyen == 12.0
