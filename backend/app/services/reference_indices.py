"""Données de référence statiques (approximation MSCI World), éditables par l'utilisateur
dans l'appli une fois importées comme point de départ des objectifs annuels.
"""

DEFAULT_GEO_TARGETS: dict[str, float] = {
    "Amérique du Nord": 16.67,
    "Europe": 16.67,
    "Japon": 16.67,
    "Asie-Pacifique (hors Japon)": 16.67,
    "Marchés émergents": 16.67,
    "Autres": 16.65,
}

DEFAULT_SECTOR_TARGETS: dict[str, float] = {
    "Technologies de l'information": 23,
    "Financières": 15,
    "Santé": 11,
    "Consommation discrétionnaire": 11,
    "Industrie": 11,
    "Communication": 8,
    "Consommation de base": 6,
    "Énergie": 5,
    "Matériaux": 4,
    "Services publics": 3,
    "Immobilier": 3,
}

# Pays (tels que renvoyés par yfinance) -> région utilisée dans les objectifs géographiques
COUNTRY_TO_REGION: dict[str, str] = {
    "United States": "Amérique du Nord",
    "Canada": "Amérique du Nord",
    "Japan": "Japon",
    "United Kingdom": "Europe",
    "France": "Europe",
    "Germany": "Europe",
    "Switzerland": "Europe",
    "Netherlands": "Europe",
    "Spain": "Europe",
    "Italy": "Europe",
    "Sweden": "Europe",
    "Denmark": "Europe",
    "Belgium": "Europe",
    "Norway": "Europe",
    "Finland": "Europe",
    "Ireland": "Europe",
    "Austria": "Europe",
    "Portugal": "Europe",
    "Luxembourg": "Europe",
    "Australia": "Asie-Pacifique (hors Japon)",
    "Hong Kong": "Asie-Pacifique (hors Japon)",
    "Singapore": "Asie-Pacifique (hors Japon)",
    "New Zealand": "Asie-Pacifique (hors Japon)",
    "China": "Marchés émergents",
    "India": "Marchés émergents",
    "Brazil": "Marchés émergents",
    "South Korea": "Marchés émergents",
    "Taiwan": "Marchés émergents",
    "Mexico": "Marchés émergents",
    "South Africa": "Marchés émergents",
    "Indonesia": "Marchés émergents",
    "Thailand": "Marchés émergents",
    "Malaysia": "Marchés émergents",
    "Poland": "Marchés émergents",
    "Turkey": "Marchés émergents",
}

# Secteur yfinance (GICS) -> libellé utilisé dans les objectifs sectoriels
SECTOR_LABELS: dict[str, str] = {
    "Technology": "Technologies de l'information",
    "Financial Services": "Financières",
    "Healthcare": "Santé",
    "Consumer Cyclical": "Consommation discrétionnaire",
    "Industrials": "Industrie",
    "Communication Services": "Communication",
    "Consumer Defensive": "Consommation de base",
    "Energy": "Énergie",
    "Basic Materials": "Matériaux",
    "Utilities": "Services publics",
    "Real Estate": "Immobilier",
}

# Clés de `yfinance.Ticker(...).funds_data.sector_weightings` (snake_case, format
# différent de SECTOR_LABELS ci-dessus qui vise `.info['sector']`) -> même libellé
# français, pour pouvoir agréger fonds et actions individuelles dans les mêmes catégories.
FUND_SECTOR_WEIGHTING_LABELS: dict[str, str] = {
    "technology": "Technologies de l'information",
    "financial_services": "Financières",
    "healthcare": "Santé",
    "consumer_cyclical": "Consommation discrétionnaire",
    "industrials": "Industrie",
    "communication_services": "Communication",
    "consumer_defensive": "Consommation de base",
    "energy": "Énergie",
    "basic_materials": "Matériaux",
    "utilities": "Services publics",
    "realestate": "Immobilier",
}


# Émetteurs d'ETF/fonds connus, utilisés en repli quand `yfinance` ne renseigne pas
# `fundFamily` (certaines cotations secondaires, ex. places allemandes, n'ont qu'un
# flux de cours minimal sans données fondamentales). Le nom du fonds renvoyé par
# yfinance inclut presque toujours la marque de l'émetteur (ex. "SPDR MSCI All
# Country World...", "iShares Core MSCI World...") : on la retrouve par recherche
# de mot-clé plutôt que de deviner une donnée non fournie.
KNOWN_FUND_ISSUERS: list[str] = [
    "iShares",
    "Xtrackers",
    "Amundi",
    "Lyxor",
    "SPDR",
    "Vanguard",
    "Invesco",
    "WisdomTree",
    "VanEck",
    "HSBC",
    "UBS",
    "BNP Paribas",
    "Franklin",
    "JPMorgan",
    "Fidelity",
    "Legal & General",
    "Ossiam",
    "GlobalX",
    "First Trust",
    "PIMCO",
    "Goldman Sachs",
    "Deka",
    "ComStage",
    "Multi Units",
    "CoreShares",
    "Société Générale",
]


def region_for_country(country: str | None) -> str:
    if not country:
        return "Autres"
    return COUNTRY_TO_REGION.get(country, "Autres")


def label_for_sector(sector: str | None) -> str:
    if not sector:
        return "Autres"
    return SECTOR_LABELS.get(sector, "Autres")


def guess_emetteur_from_name(nom: str | None) -> str | None:
    if not nom:
        return None
    nom_lower = nom.lower()
    for issuer in KNOWN_FUND_ISSUERS:
        if issuer.lower() in nom_lower:
            return issuer
    return None
