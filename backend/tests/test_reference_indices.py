"""Verrouille la reconnaissance des indices de repli (2.1) et la distinction entre
donnée manquante et zone/secteur résiduel connu (2.2)."""

import pytest

from app.services.reference_indices import (
    REPARTITIONS_GEO_PAR_INDICE,
    ZONE_AMERIQUE_DU_NORD,
    ZONE_ASIE_PACIFIQUE,
    ZONE_AUTRES,
    ZONE_EUROPE,
    ZONE_JAPON,
    ZONE_MARCHES_EMERGENTS,
    label_for_sector,
    region_for_country,
    repartition_geo_depuis_le_nom,
)

# Un nom de fonds plausible par famille du tableau de la consigne, et la zone qui
# devrait dominer sa répartition (celle avec le poids le plus élevé).
NOMS_PAR_FAMILLE = [
    ("iShares Core MSCI World UCITS ETF", ZONE_AMERIQUE_DU_NORD),
    ("Amundi FTSE Developed World UCITS ETF", ZONE_AMERIQUE_DU_NORD),
    ("SPDR MSCI ACWI UCITS ETF", ZONE_AMERIQUE_DU_NORD),
    ("Vanguard All-World UCITS ETF", ZONE_AMERIQUE_DU_NORD),
    ("iShares Core S&P 500 UCITS ETF", ZONE_AMERIQUE_DU_NORD),
    ("Invesco Nasdaq-100 UCITS ETF", ZONE_AMERIQUE_DU_NORD),
    ("iShares MSCI Emerging Markets UCITS ETF", ZONE_MARCHES_EMERGENTS),
    ("Xtrackers MSCI EM UCITS ETF", ZONE_MARCHES_EMERGENTS),
    ("iShares MSCI EAFE UCITS ETF", ZONE_EUROPE),
    ("SPDR MSCI World ex US UCITS ETF", ZONE_EUROPE),
    ("Lyxor Euro Stoxx 50 UCITS ETF", ZONE_EUROPE),
    ("Amundi CAC 40 UCITS ETF", ZONE_EUROPE),
    ("iShares MSCI Europe UCITS ETF", ZONE_EUROPE),
    ("Xtrackers Nikkei 225 UCITS ETF", ZONE_JAPON),
    ("iShares MSCI Japan UCITS ETF", ZONE_JAPON),
    ("iShares Asia Pacific ex Japan UCITS ETF", ZONE_ASIE_PACIFIQUE),
    ("iShares MSCI Australia UCITS ETF", ZONE_ASIE_PACIFIQUE),
    ("iShares MSCI China UCITS ETF", ZONE_MARCHES_EMERGENTS),
    ("Xtrackers CSI 300 UCITS ETF", ZONE_MARCHES_EMERGENTS),
    ("iShares MSCI India UCITS ETF", ZONE_MARCHES_EMERGENTS),
    ("iShares MSCI Brazil UCITS ETF", ZONE_MARCHES_EMERGENTS),
]


@pytest.mark.parametrize("nom,zone_dominante", NOMS_PAR_FAMILLE)
def test_repartition_geo_depuis_le_nom_reconnait_chaque_famille(nom, zone_dominante):
    repartition = repartition_geo_depuis_le_nom(nom)

    assert repartition is not None, f"'{nom}' devrait être reconnu"
    zone_max = max(repartition, key=repartition.get)
    assert zone_max == zone_dominante


def test_repartition_geo_depuis_le_nom_nom_non_reconnu():
    assert repartition_geo_depuis_le_nom("Obligation Trésor Français 2032") is None


def test_repartition_geo_depuis_le_nom_nom_absent():
    assert repartition_geo_depuis_le_nom(None) is None
    assert repartition_geo_depuis_le_nom("") is None


def test_priorite_world_ex_us_sur_msci_world():
    """'MSCI World ex US' contient à la fois le mot-clé spécifique 'world ex us' et
    le mot-clé générique 'msci world' : la famille spécifique doit l'emporter."""
    repartition = repartition_geo_depuis_le_nom("iShares MSCI World ex US UCITS ETF")

    assert repartition[ZONE_EUROPE] == pytest.approx(0.62)
    assert repartition[ZONE_AMERIQUE_DU_NORD] == pytest.approx(0.0)


def test_priorite_msci_china_sur_msci_world():
    """Un nom contenant à la fois ' china' et 'msci world' doit être classé comme
    un indice Chine (marchés émergents), pas comme MSCI World."""
    repartition = repartition_geo_depuis_le_nom("iShares MSCI World China UCITS ETF")

    assert repartition[ZONE_MARCHES_EMERGENTS] == pytest.approx(1.0)
    assert repartition[ZONE_AMERIQUE_DU_NORD] == pytest.approx(0.0)


@pytest.mark.parametrize(
    "mots_cles,repartition",
    REPARTITIONS_GEO_PAR_INDICE,
    ids=[mots_cles[0] for mots_cles, _ in REPARTITIONS_GEO_PAR_INDICE],
)
def test_chaque_entree_de_la_table_somme_a_un(mots_cles, repartition):
    """Garde-fou contre une faute de frappe dans les pourcentages : chaque ligne du
    tableau de la consigne doit sommer à 100%."""
    assert sum(repartition.values()) == pytest.approx(1.0, abs=1e-9)


def test_region_for_country_pays_connu():
    assert region_for_country("France") == ZONE_EUROPE


def test_region_for_country_pays_non_repertorie():
    """Pays réel mais absent de `COUNTRY_TO_REGION` : zone résiduelle connue, pas
    une donnée manquante."""
    assert region_for_country("Zimbabwe") == ZONE_AUTRES


def test_region_for_country_donnee_absente():
    assert region_for_country(None) == "Non catégorisé"
    assert region_for_country("") == "Non catégorisé"


def test_label_for_sector_secteur_connu():
    assert label_for_sector("Technology") == "Technologies de l'information"


def test_label_for_sector_secteur_non_repertorie():
    assert label_for_sector("Secteur inconnu") == "Autres secteurs"


def test_label_for_sector_donnee_absente():
    assert label_for_sector(None) == "Non catégorisé"
    assert label_for_sector("") == "Non catégorisé"


def test_obligations_reconnues_par_leur_devise_de_reference():
    """Les ETF obligataires n'ont ni composition Yahoo ni nom d'indice actions : leur
    univers d'émetteurs se déduit de la devise de référence portée par le libellé
    (cas réels : « iShares iBonds Dec 2034 Term € Corp » / « … $ Corp »)."""
    euro = repartition_geo_depuis_le_nom("iShares iBonds Dec 2034 Term € Corp UCITS ETF EUR (Dist)")
    assert euro is not None
    assert euro[ZONE_EUROPE] == 1.0

    dollar = repartition_geo_depuis_le_nom("iShares iBonds Dec 2034 Term $ Corp UCITS ETF USD (Dist)")
    assert dollar is not None
    assert dollar[ZONE_AMERIQUE_DU_NORD] == 1.0


def test_fonds_thematique_sans_indice_reconnaissable_reste_non_estime():
    """Un fonds thématique mondial (« Global Luxury ») n'a pas de zone déductible de
    son nom : mieux vaut ne rien estimer que d'inventer une répartition."""
    assert repartition_geo_depuis_le_nom("Amundi Index Solutions - Amundi Global Luxury UCITS ETF EUR Acc") is None
