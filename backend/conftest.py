"""Garde-fou global des tests.

`app.main` crée le schéma et lance les migrations dès son import : si un test
importait ce module (même indirectement) avant que `OUTIL_BOURSE_DB` ne soit
positionné, la vraie `portfolio.db` du dépôt serait créée/modifiée. Pytest charge
les `conftest.py` de la racine vers les sous-dossiers avant toute collecte de
test — ce fichier fixe donc la variable d'environnement vers un fichier jetable
avant que quoi que ce soit dans `tests/` ne puisse importer l'application.

Pose aussi `OUTIL_BOURSE_TESTING`, lue une seule fois par `services/market_data_service`
à son import pour neutraliser la temporisation entre deux appels Yahoo Finance
(cf. LOT 7.5) : la suite de tests n'appelle jamais le réseau (`no_network_yfinance`
dans `tests/conftest.py`), un `time.sleep` réel n'y apporterait donc rien d'utile et
ferait juste traîner l'exécution.
"""

import atexit
import os
import tempfile

if "OUTIL_BOURSE_DB" not in os.environ:
    _fd, _chemin_db_session = tempfile.mkstemp(prefix="outil_bourse_tests_", suffix=".db")
    os.close(_fd)
    os.environ["OUTIL_BOURSE_DB"] = _chemin_db_session
    atexit.register(lambda: os.path.exists(_chemin_db_session) and os.remove(_chemin_db_session))

os.environ.setdefault("OUTIL_BOURSE_TESTING", "1")
