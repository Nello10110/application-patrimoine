"""Parsing des fichiers de portefeuille (CSV/XLSX) avec mapping de colonnes manuel.

Les formats d'export diffèrent d'un courtier à l'autre : on ne suppose aucun nom
de colonne fixe. Le fichier uploadé est parsé une fois, gardé en mémoire sous un
token, puis l'utilisateur choisit dans l'UI quelle colonne correspond à quel champ
avant l'import définitif en base.
"""

import io
import uuid
from dataclasses import dataclass, field

import pandas as pd

_PENDING_IMPORTS: dict[str, pd.DataFrame] = {}
_MAX_PENDING = 20


@dataclass
class ParsedFile:
    token: str
    columns: list[str]
    preview_rows: list[dict] = field(default_factory=list)
    total_rows: int = 0


def parse_upload(filename: str, content: bytes) -> ParsedFile:
    lower = filename.lower()
    if lower.endswith(".csv"):
        df = _read_csv(content)
    elif lower.endswith(".xlsx") or lower.endswith(".xls"):
        df = pd.read_excel(io.BytesIO(content))
    else:
        raise ValueError("Format de fichier non supporté (attendu: .csv, .xlsx, .xls)")

    df = df.dropna(how="all")
    df.columns = [str(c).strip() for c in df.columns]

    token = uuid.uuid4().hex
    if len(_PENDING_IMPORTS) >= _MAX_PENDING:
        _PENDING_IMPORTS.pop(next(iter(_PENDING_IMPORTS)))
    _PENDING_IMPORTS[token] = df

    preview = df.head(10).fillna("").astype(str).to_dict(orient="records")
    return ParsedFile(token=token, columns=list(df.columns), preview_rows=preview, total_rows=len(df))


def _read_csv(content: bytes) -> pd.DataFrame:
    for sep in (None, ";", ",", "\t"):
        try:
            return pd.read_csv(io.BytesIO(content), sep=sep, engine="python")
        except Exception:
            continue
    raise ValueError("Impossible de lire le fichier CSV")


def get_pending(token: str) -> pd.DataFrame:
    df = _PENDING_IMPORTS.get(token)
    if df is None:
        raise KeyError("Fichier introuvable ou expiré, merci de ré-uploader")
    return df


def clear_pending(token: str) -> None:
    _PENDING_IMPORTS.pop(token, None)


def to_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip().replace(" ", "").replace(",", ".").replace(" ", "")
        if value == "" or value.lower() == "nan":
            return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result
