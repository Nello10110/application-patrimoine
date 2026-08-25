"""Garde-fou générique de câblage des routeurs — pas spécifique à un écran.

Contexte (25/08/2026) : le routeur `salaire.py` était correctement écrit ET
correctement enregistré dans `main.py` (`app.include_router(salaire.router, ...)`),
mais le process backend réel de l'utilisateur tournait depuis AVANT ce changement —
Python n'exécute le corps de `main.py` (donc chaque `include_router`) qu'une seule
fois, au démarrage du process. Résultat : un `{"detail":"Not Found"}` en conditions
réelles, alors que toute la suite de tests (qui importe `app` fraîchement à chaque
exécution) restait au vert. Aucun test ne peut détecter "le process n'a pas été
redémarré" (c'est un fait sur l'exploitation, pas sur le code, cf.
`docs/MANUEL_EXPLOITATION.md` § 10) — mais ce module verrouille la classe de bug
VOISINE et, elle, bien testable : un futur routeur écrit dans `app/routers/` puis
JAMAIS enregistré dans `main.py` (un oubli, contrairement à ce qui s'est passé ici,
serait silencieux de la même façon)."""

import importlib
import pkgutil

from app import routers as routers_package
from app.main import app


def test_tous_les_modules_de_app_routers_sont_enregistres_dans_main():
    # `app.openapi()` force la résolution complète des routes (y compris celles
    # empaquetées dans un `_IncludedRouter` lazy, jamais aplaties dans `app.routes`
    # sur les versions récentes de FastAPI/Starlette) — source de vérité robuste
    # aux détails d'implémentation interne du framework.
    chemins_app = set(app.openapi()["paths"].keys())

    noms_modules = [name for _, name, is_pkg in pkgutil.iter_modules(routers_package.__path__) if not is_pkg]
    assert len(noms_modules) >= 18, "Régression de découverte : moins de routeurs trouvés qu'attendu dans app/routers/"

    for nom in noms_modules:
        module = importlib.import_module(f"app.routers.{nom}")
        router = getattr(module, "router", None)
        if router is None:
            continue  # module utilitaire de app/routers/ sans APIRouter (aucun cas actuel, garde future)

        assert router.routes, f"app/routers/{nom}.py définit un `router` sans aucune route déclarée"

        for route in router.routes:
            # `route.path` inclut déjà le préfixe du routeur sur cette version de
            # FastAPI (vérifié empiriquement) — ne pas re-préfixer.
            chemin_complet = route.path
            assert chemin_complet in chemins_app, (
                f"app/routers/{nom}.py déclare '{chemin_complet}' mais ce chemin n'apparaît nulle part "
                f"dans app.routes — le routeur a très probablement été oublié dans main.py "
                f"(app.include_router(...) manquant), ce qui produit un 404 'Not Found' silencieux."
            )
