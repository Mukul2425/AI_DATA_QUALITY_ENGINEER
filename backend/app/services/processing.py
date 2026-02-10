from __future__ import annotations

from app.services.profiling import profile_dataset
from app.services.validation import validate_dataset
from app.services.llm import summarize_issues


def run_validation(file_path: str, use_llm: bool = False) -> tuple[dict, list[dict], int, str | None]:
    profile = profile_dataset(file_path)
    issues, score = validate_dataset(file_path)
    llm_summary = summarize_issues(issues) if use_llm else None
    return profile, issues, score, llm_summary
