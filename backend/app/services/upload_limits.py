"""Garde-fou commun aux deux endpoints d'import de fichier (relevé de positions et
grand livre de transactions, cf. `routers/portfolio.py` et `routers/transactions.py`).

Les deux endpoints font `await file.read()`, qui charge la totalité du fichier en
mémoire avant tout traitement : sans limite, un fichier arbitrairement volumineux
(par erreur ou malveillance) peut épuiser la mémoire du process. LOT 3.6.
"""

TAILLE_MAX_IMPORT_OCTETS = 25 * 1024 * 1024  # 25 Mo


class FichierTropVolumineuxError(Exception):
    """Levée par `verifier_taille_fichier` quand le fichier dépasse la limite."""


def verifier_taille_fichier(content: bytes) -> None:
    if len(content) <= TAILLE_MAX_IMPORT_OCTETS:
        return
    taille_max_mo = TAILLE_MAX_IMPORT_OCTETS / (1024 * 1024)
    taille_obtenue_mo = len(content) / (1024 * 1024)
    raise FichierTropVolumineuxError(
        f"Fichier trop volumineux ({taille_obtenue_mo:.1f} Mo) : la taille maximale acceptée est {taille_max_mo:.0f} Mo"
    )
