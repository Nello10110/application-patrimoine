"""Verrouille les réglages applicatifs persistants (LOT 5B, par utilisateur depuis
le Milestone 2b) : défauts sur un compte neuf, écriture/relecture, le repli sur le
défaut pour une valeur invalide, et l'isolation entre deux comptes."""

from app.models import User, UserParametre
from app.services import preferences_service

from .conftest import ID_UTILISATEUR_B, ID_UTILISATEUR_TEST, NOM_UTILISATEUR_B


def test_lire_preferences_renvoie_les_defauts_sur_compte_neuf(db):
    prefs = preferences_service.lire_preferences(db, ID_UTILISATEUR_TEST)

    assert prefs == {
        "methode_cout": preferences_service.METHODE_COUT_MOYEN_PONDERE,
        "seuil_alerte_ecart_pct": preferences_service.SEUIL_ALERTE_ECART_PCT_DEFAUT,
    }


def test_enregistrer_puis_relire_les_preferences(db):
    preferences_service.enregistrer_preferences(db, ID_UTILISATEUR_TEST, preferences_service.METHODE_FIFO, 8.0)

    prefs = preferences_service.lire_preferences(db, ID_UTILISATEUR_TEST)
    assert prefs == {"methode_cout": "fifo", "seuil_alerte_ecart_pct": 8.0}

    # Persisté en base sous forme de deux lignes clé/valeur, texte.
    lignes = {p.cle: p.valeur for p in db.query(UserParametre).filter(UserParametre.user_id == ID_UTILISATEUR_TEST).all()}
    assert lignes["methode_cout"] == "fifo"
    assert lignes["seuil_alerte_ecart_pct"] == "8.0"


def test_enregistrer_ecrase_une_valeur_deja_presente(db):
    preferences_service.enregistrer_preferences(db, ID_UTILISATEUR_TEST, preferences_service.METHODE_FIFO, 8.0)
    preferences_service.enregistrer_preferences(db, ID_UTILISATEUR_TEST, preferences_service.METHODE_COUT_MOYEN_PONDERE, 3.0)

    assert preferences_service.lire_preferences(db, ID_UTILISATEUR_TEST) == {
        "methode_cout": "cout_moyen_pondere",
        "seuil_alerte_ecart_pct": 3.0,
    }
    # Une seule ligne par clé, pas un doublon à chaque écriture.
    assert db.query(UserParametre).filter(UserParametre.user_id == ID_UTILISATEUR_TEST).count() == 2


def test_lire_methode_cout_retombe_sur_le_defaut_si_valeur_invalide_en_base(db):
    db.add(UserParametre(cle="methode_cout", user_id=ID_UTILISATEUR_TEST, valeur="valeur_invalide_corrompue"))
    db.commit()

    assert preferences_service.lire_methode_cout(db, ID_UTILISATEUR_TEST) == preferences_service.METHODE_COUT_MOYEN_PONDERE


def test_lire_seuil_alerte_retombe_sur_le_defaut_si_valeur_non_numerique_en_base(db):
    db.add(UserParametre(cle="seuil_alerte_ecart_pct", user_id=ID_UTILISATEUR_TEST, valeur="pas_un_nombre"))
    db.commit()

    assert preferences_service.lire_seuil_alerte_ecart_pct(db, ID_UTILISATEUR_TEST) == preferences_service.SEUIL_ALERTE_ECART_PCT_DEFAUT


def test_les_preferences_de_deux_comptes_ne_se_melangent_pas(db):
    """Verrou central du Milestone 2b : un compte ne doit jamais voir ni écraser
    les préférences d'un autre."""
    db.add(User(id=ID_UTILISATEUR_B, username=NOM_UTILISATEUR_B, password_hash="inutilisé"))
    db.commit()

    preferences_service.enregistrer_preferences(db, ID_UTILISATEUR_TEST, preferences_service.METHODE_FIFO, 8.0)
    preferences_service.enregistrer_preferences(db, ID_UTILISATEUR_B, preferences_service.METHODE_COUT_MOYEN_PONDERE, 3.0)

    assert preferences_service.lire_preferences(db, ID_UTILISATEUR_TEST) == {
        "methode_cout": "fifo",
        "seuil_alerte_ecart_pct": 8.0,
    }
    assert preferences_service.lire_preferences(db, ID_UTILISATEUR_B) == {
        "methode_cout": "cout_moyen_pondere",
        "seuil_alerte_ecart_pct": 3.0,
    }
