"""Chargement du fichier `.env` du dépôt, s'il existe.

Importé en TOUT PREMIER par `main.py`, avant `database`/`logging_config` : ces
modules lisent leurs variables d'environnement dès l'import (`PATRIMOINE_DB`,
`PATRIMOINE_LOG_LEVEL`), un chargement plus tardif arriverait trop tard.

Pourquoi ce module existe (03/09/2026). La documentation d'exploitation indique de
poser les secrets dans un `.env` à côté du compose — ce que Docker Compose lit
nativement. Mais en développement local (`uvicorn app.main:app`), **rien** ne lisait
ce fichier : l'exploitant suivait la procédure documentée, `.env` contenait bien la
clé, et le job de sauvegarde chiffrée échouait quand même en signalant une variable
absente. Écart constaté en conditions réelles, sur une procédure que j'avais
moi-même écrite.

`override=False` : une variable déjà présente dans l'environnement gagne toujours
sur le fichier. C'est le comportement attendu en conteneur (les valeurs injectées
par l'orchestrateur font foi) et en test (`conftest.py` positionne `PATRIMOINE_DB`
et `PATRIMOINE_TESTING` avant tout import — le `.env` du poste de développement ne
doit surtout pas les écraser et faire travailler la suite sur la vraie base).
"""

import os
from pathlib import Path

# `backend/app/config_env.py` -> racine du dépôt, deux niveaux au-dessus de `app/`.
_RACINE_DEPOT = Path(__file__).resolve().parent.parent.parent
CHEMIN_ENV = _RACINE_DEPOT / ".env"


def charger_env() -> bool:
    """Charge `.env` s'il existe. Rend `True` s'il a été lu.

    Ne lève jamais : l'absence de `python-dotenv` ou du fichier est un cas normal
    (déploiement où les variables viennent de l'orchestrateur), pas une erreur qui
    doive empêcher l'application de démarrer.
    """
    if not CHEMIN_ENV.is_file():
        return False
    try:
        from dotenv import load_dotenv  # noqa: PLC0415 - dépendance optionnelle, cf. docstring
    except ImportError:
        return False
    return bool(load_dotenv(CHEMIN_ENV, override=False))


def variables_chargees() -> list[str]:
    """Noms des variables `PATRIMOINE_*` actuellement définies — jamais leurs
    valeurs. Sert au journal de démarrage : savoir QUE la clé de sauvegarde est en
    place doit être possible sans jamais l'exposer dans un log."""
    return sorted(nom for nom in os.environ if nom.startswith("PATRIMOINE_"))
