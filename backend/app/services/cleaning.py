from __future__ import annotations

import os
import re
import uuid
from typing import Any

import pandas as pd

from app.utils.files import ensure_dir


_TYPE_MAP = {
    "int": "int64",
    "integer": "int64",
    "float": "float64",
    "double": "float64",
    "string": "string",
    "str": "string",
    "text": "string",
    "datetime": "datetime64[ns]",
    "date": "datetime64[ns]",
}


def _parse_convert_details(details: str, columns: list[str]) -> tuple[str | None, str | None]:
    details_lower = details.lower()
    col_match = re.search(r"column\s*[:=]\s*([^,;]+)", details_lower)
    type_match = re.search(r"type\s*[:=]\s*([^,;]+)", details_lower)

    column = None
    if col_match:
        candidate = col_match.group(1).strip().strip("'\"")
        for col in columns:
            if col.lower() == candidate:
                column = col
                break

    dtype = None
    if type_match:
        dtype_key = type_match.group(1).strip().strip("'\"")
        dtype = _TYPE_MAP.get(dtype_key)

    return column, dtype


def _apply_outlier_filter(df: pd.DataFrame) -> pd.DataFrame:
    numeric_cols = df.select_dtypes(include=["number"]).columns
    if numeric_cols.empty:
        return df

    mask = pd.Series([True] * len(df))
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            continue
        mean = series.mean()
        std = series.std()
        if std and std > 0:
            mask &= (df[col] >= mean - 3 * std) & (df[col] <= mean + 3 * std)
    return df[mask]


def apply_cleaning_plan(file_path: str, plan: dict[str, Any] | None, cleaned_dir: str) -> str:
    ensure_dir(cleaned_dir)
    df = pd.read_csv(file_path)

    steps = []
    if isinstance(plan, dict):
        steps = plan.get("steps", []) if isinstance(plan.get("steps"), list) else []

    for step in steps:
        action = str(step.get("action", "")).lower()
        details = str(step.get("details", "")).lower()

        if "fill" in action and "null" in action:
            numeric_cols = df.select_dtypes(include=["number"]).columns
            if not numeric_cols.empty:
                df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].median())
            continue

        if "drop" in action and "duplicate" in action:
            df = df.drop_duplicates()
            continue

        if "convert" in action or "cast" in action:
            column, dtype = _parse_convert_details(details, df.columns.tolist())
            if column and dtype:
                if "datetime" in dtype:
                    df[column] = pd.to_datetime(df[column], errors="coerce")
                else:
                    df[column] = df[column].astype(dtype, errors="ignore")
            continue

        if "outlier" in action:
            df = _apply_outlier_filter(df)
            continue

    cleaned_name = f"{uuid.uuid4().hex}.csv"
    cleaned_path = os.path.join(cleaned_dir, cleaned_name)
    df.to_csv(cleaned_path, index=False)
    return cleaned_path
