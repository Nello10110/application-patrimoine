"""Paquet applicatif.

Ce fichier était vide ; il porte désormais UNE responsabilité, et une seule :
charger le `.env` du dépôt avant tout le reste.

L'emplacement n'est pas arbitraire. `database` et `logging_config` lisent leurs
variables d'environnement dès leur import (`PATRIMOINE_DB`, `PATRIMOINE_LOG_LEVEL`) ;
le chargement doit donc précéder l'import de n'importe quel sous-module d'`app`.
Le faire dans `main.py` supposerait de placer une instruction entre les imports —
fragile, et contraire au classement automatique des imports. `__init__.py`, lui, est
exécuté par Python avant tout `app.quelque_chose`, sans dépendre d'aucun ordre.
"""

from .config_env import charger_env

ENV_CHARGE = charger_env()
