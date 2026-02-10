from __future__ import annotations

import pandas as pd


def validate_dataset(file_path: str) -> tuple[list[dict], int]:
    df = pd.read_csv(file_path)
    issues: list[dict] = []

    total_rows = len(df)
    if total_rows == 0:
        return [{"type": "empty_dataset", "message": "Dataset has no rows."}], 0

    pk_candidates = {"id", "pk", "primary_key"}
    pk_col = next((c for c in df.columns if c.lower() in pk_candidates), None)
    if pk_col:
        nulls = int(df[pk_col].isna().sum())
        dups = int(df[pk_col].duplicated().sum())
        if nulls > 0:
            issues.append({
                "type": "primary_key_nulls",
                "column": pk_col,
                "count": nulls,
                "message": f"{nulls} null primary key values in {pk_col}",
            })
        if dups > 0:
            issues.append({
                "type": "primary_key_duplicates",
                "column": pk_col,
                "count": dups,
                "message": f"{dups} duplicate primary key values in {pk_col}",
            })
    else:
        issues.append({
            "type": "missing_primary_key",
            "message": "No primary key column found (expected one of: id, pk, primary_key).",
        })

    null_pct_overall = 0.0
    for col in df.columns:
        col_null_pct = float(df[col].isna().mean())
        null_pct_overall += col_null_pct
        if col_null_pct >= 0.05:
            issues.append({
                "type": "high_null_rate",
                "column": col,
                "null_pct": col_null_pct,
                "message": f"{col} has {col_null_pct:.1%} nulls",
            })

    dup_rows = int(df.duplicated().sum())
    if dup_rows > 0:
        issues.append({
            "type": "duplicate_rows",
            "count": dup_rows,
            "message": f"Dataset contains {dup_rows} duplicate rows",
        })

    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            continue
        mean = series.mean()
        std = series.std()
        if std and std > 0:
            outliers = ((series < mean - 3 * std) | (series > mean + 3 * std)).sum()
            if int(outliers) > 0:
                issues.append({
                    "type": "numeric_outliers",
                    "column": col,
                    "count": int(outliers),
                    "message": f"{col} has {int(outliers)} outliers (3σ rule)",
                })

    string_cols = df.select_dtypes(include=["object", "string"]).columns.tolist()
    for col in string_cols:
        lengths = df[col].dropna().astype(str).str.len()
        long_count = int((lengths > 255).sum())
        if long_count > 0:
            issues.append({
                "type": "string_length",
                "column": col,
                "count": long_count,
                "message": f"{col} has {long_count} values longer than 255 chars",
            })

    null_pct_overall = null_pct_overall / max(1, len(df.columns))
    null_penalty = int(null_pct_overall * 50)
    dup_penalty = min(20, int((dup_rows / total_rows) * 100))
    issue_penalty = min(60, len(issues) * 5)

    score = max(0, 100 - null_penalty - dup_penalty - issue_penalty)
    return issues, score
