"""Verrouille `services/partage_service.py` (backlog 2.Q.1) : création/révocation
d'un lien, validité par jeton, code optionnel, verrouillage temporaire par lien, et
construction de la charge utile publique (masquage, activation par section)."""

from datetime import timedelta

from app.models import PartageAcces
from app.services import partage_service

from .conftest import ID_UTILISATEUR_TEST, make_holding


def _creer(db, **overrides):
    defaults = dict(
        nom="Pour la banque",
        detenteur_id=None,
        duree_jours=30,
        inclure_patrimoine_net=True,
        inclure_repartition=True,
        inclure_performance=True,
        inclure_budget=False,
        inclure_objectifs=False,
        masquer_valeurs=False,
        code=None,
    )
    defaults.update(overrides)
    return partage_service.creer_lien(db, ID_UTILISATEUR_TEST, **defaults)


def test_creer_lien_genere_un_jeton_opaque_unique(db):
    lien1 = _creer(db)
    lien2 = _creer(db)
    assert lien1.token != lien2.token
    assert len(lien1.token) == 64  # 32 octets en hexadécimal


def test_creer_lien_avec_code_stocke_un_hash_jamais_le_code_en_clair(db):
    lien = _creer(db, code="1234")
    assert lien.code_hash is not None
    assert "1234" not in lien.code_hash


def test_lister_liens_ne_renvoie_que_ceux_du_foyer(db):
    _creer(db)
    _creer(db)
    assert len(partage_service.lister_liens(db, ID_UTILISATEUR_TEST)) == 2
    assert partage_service.lister_liens(db, 999) == []


def test_revoquer_lien_invalide_immediatement_la_consultation(db):
    lien = _creer(db)
    assert partage_service.lien_valide_par_token(db, lien.token) is not None

    partage_service.revoquer_lien(db, lien)

    assert lien.revoked_at is not None
    assert partage_service.lien_valide_par_token(db, lien.token) is None


def test_lien_expire_nest_plus_valide(db):
    lien = _creer(db, duree_jours=1)
    lien.expires_at = lien.expires_at - timedelta(days=2)
    db.commit()

    assert partage_service.lien_valide_par_token(db, lien.token) is None


def test_lien_valide_par_token_inconnu_renvoie_none(db):
    assert partage_service.lien_valide_par_token(db, "jeton-inexistant") is None


def test_verifier_code_sans_code_requis_accepte_tout(db):
    lien = _creer(db, code=None)
    assert partage_service.verifier_code(lien, None) is True
    assert partage_service.verifier_code(lien, "peu importe") is True


def test_verifier_code_bon_code(db):
    lien = _creer(db, code="1234")
    assert partage_service.verifier_code(lien, "1234") is True


def test_verifier_code_mauvais_code(db):
    lien = _creer(db, code="1234")
    assert partage_service.verifier_code(lien, "9999") is False
    assert partage_service.verifier_code(lien, None) is False


def test_verrouillage_actif_sous_le_seuil_renvoie_none(db):
    lien = _creer(db, code="1234")
    for _ in range(partage_service.SEUIL_TENTATIVES - 1):
        partage_service.journaliser_acces(db, lien.id, "1.2.3.4", "code_incorrect")
    assert partage_service.verrouillage_actif(db, lien.id) is None


def test_verrouillage_declenche_au_seuil(db):
    lien = _creer(db, code="1234")
    for _ in range(partage_service.SEUIL_TENTATIVES):
        partage_service.journaliser_acces(db, lien.id, "1.2.3.4", "code_incorrect")
    assert partage_service.verrouillage_actif(db, lien.id) is not None


def test_verrouillage_ne_deborde_pas_sur_un_autre_lien(db):
    lien_a = _creer(db, code="1234")
    lien_b = _creer(db, code="5678")
    for _ in range(partage_service.SEUIL_TENTATIVES):
        partage_service.journaliser_acces(db, lien_a.id, "1.2.3.4", "code_incorrect")
    assert partage_service.verrouillage_actif(db, lien_a.id) is not None
    assert partage_service.verrouillage_actif(db, lien_b.id) is None


def test_verrouillage_se_leve_apres_la_duree(db):
    lien = _creer(db, code="1234")
    for _ in range(partage_service.SEUIL_TENTATIVES):
        partage_service.journaliser_acces(db, lien.id, "1.2.3.4", "code_incorrect")
    assert partage_service.verrouillage_actif(db, lien.id) is not None

    decalage = timedelta(minutes=partage_service.FENETRE_VERROUILLAGE_MINUTES + partage_service.DUREE_VERROUILLAGE_MINUTES + 1)
    for entree in db.query(PartageAcces).filter(PartageAcces.lien_id == lien.id).all():
        entree.timestamp = entree.timestamp - decalage
    db.commit()

    assert partage_service.verrouillage_actif(db, lien.id) is None


def test_compute_payload_sections_desactivees_sont_none(db):
    lien = _creer(db, inclure_patrimoine_net=False, inclure_repartition=False, inclure_performance=False)
    payload = partage_service.compute_payload(db, lien)
    assert payload["patrimoine_net"] is None
    assert payload["exposition"] is None
    assert payload["performance"] is None
    assert payload["budget"] is None
    assert payload["objectifs"] is None


def test_compute_payload_sections_activees_sont_renseignees(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    lien = _creer(db)
    payload = partage_service.compute_payload(db, lien)
    assert payload["patrimoine_net"] is not None
    assert payload["exposition"] is not None
    assert payload["performance"] is not None
    assert payload["patrimoine_net"]["actifs_totaux"] == 1000.0


def test_compute_payload_masquer_valeurs_remplace_les_montants_par_des_pourcentages(db):
    make_holding(db, ticker="AAA", type_actif="STOCK", quantite=10, prix_revient_moyen=100.0)
    make_holding(db, ticker="MAISON", type_actif="REAL_ESTATE", quantite=1, prix_revient_moyen=9000.0, valeur_estimee=9000.0)
    lien = _creer(db, masquer_valeurs=True)

    payload = partage_service.compute_payload(db, lien)

    assert payload["masque"] is True
    assert payload["patrimoine_net"]["actifs_totaux"] is None
    assert payload["patrimoine_net"]["patrimoine_net"] is None
    for item in payload["patrimoine_net"]["repartition_par_classe"]:
        assert item["valeur"] is None
        assert item["pourcentage"] > 0
    assert payload["exposition"]["valeur_totale"] is None
    # Les pourcentages/ratios eux-mêmes ne sont jamais masqués (ce ne sont ni des
    # valeurs ni des quantités).
    assert payload["exposition"]["plus_grosse_ligne_pct"] is not None
