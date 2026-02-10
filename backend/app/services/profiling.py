from __future__ import annotations

from typing import Any
import pandas as pd
import numpy as np


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if isinstance(value, (np.bool_)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if pd.isna(value):
        return None
    return value


def profile_dataset(file_path: str) -> dict:
    df = pd.read_csv(file_path)

    null_pct = {col: float(df[col].isna().mean()) for col in df.columns}
    duplicates = int(df.duplicated().sum())
    dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}

    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    basic_stats: dict[str, dict[str, Any]] = {}
    for col in numeric_cols:
        stats = df[col].describe().to_dict()
        basic_stats[col] = {k: _serialize_value(v) for k, v in stats.items()}

    profile = {
        "rows": int(len(df)),
        "columns": df.columns.tolist(),
        "null_pct": null_pct,
        "duplicates": duplicates,
        "dtypes": dtypes,
        "basic_stats": basic_stats,
    }
    return profile
