"""Unitaires du service `csv_export` (LOT 5.2) : mise en forme des cellules,
indépendamment de tout appel HTTP (cf. `test_export.py` pour les routes)."""

from datetime import datetime

from app.services.csv_export import construire_csv, echapper_cellule, formater_horodatage, formater_nombre


class TestFormaterNombre:
    def test_valeur_negative(self):
        assert formater_nombre(-1234.5) == "-1234,50"

    def test_valeur_nulle(self):
        assert formater_nombre(0) == "0,00"

    def test_none_devient_cellule_vide(self):
        assert formater_nombre(None) == ""

    def test_grand_nombre(self):
        assert formater_nombre(1234567.891) == "1234567,89"

    def test_nombre_de_decimales_personnalise(self):
        assert formater_nombre(3.14159, decimales=0) == "3"


class TestEchapperCellule:
    def test_cellule_simple_non_modifiee(self):
        assert echapper_cellule("AAPL") == "AAPL"

    def test_separateur_point_virgule_entoure_de_guillemets(self):
        assert echapper_cellule("Acheteur; vendeur") == '"Acheteur; vendeur"'

    def test_guillemet_interne_double_et_cellule_entouree(self):
        assert echapper_cellule('Fonds "Croissance"') == '"Fonds ""Croissance"""'

    def test_retour_a_la_ligne_entoure_de_guillemets(self):
        assert echapper_cellule("Ligne 1\nLigne 2") == '"Ligne 1\nLigne 2"'


class TestConstruireCsv:
    def test_en_tete_seule_sans_lignes(self):
        assert construire_csv(["A", "B"], []) == "A;B\r\n"

    def test_separateur_point_virgule_et_fin_de_ligne_crlf(self):
        resultat = construire_csv(["Ticker", "Valeur"], [["AAPL", "1234,50"]])
        assert resultat == "Ticker;Valeur\r\nAAPL;1234,50\r\n"

    def test_echappement_applique_a_chaque_cellule(self):
        resultat = construire_csv(["Nom"], [["Fonds; Croissance"]])
        assert resultat == 'Nom\r\n"Fonds; Croissance"\r\n'


class TestFormaterHorodatage:
    def test_valeur(self):
        assert formater_horodatage(datetime(2026, 8, 18, 14, 32)) == "18/08/2026 14:32"

    def test_none_devient_cellule_vide(self):
        assert formater_horodatage(None) == ""
