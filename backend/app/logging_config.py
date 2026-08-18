"""Configuration de la journalisation de l'application.

Les modules posent des `logging.getLogger("outil_bourse.*")` mais rien ne
configurait jusqu'ici de handler : aucun message ne sortait nulle part. Ce module
fournit un point d'entrée unique, à appeler une fois au démarrage, qui pose une
sortie console lisible. Niveau pilotable par `OUTIL_BOURSE_LOG_LEVEL` (défaut
`INFO`) pour ajuster la verbosité en exploitation sans toucher au code.
"""

import logging
import os

FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_logging() -> None:
    niveau = os.environ.get("OUTIL_BOURSE_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=niveau, format=FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
