"""Données de référence statiques : libellés de zones et de secteurs, correspondance
pays -> zone, objectifs par défaut proposés à l'utilisateur (éditables dans l'appli),
et répartitions géographiques de repli déduites de l'indice suivi par un fonds.

Ces répartitions de repli ne servent QUE lorsque la composition réelle du fonds n'est
pas disponible chez le fournisseur de données : ce sont des approximations, à revoir
périodiquement, et les lignes qu'elles produisent sont marquées comme telles
(`FundComposition.source`) pour que l'interface puisse le signaler à l'utilisateur.
"""

# Libellés de zone géographique, utilisés à la fois par `COUNTRY_TO_REGION` (pays
# réel d'une ligne individuelle) et par `REPARTITIONS_GEO_PAR_INDICE` (estimation
# à partir de l'indice suivi par un fonds) : les deux mécanismes doivent aboutir
# aux mêmes catégories pour pouvoir être sommés dans les graphiques.
ZONE_AMERIQUE_DU_NORD = "Amérique du Nord"
ZONE_EUROPE = "Europe"
ZONE_JAPON = "Japon"
ZONE_ASIE_PACIFIQUE = "Asie-Pacifique (hors Japon)"
ZONE_MARCHES_EMERGENTS = "Marchés émergents"
ZONE_AUTRES = "Autres zones"

# Catégorie fourre-tout historiquement appelée "Autres" ; renommée "Autres zones"
# pour la distinguer de "Non catégorisé" (donnée manquante, cf. `region_for_country`)
# — un objectif enregistré sur "Autres" désigne toujours une vraie zone géographique
# résiduelle, jamais une absence de donnée. Les objectifs existants en base sont
# migrés vers ce nouveau libellé par `database.migrate_rename_categorie_autres`.
DEFAULT_GEO_TARGETS: dict[str, float] = {
    ZONE_AMERIQUE_DU_NORD: 16.67,
    ZONE_EUROPE: 16.67,
    ZONE_JAPON: 16.67,
    ZONE_ASIE_PACIFIQUE: 16.67,
    ZONE_MARCHES_EMERGENTS: 16.67,
    ZONE_AUTRES: 16.65,
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
    "United States": ZONE_AMERIQUE_DU_NORD,
    "Canada": ZONE_AMERIQUE_DU_NORD,
    "Japan": ZONE_JAPON,
    "United Kingdom": ZONE_EUROPE,
    "France": ZONE_EUROPE,
    "Germany": ZONE_EUROPE,
    "Switzerland": ZONE_EUROPE,
    "Netherlands": ZONE_EUROPE,
    "Spain": ZONE_EUROPE,
    "Italy": ZONE_EUROPE,
    "Sweden": ZONE_EUROPE,
    "Denmark": ZONE_EUROPE,
    "Belgium": ZONE_EUROPE,
    "Norway": ZONE_EUROPE,
    "Finland": ZONE_EUROPE,
    "Ireland": ZONE_EUROPE,
    "Austria": ZONE_EUROPE,
    "Portugal": ZONE_EUROPE,
    "Luxembourg": ZONE_EUROPE,
    "Israel": ZONE_EUROPE,
    "Greece": ZONE_EUROPE,
    "Cyprus": ZONE_EUROPE,
    "Iceland": ZONE_EUROPE,
    "Liechtenstein": ZONE_EUROPE,
    "Monaco": ZONE_EUROPE,
    "Czechia": ZONE_EUROPE,
    "Czech Republic": ZONE_EUROPE,  # variante encore renvoyée par certaines sources yfinance
    "Hungary": ZONE_EUROPE,
    "Romania": ZONE_EUROPE,
    "Slovenia": ZONE_EUROPE,
    "Slovakia": ZONE_EUROPE,
    "Estonia": ZONE_EUROPE,
    "Latvia": ZONE_EUROPE,
    "Lithuania": ZONE_EUROPE,
    "Croatia": ZONE_EUROPE,
    "Bulgaria": ZONE_EUROPE,
    "Australia": ZONE_ASIE_PACIFIQUE,
    "Hong Kong": ZONE_ASIE_PACIFIQUE,
    "Singapore": ZONE_ASIE_PACIFIQUE,
    "New Zealand": ZONE_ASIE_PACIFIQUE,
    "China": ZONE_MARCHES_EMERGENTS,
    "India": ZONE_MARCHES_EMERGENTS,
    "Brazil": ZONE_MARCHES_EMERGENTS,
    "South Korea": ZONE_MARCHES_EMERGENTS,
    "Taiwan": ZONE_MARCHES_EMERGENTS,
    "Mexico": ZONE_MARCHES_EMERGENTS,
    "South Africa": ZONE_MARCHES_EMERGENTS,
    "Indonesia": ZONE_MARCHES_EMERGENTS,
    "Thailand": ZONE_MARCHES_EMERGENTS,
    "Malaysia": ZONE_MARCHES_EMERGENTS,
    "Poland": ZONE_MARCHES_EMERGENTS,
    "Turkey": ZONE_MARCHES_EMERGENTS,
    "Argentina": ZONE_MARCHES_EMERGENTS,
    "Chile": ZONE_MARCHES_EMERGENTS,
    "Colombia": ZONE_MARCHES_EMERGENTS,
    "Peru": ZONE_MARCHES_EMERGENTS,
    "Uruguay": ZONE_MARCHES_EMERGENTS,
    "Egypt": ZONE_MARCHES_EMERGENTS,
    "Morocco": ZONE_MARCHES_EMERGENTS,
    "Nigeria": ZONE_MARCHES_EMERGENTS,
    "Kenya": ZONE_MARCHES_EMERGENTS,
    "Qatar": ZONE_MARCHES_EMERGENTS,
    "United Arab Emirates": ZONE_MARCHES_EMERGENTS,
    "Saudi Arabia": ZONE_MARCHES_EMERGENTS,
    "Kuwait": ZONE_MARCHES_EMERGENTS,
    "Philippines": ZONE_MARCHES_EMERGENTS,
    "Vietnam": ZONE_MARCHES_EMERGENTS,
    "Pakistan": ZONE_MARCHES_EMERGENTS,
    "Bangladesh": ZONE_MARCHES_EMERGENTS,
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

# Nom de secteur affiché par justETF (fiche ETF, section "Sector breakdown") ->
# même libellé français, pour pouvoir agréger avec les deux tables ci-dessus dans
# les mêmes catégories. Taxonomie encore différente des deux précédentes (ni le
# GICS de `.info['sector']`, ni le snake_case de `funds_data.sector_weightings') :
# justETF utilise ses propres intitulés anglais courts (ex. "Finance" au lieu de
# "Financial Services"), d'où cette troisième table plutôt que de réutiliser l'une
# des deux existantes. Une catégorie absente d'ici (non observée à la
# reconnaissance) bascule sur SECTEUR_AUTRES au niveau de l'appelant, comme pour
# `region_for_country`/`label_for_sector`.
JUSTETF_SECTOR_LABELS: dict[str, str] = {
    "Finance": "Financières",
    "Technology": "Technologies de l'information",
    "Industrials": "Industrie",
    "Healthcare": "Santé",
    "Consumer Discretionary": "Consommation discrétionnaire",
    "Consumer Staples": "Consommation de base",
    "Communication": "Communication",
    "Energy": "Énergie",
    "Materials": "Matériaux",
    "Utilities": "Services publics",
    "Real Estate": "Immobilier",
}


# Libellé du secteur fourre-tout, distinct de "Non catégorisé" (donnée absente) pour
# la même raison que ZONE_AUTRES ci-dessus.
SECTEUR_AUTRES = "Autres secteurs"

# Catégorie utilisée quand la donnée elle-même manque (pays/secteur non renseigné par
# Yahoo Finance, ou aucune composition connue pour le fonds) — à ne pas confondre avec
# ZONE_AUTRES/SECTEUR_AUTRES qui désignent une zone/un secteur réel mais hors de nos
# catégories habituelles (cf. 2.2 : "Non catégorisé" = donnée manquante, "Autres
# zones"/"Autres secteurs" = donnée connue mais résiduelle).
NON_CATEGORISE = "Non catégorisé"


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
    """Distingue deux causes bien différentes de fourre-tout (cf. 2.2) : `country`
    absent -> la donnée manque ("Non catégorisé") ; `country` renseigné mais absent
    de `COUNTRY_TO_REGION` -> le pays est connu, sa zone n'est simplement pas encore
    répertoriée ("Autres zones")."""
    if not country:
        return NON_CATEGORISE
    return COUNTRY_TO_REGION.get(country, ZONE_AUTRES)


def label_for_sector(sector: str | None) -> str:
    """Même distinction que `region_for_country`, côté secteur."""
    if not sector:
        return NON_CATEGORISE
    return SECTOR_LABELS.get(sector, SECTEUR_AUTRES)


def guess_emetteur_from_name(nom: str | None) -> str | None:
    if not nom:
        return None
    nom_lower = nom.lower()
    for issuer in KNOWN_FUND_ISSUERS:
        if issuer.lower() in nom_lower:
            return issuer
    return None


# --------------------------------------------------------------------------------
# Répartition géographique estimée à partir de l'indice suivi (repli quand Yahoo ne
# fournit pas `top_holdings`, cf. 2.1). Ce sont des ordres de grandeur approximatifs
# (arrondis à l'unité, composition réelle des indices à une date donnée) et non des
# valeurs exactes ni figées dans le temps : la pondération pays des indices larges
# (MSCI World, ACWI...) dérive lentement avec les capitalisations boursières. À
# revoir périodiquement (au minimum une fois par an) plutôt qu'à considérer comme
# une vérité définitive.
#
# Chaque entrée associe une liste de mots-clés (recherchés tels quels, en minuscules,
# comme sous-chaîne du nom du fonds) à une répartition en fraction 0-1 sur les zones
# de `COUNTRY_TO_REGION` (+ ZONE_AUTRES). C'est une LISTE ORDONNÉE et non un
# dictionnaire car l'ordre de recherche est significatif : plusieurs noms de fonds
# réels contiennent à la fois un mot-clé spécifique et un mot-clé plus générique
# (ex. "iShares MSCI World ex USA" contient à la fois "world ex us" ET "msci world" ;
# "iShares MSCI World China UCITS ETF" contient à la fois " china" ET "msci world").
# Les familles les plus spécifiques doivent donc être testées avant les familles
# larges ("msci world"/"acwi") qui servent de repli générique en dernier recours.
REPARTITIONS_GEO_PAR_INDICE: list[tuple[list[str], dict[str, float]]] = [
    # Monde développé hors États-Unis (EAFE) : à tester avant "msci world" car les
    # noms de fonds "MSCI World ex USA" contiennent aussi le mot-clé "msci world".
    (
        ["eafe", "world ex us", "world ex-us", "world ex usa"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.0,
            ZONE_EUROPE: 0.62,
            ZONE_JAPON: 0.22,
            ZONE_ASIE_PACIFIQUE: 0.12,
            ZONE_MARCHES_EMERGENTS: 0.0,
            ZONE_AUTRES: 0.04,
        },
    ),
    # Chine/Inde/Brésil et indices actions chinoises : à tester avant "msci world"
    # pour la même raison (ex. "MSCI World China" contient " china" ET "msci world").
    (
        ["msci china", "csi 300", " china", " india", " brazil"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.0,
            ZONE_EUROPE: 0.0,
            ZONE_JAPON: 0.0,
            ZONE_ASIE_PACIFIQUE: 0.0,
            ZONE_MARCHES_EMERGENTS: 1.0,
            ZONE_AUTRES: 0.0,
        },
    ),
    # Indices actions européens.
    (
        ["euro stoxx", "eurostoxx", "stoxx europe", "msci europe", "msci emu", "cac 40", "dax", "ftse 100", "msci france", "msci germany"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.0,
            ZONE_EUROPE: 1.0,
            ZONE_JAPON: 0.0,
            ZONE_ASIE_PACIFIQUE: 0.0,
            ZONE_MARCHES_EMERGENTS: 0.0,
            ZONE_AUTRES: 0.0,
        },
    ),
    # Indices actions japonais.
    (
        ["nikkei", "topix", "msci japan"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.0,
            ZONE_EUROPE: 0.0,
            ZONE_JAPON: 1.0,
            ZONE_ASIE_PACIFIQUE: 0.0,
            ZONE_MARCHES_EMERGENTS: 0.0,
            ZONE_AUTRES: 0.0,
        },
    ),
    # Asie-Pacifique développée hors Japon.
    (
        ["pacific ex japan", "asia ex japan", "asia ex-japan", "msci australia"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.0,
            ZONE_EUROPE: 0.0,
            ZONE_JAPON: 0.0,
            ZONE_ASIE_PACIFIQUE: 1.0,
            ZONE_MARCHES_EMERGENTS: 0.0,
            ZONE_AUTRES: 0.0,
        },
    ),
    # Obligations d'entreprise libellées en euro : l'univers d'un fonds "€ Corp" est
    # par construction constitué d'émetteurs de la zone euro. À tester avant les
    # indices actions, dont aucun mot-clé ne peut apparaître dans ces noms.
    (
        ["€ corp", "eur corp", "euro corp", "euro government", "eurozone government", "€ govt", "eur govt"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.0,
            ZONE_EUROPE: 1.0,
            ZONE_JAPON: 0.0,
            ZONE_ASIE_PACIFIQUE: 0.0,
            ZONE_MARCHES_EMERGENTS: 0.0,
            ZONE_AUTRES: 0.0,
        },
    ),
    # Obligations d'entreprise ou d'État libellées en dollar : émetteurs très
    # majoritairement nord-américains.
    (
        ["$ corp", "usd corp", "us corp", "$ treasury", "us treasury", "$ govt", "usd govt"],
        {
            ZONE_AMERIQUE_DU_NORD: 1.0,
            ZONE_EUROPE: 0.0,
            ZONE_JAPON: 0.0,
            ZONE_ASIE_PACIFIQUE: 0.0,
            ZONE_MARCHES_EMERGENTS: 0.0,
            ZONE_AUTRES: 0.0,
        },
    ),
    # Grands indices actions américains.
    (
        ["s&p 500", "sp 500", "msci usa", "nasdaq", "russell", "us equity"],
        {
            ZONE_AMERIQUE_DU_NORD: 1.0,
            ZONE_EUROPE: 0.0,
            ZONE_JAPON: 0.0,
            ZONE_ASIE_PACIFIQUE: 0.0,
            ZONE_MARCHES_EMERGENTS: 0.0,
            ZONE_AUTRES: 0.0,
        },
    ),
    # Marchés émergents au sens large.
    (
        ["emerging", "msci em"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.0,
            ZONE_EUROPE: 0.0,
            ZONE_JAPON: 0.0,
            ZONE_ASIE_PACIFIQUE: 0.0,
            ZONE_MARCHES_EMERGENTS: 1.0,
            ZONE_AUTRES: 0.0,
        },
    ),
    # Marché mondial toutes zones (développés + émergents) : plus large qu'ACWI
    # n'existe pas dans ce repli, donc testé juste avant "msci world" qui est le
    # plus générique de tous.
    (
        ["acwi", "all country world", "all-world", "all world"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.66,
            ZONE_EUROPE: 0.15,
            ZONE_JAPON: 0.05,
            ZONE_ASIE_PACIFIQUE: 0.03,
            ZONE_MARCHES_EMERGENTS: 0.10,
            ZONE_AUTRES: 0.01,
        },
    ),
    # Marché développé au sens large (MSCI World) : famille la plus générique,
    # testée en dernier pour ne jamais masquer une famille plus spécifique ci-dessus.
    (
        ["msci world", "ftse developed", "developed world"],
        {
            ZONE_AMERIQUE_DU_NORD: 0.74,
            ZONE_EUROPE: 0.16,
            ZONE_JAPON: 0.06,
            ZONE_ASIE_PACIFIQUE: 0.03,
            ZONE_MARCHES_EMERGENTS: 0.0,
            ZONE_AUTRES: 0.01,
        },
    ),
]


def repartition_geo_depuis_le_nom(nom: str | None) -> dict[str, float] | None:
    """Répartition géographique de repli déduite du nom de l'indice suivi par le
    fonds, quand Yahoo Finance ne fournit pas sa composition détaillée
    (`top_holdings`). Renvoie `None` si aucun indice connu n'est reconnu dans le
    nom — le holding reste alors "Non catégorisé", sans régression par rapport au
    comportement actuel."""
    if not nom:
        return None
    nom_lower = nom.lower()
    for mots_cles, repartition in REPARTITIONS_GEO_PAR_INDICE:
        if any(mot_cle in nom_lower for mot_cle in mots_cles):
            return dict(repartition)
    return None
