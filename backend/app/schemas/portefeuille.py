from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

from ..models import TYPES_ACTIF_SANS_ETABLISSEMENT
from .commun import RepartitionItem
from .comptes import CompteOut, EtablissementOut
from .detenteurs import QuotiteDetenteurItem
from .donnees_marche import MarketDataOut
from .validateurs import (
    MESSAGE_PRIX_NON_NEGATIF,
    MESSAGE_QUANTITE_POSITIVE,
    MESSAGE_TICKER_VIDE,
    MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE,
    _normaliser_ticker,
    _valider_date_jour_non_future,
)


class HoldingBase(BaseModel):
    ticker: str
    nom: str | None = None
    quantite: float
    prix_revient_moyen: float | None = None
    devise: str | None = None
    type_actif: str | None = None
    # Valorisation manuelle (Phase 1 de `docs/ROADMAP.md`, immobilier/SCPI/assurance-vie/
    # PER — cf. `models.TYPES_ACTIF_PATRIMOINE_MANUEL`) : montant ABSOLU en euros, pas
    # un prix par part. `date_valeur_estimee` n'est jamais saisie par le client — posée
    # côté serveur au moment où `valeur_estimee` change (cf. `routers/portfolio.py`).
    valeur_estimee: float | None = None
    # Taux annuel informatif (backlog § 2.M.1) : positif = intérêt attendu (épargne),
    # négatif = décote attendue (véhicule) — cf. `models.Holding.taux_pct`.
    taux_pct: float | None = None
    # Zone géographique déclarée pour un actif valorisé manuellement (backlog 2.P.1) —
    # cf. `models.Holding.zone_geo`.
    zone_geo: str | None = None
    # Versement mensuel récurrent déclaré (backlog 2.S.1, écran Épargne) — cf.
    # `models.Holding.versement_mensuel`.
    versement_mensuel: float | None = None
    # Date d'acquisition déclarée par l'utilisateur (format AAAA-MM-JJ, comme
    # `ValorisationInput.date`) — cf. `models.Holding.date_acquisition`. Chaîne côté
    # saisie/validation, convertie en `datetime` par le routeur avant stockage
    # (`HoldingOut` la redéclare en `datetime` pour la réponse).
    date_acquisition: str | None = None

    @field_validator("ticker")
    @classmethod
    def _valider_ticker(cls, v: str) -> str:
        v = _normaliser_ticker(v)
        if not v:
            raise ValueError(MESSAGE_TICKER_VIDE)
        return v

    @field_validator("quantite")
    @classmethod
    def _valider_quantite(cls, v: float) -> float:
        if v <= 0:
            raise ValueError(MESSAGE_QUANTITE_POSITIVE)
        return v

    @field_validator("prix_revient_moyen")
    @classmethod
    def _valider_prix_revient(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_PRIX_NON_NEGATIF)
        return v

    @field_validator("valeur_estimee")
    @classmethod
    def _valider_valeur_estimee(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE)
        return v

    @field_validator("versement_mensuel")
    @classmethod
    def _valider_versement_mensuel(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Le versement mensuel doit être positif ou nul")
        return v

    @field_validator("date_acquisition")
    @classmethod
    def _valider_date_acquisition(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _valider_date_jour_non_future(v, "La date d'acquisition")


class HoldingCreate(HoldingBase):
    # Compte structurel (écran Comptes) : `compte_id` référence un compte déjà
    # existant (vérifié appartenir à l'utilisateur côté routeur — IDOR) ;
    # `compte_nom` crée un compte à la volée s'il n'existe pas encore sous ce nom
    # (préserve l'ergonomie de saisie libre d'avant cette migration). Si les deux
    # sont fournis, `compte_id` prime.
    compte_id: int | None = None
    compte_nom: str | None = None
    # Établissement du compte CRÉÉ À LA VOLÉE (revue du 03/09/2026) — sans objet si
    # `compte_id` référence un compte déjà existant (son établissement ne change
    # pas ici), ou si `compte_nom` est absent. Même priorité id > nom que pour le
    # compte lui-même. Vérifiés côté routeur (IDOR), comme `compte_id`.
    etablissement_id: int | None = None
    etablissement_nom: str | None = None

    @field_validator("compte_nom", "etablissement_nom")
    @classmethod
    def _valider_compte_nom(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v or None

    @model_validator(mode="after")
    def _valider_compte_requis(self) -> HoldingCreate:
        """Compte obligatoire sauf sur les types dispensés d'établissement (revue du
        03/09/2026, demande directe de l'utilisateur : « il n'est pas possible
        d'avoir des lignes sans comptes »). `type_actif` non précisé (`None`) n'est
        PAS exempté — c'est la valeur par défaut d'un import qui n'a pas encore été
        catégorisé, précisément ce que cette règle doit empêcher de laisser filer
        silencieusement. Cf. `models.TYPES_ACTIF_SANS_ETABLISSEMENT` pour la liste,
        volontairement plus étroite que `TYPES_ACTIF_PATRIMOINE_MANUEL` : une SCPI,
        une assurance-vie ou un livret sont de vrais produits financiers détenus
        quelque part, contrairement à un bien immobilier ou un véhicule."""
        if self.type_actif not in TYPES_ACTIF_SANS_ETABLISSEMENT and not self.compte_id and not self.compte_nom:
            raise ValueError(
                "Un compte est obligatoire pour cette ligne (sauf immobilier, véhicule ou « autre actif »)."
            )
        return self


class HoldingUpdate(BaseModel):
    ticker: str | None = None
    nom: str | None = None
    quantite: float | None = None
    prix_revient_moyen: float | None = None
    compte_id: int | None = None
    compte_nom: str | None = None
    # Cf. `HoldingCreate` — même rôle, même priorité id > nom, sans objet si
    # `compte_id`/`compte_nom` est absent de cette requête.
    etablissement_id: int | None = None
    etablissement_nom: str | None = None
    devise: str | None = None
    type_actif: str | None = None
    valeur_estimee: float | None = None
    taux_pct: float | None = None
    zone_geo: str | None = None
    versement_mensuel: float | None = None
    date_acquisition: str | None = None

    @field_validator("ticker")
    @classmethod
    def _valider_ticker(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = _normaliser_ticker(v)
        if not v:
            raise ValueError(MESSAGE_TICKER_VIDE)
        return v

    @field_validator("quantite")
    @classmethod
    def _valider_quantite(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError(MESSAGE_QUANTITE_POSITIVE)
        return v

    @field_validator("prix_revient_moyen")
    @classmethod
    def _valider_prix_revient(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_PRIX_NON_NEGATIF)
        return v

    @field_validator("valeur_estimee")
    @classmethod
    def _valider_valeur_estimee(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE)
        return v

    @field_validator("versement_mensuel")
    @classmethod
    def _valider_versement_mensuel(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Le versement mensuel doit être positif ou nul")
        return v

    @field_validator("date_acquisition")
    @classmethod
    def _valider_date_acquisition(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _valider_date_jour_non_future(v, "La date d'acquisition")

    @field_validator("compte_nom", "etablissement_nom")
    @classmethod
    def _valider_compte_nom(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v or None


class ValorisationInput(BaseModel):
    valeur: float
    date: str
    # Part de la hausse (ou baisse, valeur négative = retrait) depuis le point
    # précédent qui vient d'un versement plutôt que d'une performance du contrat
    # (backlog § U.2, retour utilisateur 30/08/2026) — optionnel, `None` si le foyer
    # ne précise pas (le reste de l'évolution reste alors traité comme un gain estimé,
    # comportement inchangé). Jamais validé contre l'écart réel avec le point
    # précédent : rien n'empêche un versement déclaré supérieur à la hausse observée
    # (ex. un retrait simultané non détaillé), la déclaration du foyer prime.
    versement: float | None = None

    @field_validator("valeur")
    @classmethod
    def _valider_valeur(cls, v: float) -> float:
        if v < 0:
            raise ValueError(MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE)
        return v

    @field_validator("date")
    @classmethod
    def _valider_date(cls, v: str) -> str:
        return _valider_date_jour_non_future(v, "La date de valorisation")


class HoldingOut(HoldingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    origine: str  # "manuel" | "reconstruit", cf. `models.ORIGINE_MANUEL`/`ORIGINE_RECONSTRUIT`
    created_at: datetime
    updated_at: datetime
    market_data: MarketDataOut | None = None
    rendement_depuis_achat_pct: float | None = None
    rendement_annualise_pct: float | None = None
    # Compte structurel résolu (écran Comptes) — objet complet, jamais recalculé côté
    # frontend (même discipline que `valeur` juste en dessous). `None` : ligne non
    # rattachée à un compte.
    compte: CompteOut | None = None
    # Valeur de la ligne (prix de marché, à défaut prix de revient, `None` si aucun des
    # deux n'est connu), calculée côté serveur avec `analysis_service.value_holdings`
    # pour éviter que le frontend ne recalcule le même chiffre (LOT 6.7).
    valeur: float | None = None
    date_valeur_estimee: datetime | None = None
    # Redéclare le champ hérité de `HoldingBase` (`str | None`, format saisie) en
    # `datetime | None` pour la réponse — même différence input/output que
    # `ValorisationInput.date` (str) vs les dates renvoyées ailleurs dans l'API.
    date_acquisition: datetime | None = None

    @field_validator("date_acquisition")
    @classmethod
    def _valider_date_acquisition(cls, v: datetime | None) -> datetime | None:
        # Écrase le validateur hérité de `HoldingBase` (qui attend une chaîne
        # AAAA-MM-JJ) : ici la valeur vient de la base, déjà un vrai `datetime`.
        return v


class ColumnMapping(BaseModel):
    file_token: str
    ticker_col: str
    quantite_col: str
    prix_revient_col: str | None = None
    nom_col: str | None = None
    compte_col: str | None = None
    devise_col: str | None = None
    replace_existing: bool = False

    @field_validator("ticker_col", "quantite_col")
    @classmethod
    def _valider_colonne_obligatoire(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("La colonne est obligatoire")
        return v


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


class TransactionImportResult(BaseModel):
    lignes_lues: int
    importees: int
    doublons_ignores: int
    mouvements_hors_bourse_exclus: int
    positions_recalculees: int
    anomalies_detectees: int = 0
    # Nombre de lignes saisies manuellement supprimées car le grand livre reconstruit
    # un ticker identique (LOT 3.4) : le grand livre fait foi, la ligne manuelle
    # ferait doublon dans tous les calculs.
    lignes_manuelles_remplacees: int = 0
    # Nombre de `Compte` créés pour cet import (revue du 03/09/2026, import
    # multi-comptes) — au plus 4 (un par clé PEA/Compte-titres/Cryptomonnaie/
    # Obligations effectivement présente dans le fichier), 0 si tous existaient déjà
    # (ré-import).
    comptes_crees: int = 0


class TransactionImportApercu(BaseModel):
    """Réponse de `POST /api/transactions/import/apercu` (revue du 03/09/2026,
    import du grand livre en deux temps) — même patron que l'aperçu de l'import de
    positions (`ImportPreviewResponse`), adapté : pas de mapping de colonnes ici
    (le format est fixe, cf. `transaction_import.REQUIRED_COLUMNS`), mais un
    comptage par clé de compte suggérée à confirmer/renommer par l'utilisateur."""

    file_token: str
    lignes_lues: int
    mouvements_hors_bourse_exclus: int
    # Une clé par bucket EFFECTIVEMENT présent dans le fichier (count > 0) — cf.
    # `transaction_import.CLES_COMPTE`. Une clé absente ne doit proposer aucun champ
    # de saisie côté écran (aucune ligne du fichier ne la concerne).
    comptages: dict[str, int]
    noms_par_defaut: dict[str, str]
    etablissements: list[EtablissementOut]


class TransactionImportConfirm(BaseModel):
    """Requête de `POST /api/transactions/import` (nouvelle signature JSON,
    remplace l'ancien `UploadFile` direct) — `etablissement_id`/`etablissement_nom` :
    même priorité id > nom que `HoldingCreate`, IDOR vérifié côté routeur.
    `noms_comptes` : au plus une entrée par clé de `CLES_COMPTE`, absente = garde le
    nom par défaut (`NOMS_COMPTE_PAR_DEFAUT`)."""

    file_token: str
    etablissement_id: int | None = None
    etablissement_nom: str | None = None
    noms_comptes: dict[str, str] = {}

    @field_validator("etablissement_nom")
    @classmethod
    def _valider_etablissement_nom(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        return v or None

    @model_validator(mode="after")
    def _valider_etablissement_requis(self) -> TransactionImportConfirm:
        """Un import du grand livre crée toujours au moins un compte financier
        (PEA/Compte-titres/Cryptomonnaie/Obligations) — jamais un des types
        dispensés d'établissement (immobilier, véhicule...) — donc l'établissement
        est ici TOUJOURS obligatoire, sans l'exemption de `HoldingCreate`."""
        if not self.etablissement_id and not self.etablissement_nom:
            raise ValueError("Un établissement est obligatoire pour importer un grand livre.")
        return self


class HoldingPricePoint(BaseModel):
    date: str
    prix: float


class HoldingPriceHistoryResponse(BaseModel):
    points: list[HoldingPricePoint]
    volatilite_annualisee_pct: float | None = None
    max_drawdown_pct: float | None = None


class FundTopHoldingItem(BaseModel):
    symbol: str
    nom: str | None = None
    poids: float  # fraction 0-1
    pays: str | None = None
    secteur: str | None = None


class HoldingImmobilierOut(BaseModel):
    type_location: str | None = None
    loyer_mensuel: float | None = None
    charges_mensuelles: float | None = None
    frais_annuels: float | None = None
    surface_m2: float | None = None
    nb_pieces: int | None = None
    annee_construction: int | None = None
    dpe: str | None = None
    # Calculés côté serveur (`holding_detail_service`), jamais recalculés côté
    # frontend — même discipline que `HoldingOut.valeur` (LOT 6.7). `None` tant que
    # `loyer_mensuel` n'est pas renseigné (rien à projeter).
    cashflow_mensuel: float | None = None
    rentabilite_brute_pct: float | None = None
    rentabilite_nette_pct: float | None = None
    prix_m2: float | None = None
    emprunt_mensualite: float | None = None


MESSAGE_LOYER_NON_NEGATIF = "Le loyer mensuel ne peut pas être négatif"
MESSAGE_CHARGES_NON_NEGATIVES = "Les charges mensuelles ne peuvent pas être négatives"
MESSAGE_FRAIS_NON_NEGATIFS = "Les frais annuels ne peuvent pas être négatifs"
MESSAGE_SURFACE_POSITIVE = "La surface doit être strictement positive"
MESSAGE_PIECES_POSITIVES = "Le nombre de pièces doit être strictement positif"


class HoldingImmobilierUpdate(BaseModel):
    type_location: str | None = None
    loyer_mensuel: float | None = None
    charges_mensuelles: float | None = None
    frais_annuels: float | None = None
    surface_m2: float | None = None
    nb_pieces: int | None = None
    annee_construction: int | None = None
    dpe: str | None = None

    @field_validator("loyer_mensuel")
    @classmethod
    def _valider_loyer(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_LOYER_NON_NEGATIF)
        return v

    @field_validator("charges_mensuelles")
    @classmethod
    def _valider_charges(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_CHARGES_NON_NEGATIVES)
        return v

    @field_validator("frais_annuels")
    @classmethod
    def _valider_frais(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError(MESSAGE_FRAIS_NON_NEGATIFS)
        return v

    @field_validator("surface_m2")
    @classmethod
    def _valider_surface(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError(MESSAGE_SURFACE_POSITIVE)
        return v

    @field_validator("nb_pieces")
    @classmethod
    def _valider_pieces(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError(MESSAGE_PIECES_POSITIVES)
        return v


class ValuationHistoryPoint(BaseModel):
    id: int
    date_valeur: datetime
    valeur: float
    versement: float | None = None


class HoldingDetail(BaseModel):
    ticker: str
    nom: str | None = None
    type_actif: str | None = None
    # Compte structurel résolu (écran Comptes) — cf. `HoldingOut.compte`, même discipline.
    compte: CompteOut | None = None
    quantite: float
    prix_revient_moyen: float | None = None
    prix_actuel: float | None = None
    valeur: float
    devise: str | None = None
    secteur: str | None = None
    pays: str | None = None
    rendement_depuis_achat_pct: float | None = None
    rendement_annualise_pct: float | None = None
    emetteur: str | None = None
    resume: str | None = None
    frais_gestion_pct: float | None = None
    frais_transaction_payes: float = 0.0
    repartition_geo: list[RepartitionItem] = []
    repartition_sector: list[RepartitionItem] = []
    # Détail brut justETF (2.4, Increment 9), affichage seul — cf. `FundCompositionBrute`.
    repartition_geo_detaillee: list[RepartitionItem] = []
    repartition_sector_detaillee: list[RepartitionItem] = []
    composition_actions: list[FundTopHoldingItem] = []
    # Détenteurs (backlog 2.L.1) : quotités de l'actif + part détenue/nette calculée
    # par détenteur. Listes vides si l'utilisateur n'a déclaré aucun détenteur, ou si
    # cette ligne n'a jamais été répartie (100 % foyer implicite).
    quotites: list[QuotiteDetenteurItem] = []
    # Fiche immobilier complète (backlog § 2.M.3) : `None` pour toute ligne qui n'a
    # jamais reçu de détail immobilier (pas seulement les non-`REAL_ESTATE` — rien
    # n'empêche techniquement d'en saisir un ailleurs, mais l'UI ne le propose que
    # pour ce type).
    immobilier: HoldingImmobilierOut | None = None
    # Valeur courante saisie manuellement et sa date (backlog 2.S.1) — le graphique
    # d'historique complet vit dans `GET .../immobilier-history`, ces deux champs
    # servent juste à afficher "à jour au ..." sur l'écran Épargne.
    valeur_estimee: float | None = None
    date_valeur_estimee: datetime | None = None
    # Versement mensuel déclaré (écran Épargne, backlog 2.S.1) — cf. `Holding.versement_mensuel`.
    versement_mensuel: float | None = None
    # Date d'acquisition déclarée (backlog § 2.S.3) — cf. `Holding.date_acquisition`,
    # utilisée par `rendement_annualise_pct` ci-dessus et pour ancrer le graphique
    # d'historique de valorisation (`ValorisationHistoriqueCard`, côté frontend).
    date_acquisition: datetime | None = None
