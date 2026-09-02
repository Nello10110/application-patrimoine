"""Tests de `scripts/sauvegarde.py` (LOT 7.6) : sauvegarde à chaud, rétention,
contrôle d'intégrité, restauration. Chaque test construit ses propres fichiers
SQLite dans `tmp_path` — jamais la vraie `patrimoine.db` (garanti par
`backend/conftest.py`, qui redirige `PATRIMOINE_DB` avant tout import, mais ce
fichier n'en dépend même pas : les chemins de base sont explicites de bout en
bout, sans jamais retomber sur un défaut)."""

import sqlite3
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Holding, MarketDataCache, Transaction, User
from scripts import sauvegarde

# Multi-utilisateur (Milestone 2a) : `holdings`/`transactions` exigent désormais un
# `user_id` — ce fichier construit ses propres bases isolées (pas la fixture `db`
# partagée de `conftest.py`), donc ce compte minimal est créé ici.
ID_UTILISATEUR_TEST = 1


def _creer_base_peuplee(chemin: Path, *, ticker: str = "AAPL") -> None:
    """Construit, au chemin donné, une base SQLite avec le schéma complet de
    l'application et quelques lignes représentatives sur trois tables."""
    engine = create_engine(f"sqlite:///{chemin}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        session.add(User(id=ID_UTILISATEUR_TEST, username="test", password_hash="inutilisé"))
        session.add(
            Holding(
                user_id=ID_UTILISATEUR_TEST, ticker=ticker, nom="Apple Inc.", quantite=10.0, prix_revient_moyen=150.0, type_actif="STOCK"
            )
        )
        session.add(
            Transaction(
                user_id=ID_UTILISATEUR_TEST,
                transaction_id=f"tx-{ticker}",
                datetime_utc=datetime(2024, 1, 1),
                date="2024-01-01",
                category="TRADING",
                type="BUY",
                asset_class="STOCK",
                symbol=ticker,
                name="Apple Inc.",
                shares=10.0,
                price=150.0,
                amount=-1500.0,
                fee=1.0,
                tax=0.0,
            )
        )
        session.add(
            MarketDataCache(
                ticker=ticker,
                nom="Apple Inc.",
                prix_actuel=190.0,
                devise="USD",
                secteur="Technology",
                pays="United States",
                region="Amérique du Nord",
            )
        )
        session.commit()
    finally:
        session.close()
        engine.dispose()


def _lignes(chemin: Path, table: str) -> list[tuple]:
    connexion = sqlite3.connect(str(chemin))
    try:
        return connexion.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()
    finally:
        connexion.close()


def _ecrire_fichier_invalide(chemin: Path) -> None:
    chemin.write_bytes(b"ceci n'est pas une base SQLite")


# --- résolution de la base source -----------------------------------------------


def test_chemin_base_source_suit_la_variable_denvironnement(tmp_path, monkeypatch):
    monkeypatch.setenv("PATRIMOINE_DB", str(tmp_path / "ailleurs.db"))

    assert sauvegarde.chemin_base_source() == tmp_path / "ailleurs.db"


def test_chemin_base_source_est_celle_que_lapplication_ouvre_reellement(monkeypatch):
    """Régression du 02/09/2026 : ce module codait `backend/patrimoine.db` en dur,
    alors qu'`app/database.py` applique un repli historique vers `portfolio.db`
    quand le premier est vide ou absent. Les deux divergeaient donc sur toute
    installation existante — la sauvegarde planifiée copiait un fichier vide
    pendant que l'application travaillait sur l'autre, sans aucune alerte au-delà
    d'un statut « erreur » dans un écran peu consulté.

    L'invariant à tenir est simple et vaut mieux que n'importe quel test de cas
    particulier : sans `PATRIMOINE_DB`, la source de la sauvegarde est exactement
    celle que l'application résout."""
    monkeypatch.delenv("PATRIMOINE_DB", raising=False)
    from app.database import _chemin_base_par_defaut

    assert sauvegarde.chemin_base_source() == _chemin_base_par_defaut()


# --- sauvegarder --------------------------------------------------------------


def test_sauvegarde_contenu_identique_a_loriginal(tmp_path):
    source = tmp_path / "patrimoine.db"
    _creer_base_peuplee(source)
    dossier = tmp_path / "sauvegardes"

    chemin_sauvegarde = sauvegarde.sauvegarder(source, dossier)

    assert chemin_sauvegarde.exists()
    assert chemin_sauvegarde.parent == dossier
    assert chemin_sauvegarde.name.startswith("patrimoine-") and chemin_sauvegarde.suffix == ".db"
    for table in ("holdings", "transactions", "market_data_cache"):
        assert _lignes(chemin_sauvegarde, table) == _lignes(source, table)


def test_sauvegarde_cree_le_dossier_destination_sil_nexiste_pas(tmp_path):
    source = tmp_path / "patrimoine.db"
    _creer_base_peuplee(source)
    dossier = tmp_path / "nouveau" / "sauvegardes"
    assert not dossier.exists()

    sauvegarde.sauvegarder(source, dossier)

    assert dossier.is_dir()


def test_sauvegarde_source_introuvable_leve_file_not_found(tmp_path):
    source = tmp_path / "absente.db"
    with pytest.raises(FileNotFoundError):
        sauvegarde.sauvegarder(source, tmp_path / "sauvegardes")


def test_deux_sauvegardes_a_lidentique_ne_secrasent_pas(tmp_path):
    """Même horodatage explicite (deux appels dans la même seconde en pratique) :
    le second fichier ne doit jamais écraser silencieusement le premier."""
    source = tmp_path / "patrimoine.db"
    _creer_base_peuplee(source)
    dossier = tmp_path / "sauvegardes"
    horodatage = datetime(2026, 1, 1, 2, 0, 0)

    premier = sauvegarde.sauvegarder(source, dossier, horodatage=horodatage)
    second = sauvegarde.sauvegarder(source, dossier, horodatage=horodatage)

    assert premier != second
    assert premier.exists() and second.exists()


# --- verifier_integrite --------------------------------------------------------


def test_verifier_integrite_accepte_une_base_valide(tmp_path):
    chemin = tmp_path / "patrimoine.db"
    _creer_base_peuplee(chemin)
    sauvegarde.verifier_integrite(chemin)  # ne lève rien


def test_verifier_integrite_refuse_un_fichier_qui_nest_pas_une_base_sqlite(tmp_path):
    chemin = tmp_path / "invalide.db"
    _ecrire_fichier_invalide(chemin)
    with pytest.raises(sauvegarde.SauvegardeInvalideError):
        sauvegarde.verifier_integrite(chemin)


def test_verifier_integrite_refuse_une_base_sans_les_tables_principales(tmp_path):
    """Base SQLite valide mais vide de schéma applicatif (ex. copie interrompue en
    tout début de `backup()`) : l'`integrity_check` seul ne suffirait pas à le
    détecter, d'où la vérification complémentaire des tables principales."""
    chemin = tmp_path / "vide.db"
    connexion = sqlite3.connect(str(chemin))
    connexion.execute("CREATE TABLE autre_table (id INTEGER PRIMARY KEY)")
    connexion.commit()
    connexion.close()

    with pytest.raises(sauvegarde.SauvegardeInvalideError):
        sauvegarde.verifier_integrite(chemin)


def test_verifier_integrite_fichier_introuvable(tmp_path):
    with pytest.raises(FileNotFoundError):
        sauvegarde.verifier_integrite(tmp_path / "absent.db")


# --- appliquer_retention --------------------------------------------------------


def test_retention_conserve_les_plus_recentes_et_supprime_les_plus_anciennes(tmp_path):
    source = tmp_path / "patrimoine.db"
    _creer_base_peuplee(source)
    dossier = tmp_path / "sauvegardes"

    horodatages = [datetime(2026, 1, 1, 0, minute, 0) for minute in range(15)]
    chemins = [sauvegarde.sauvegarder(source, dossier, horodatage=h) for h in horodatages]

    supprimees = sauvegarde.appliquer_retention(dossier, retention=10)

    assert len(supprimees) == 5
    assert set(supprimees) == set(chemins[:5])  # les 5 plus anciennes
    restantes = sauvegarde.lister_sauvegardes(dossier)
    assert restantes == chemins[5:]  # les 10 plus récentes, dans l'ordre chronologique
    for fichier in supprimees:
        assert not fichier.exists()


def test_retention_ne_fait_rien_si_moins_de_sauvegardes_que_la_limite(tmp_path):
    source = tmp_path / "patrimoine.db"
    _creer_base_peuplee(source)
    dossier = tmp_path / "sauvegardes"
    for minute in range(3):
        sauvegarde.sauvegarder(source, dossier, horodatage=datetime(2026, 1, 1, 0, minute, 0))

    supprimees = sauvegarde.appliquer_retention(dossier, retention=10)

    assert supprimees == []
    assert len(sauvegarde.lister_sauvegardes(dossier)) == 3


def test_retention_zero_ou_negative_ne_supprime_rien(tmp_path):
    source = tmp_path / "patrimoine.db"
    _creer_base_peuplee(source)
    dossier = tmp_path / "sauvegardes"
    for minute in range(3):
        sauvegarde.sauvegarder(source, dossier, horodatage=datetime(2026, 1, 1, 0, minute, 0))

    assert sauvegarde.appliquer_retention(dossier, retention=0) == []
    assert sauvegarde.appliquer_retention(dossier, retention=-5) == []
    assert len(sauvegarde.lister_sauvegardes(dossier)) == 3


def test_retention_ignore_les_copies_de_securite_avant_restauration(tmp_path):
    """`appliquer_retention` ne doit purger que les sauvegardes périodiques, jamais
    les copies de sécurité créées par `restaurer` (`patrimoine-avant-restauration-
    ...`), qui suivent un cycle de vie distinct."""
    source = tmp_path / "patrimoine.db"
    _creer_base_peuplee(source)
    dossier = tmp_path / "sauvegardes"
    sauvegarde_a_restaurer = sauvegarde.sauvegarder(source, dossier, horodatage=datetime(2026, 1, 1, 0, 0, 0))

    sauvegarde.restaurer(sauvegarde_a_restaurer, source, dossier, horodatage=datetime(2026, 1, 2, 0, 0, 0))
    copies_de_securite = list(dossier.glob("patrimoine-avant-restauration-*.db"))
    assert len(copies_de_securite) == 1

    sauvegarde.appliquer_retention(dossier, retention=0)

    assert copies_de_securite[0].exists()


# --- restaurer -------------------------------------------------------------


def test_restauration_remplace_la_base_et_met_lancienne_de_cote(tmp_path):
    dossier = tmp_path / "sauvegardes"

    base_courante = tmp_path / "patrimoine.db"
    _creer_base_peuplee(base_courante, ticker="ANCIEN")

    fichier_a_restaurer = tmp_path / "portfolio-a-restaurer.db"
    _creer_base_peuplee(fichier_a_restaurer, ticker="NOUVEAU")

    sauvegarde.restaurer(fichier_a_restaurer, base_courante, dossier, horodatage=datetime(2026, 3, 1, 8, 0, 0))

    # La base courante porte maintenant le contenu du fichier restauré.
    tickers_restaures = {ligne[2] for ligne in _lignes(base_courante, "holdings")}
    assert tickers_restaures == {"NOUVEAU"}

    # L'ancienne base a été mise de côté, contenu intact, sous un nom distinct des
    # sauvegardes périodiques.
    copies = list(dossier.glob("patrimoine-avant-restauration-*.db"))
    assert len(copies) == 1
    tickers_mis_de_cote = {ligne[2] for ligne in _lignes(copies[0], "holdings")}
    assert tickers_mis_de_cote == {"ANCIEN"}
    assert sauvegarde.lister_sauvegardes(dossier) == []  # pas comptée comme sauvegarde périodique


def test_restauration_sans_base_courante_existante_ne_cree_pas_de_copie_de_securite(tmp_path):
    dossier = tmp_path / "sauvegardes"
    base_cible = tmp_path / "patrimoine.db"  # n'existe pas encore
    fichier_a_restaurer = tmp_path / "portfolio-a-restaurer.db"
    _creer_base_peuplee(fichier_a_restaurer)

    sauvegarde.restaurer(fichier_a_restaurer, base_cible, dossier)

    assert base_cible.exists()
    assert list(dossier.glob("patrimoine-avant-restauration-*.db")) == []


def test_restauration_fichier_introuvable_leve_file_not_found_et_ne_touche_rien(tmp_path):
    dossier = tmp_path / "sauvegardes"
    base_courante = tmp_path / "patrimoine.db"
    _creer_base_peuplee(base_courante, ticker="INTACT")

    with pytest.raises(FileNotFoundError):
        sauvegarde.restaurer(tmp_path / "absent.db", base_courante, dossier)

    assert {ligne[2] for ligne in _lignes(base_courante, "holdings")} == {"INTACT"}
    assert not dossier.exists()


def test_restauration_fichier_invalide_refuse_avant_de_toucher_a_la_base_courante(tmp_path):
    dossier = tmp_path / "sauvegardes"
    base_courante = tmp_path / "patrimoine.db"
    _creer_base_peuplee(base_courante, ticker="INTACT")

    fichier_invalide = tmp_path / "invalide.db"
    _ecrire_fichier_invalide(fichier_invalide)

    with pytest.raises(sauvegarde.SauvegardeInvalideError):
        sauvegarde.restaurer(fichier_invalide, base_courante, dossier)

    # La base courante n'a pas bougé et aucune copie de sécurité n'a été créée :
    # le contrôle d'intégrité du fichier à restaurer a lieu avant tout effet de bord.
    assert {ligne[2] for ligne in _lignes(base_courante, "holdings")} == {"INTACT"}
    assert not dossier.exists()


# --- interface en ligne de commande --------------------------------------------


def test_cli_sauvegarde_par_defaut(tmp_path, capsys):
    source = tmp_path / "patrimoine.db"
    _creer_base_peuplee(source)
    dossier = tmp_path / "sauvegardes"

    code_retour = sauvegarde.main(["--base", str(source), "--dossier", str(dossier)])

    assert code_retour == 0
    assert len(sauvegarde.lister_sauvegardes(dossier)) == 1
    assert "Sauvegarde créée" in capsys.readouterr().out


def test_cli_restauration_annulee_sans_confirmation(tmp_path, monkeypatch, capsys):
    dossier = tmp_path / "sauvegardes"
    base_courante = tmp_path / "patrimoine.db"
    _creer_base_peuplee(base_courante, ticker="INTACT")
    fichier_a_restaurer = tmp_path / "autre.db"
    _creer_base_peuplee(fichier_a_restaurer, ticker="AUTRE")

    monkeypatch.setattr("builtins.input", lambda *_: "n")
    code_retour = sauvegarde.main(
        ["--base", str(base_courante), "--dossier", str(dossier), "--restaurer", str(fichier_a_restaurer)]
    )

    assert code_retour == 1
    assert "annulée" in capsys.readouterr().out
    assert {ligne[2] for ligne in _lignes(base_courante, "holdings")} == {"INTACT"}


def test_cli_restauration_avec_forcer_ne_demande_pas_confirmation(tmp_path, monkeypatch, capsys):
    dossier = tmp_path / "sauvegardes"
    base_courante = tmp_path / "patrimoine.db"
    _creer_base_peuplee(base_courante, ticker="INTACT")
    fichier_a_restaurer = tmp_path / "autre.db"
    _creer_base_peuplee(fichier_a_restaurer, ticker="AUTRE")

    def _input_qui_echoue_si_appele(*_args):
        raise AssertionError("--forcer doit éviter toute demande de confirmation")

    monkeypatch.setattr("builtins.input", _input_qui_echoue_si_appele)
    code_retour = sauvegarde.main(
        [
            "--base",
            str(base_courante),
            "--dossier",
            str(dossier),
            "--restaurer",
            str(fichier_a_restaurer),
            "--forcer",
        ]
    )

    assert code_retour == 0
    assert {ligne[2] for ligne in _lignes(base_courante, "holdings")} == {"AUTRE"}


def test_cli_help_ne_leve_pas_et_mentionne_restaurer(capsys):
    with pytest.raises(SystemExit) as exc_info:
        sauvegarde.main(["--help"])

    assert exc_info.value.code == 0
    assert "--restaurer" in capsys.readouterr().out
