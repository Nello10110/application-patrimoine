from pydantic import BaseModel


class EffacerFoyerRequest(BaseModel):
    """Remise à zéro complète du foyer (revue du 05/09/2026) — `confirmation` doit
    correspondre EXACTEMENT au nom du foyer (s'il est renseigné) ou au mot
    `"SUPPRIMER"` sinon, vérifié par `routers/donnees.py::effacer`. Pas de
    validation ici : la valeur attendue dépend de l'état en base (nom du foyer),
    pas d'une règle statique — la comparaison se fait dans le routeur."""

    confirmation: str
