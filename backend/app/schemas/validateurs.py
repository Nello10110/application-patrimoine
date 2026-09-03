from __future__ import annotations

from datetime import datetime  # noqa: F401

from pydantic import BaseModel, ConfigDict, field_validator, model_validator  # noqa: F401

MESSAGE_TICKER_VIDE = "Le ticker ne peut pas être vide"
MESSAGE_QUANTITE_POSITIVE = "La quantité doit être strictement positive (les positions vendues à découvert ne sont pas gérées)"
MESSAGE_PRIX_NON_NEGATIF = "Le prix de revient moyen ne peut pas être négatif"
MESSAGE_VALEUR_ESTIMEE_NON_NEGATIVE = "La valeur estimée ne peut pas être négative"


def _valider_date_jour_non_future(valeur: str, libelle: str) -> str:
    """Format AAAA-MM-JJ ET date non future (recette du 02/09/2026).

    Le refus du futur n'est pas cosmétique : une date d'acquisition à venir fait
    calculer un rendement annualisé sur une durée de détention négative, et ancre
    les graphiques d'historique après « aujourd'hui » ; une valorisation datée du
    futur devient la « valeur courante » (le point le plus récent gagne, cf.
    `set_holding_valorisation`) et fausse tout le patrimoine net. Ces deux
    grandeurs sont des CONSTATS passés, jamais des projections — le Simulateur est
    là pour ça."""
    try:
        jour = datetime.strptime(valeur, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"{libelle} doit être au format AAAA-MM-JJ") from None
    if jour > datetime.now().date():
        raise ValueError(f"{libelle} ne peut pas être dans le futur")
    return valeur


def _normaliser_ticker(valeur: str) -> str:
    """Nettoyage centralisé d'un ticker saisi : espaces superflus retirés, majuscules
    imposées (un ticker/ISIN n'est jamais sensible à la casse dans cette appli).
    Remplace les deux `.strip().upper()` auparavant dupliqués dans `routers/portfolio.py`."""
    return valeur.strip().upper()
