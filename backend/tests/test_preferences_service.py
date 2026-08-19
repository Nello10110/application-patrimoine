"""Verrouille les réglages applicatifs persistants (LOT 5B) : défauts sur une base
neuve, écriture/relecture, et le repli sur le défaut pour une valeur invalide."""

from app.models import Parametre
from app.services import preferences_service


def test_lire_preferences_renvoie_les_defauts_sur_base_neuve(db):
    prefs = preferences_service.lire_preferences(db)

    assert prefs == {
        "methode_cout": preferences_service.METHODE_COUT_MOYEN_PONDERE,
        "seuil_alerte_ecart_pct": preferences_service.SEUIL_ALERTE_ECART_PCT_DEFAUT,
    }


def test_enregistrer_puis_relire_les_preferences(db):
    preferences_service.enregistrer_preferences(db, preferences_service.METHODE_FIFO, 8.0)

    prefs = preferences_service.lire_preferences(db)
    assert prefs == {"methode_cout": "fifo", "seuil_alerte_ecart_pct": 8.0}

    # Persisté en base sous forme de deux lignes clé/valeur, texte.
    lignes = {p.cle: p.valeur for p in db.query(Parametre).all()}
    assert lignes["methode_cout"] == "fifo"
    assert lignes["seuil_alerte_ecart_pct"] == "8.0"


def test_enregistrer_ecrase_une_valeur_deja_presente(db):
    preferences_service.enregistrer_preferences(db, preferences_service.METHODE_FIFO, 8.0)
    preferences_service.enregistrer_preferences(db, preferences_service.METHODE_COUT_MOYEN_PONDERE, 3.0)

    assert preferences_service.lire_preferences(db) == {
        "methode_cout": "cout_moyen_pondere",
        "seuil_alerte_ecart_pct": 3.0,
    }
    # Une seule ligne par clé, pas un doublon à chaque écriture.
    assert db.query(Parametre).count() == 2


def test_lire_methode_cout_retombe_sur_le_defaut_si_valeur_invalide_en_base(db):
    db.add(Parametre(cle="methode_cout", valeur="valeur_invalide_corrompue"))
    db.commit()

    assert preferences_service.lire_methode_cout(db) == preferences_service.METHODE_COUT_MOYEN_PONDERE


def test_lire_seuil_alerte_retombe_sur_le_defaut_si_valeur_non_numerique_en_base(db):
    db.add(Parametre(cle="seuil_alerte_ecart_pct", valeur="pas_un_nombre"))
    db.commit()

    assert preferences_service.lire_seuil_alerte_ecart_pct(db) == preferences_service.SEUIL_ALERTE_ECART_PCT_DEFAUT
