from __future__ import annotations

import json
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from app.core.config import get_settings

settings = get_settings()


def _gemini_endpoint(model: str) -> str:
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _should_retry(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {429, 500, 502, 503, 504}
    return isinstance(exc, httpx.RequestError)


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=1, max=6),
    retry=retry_if_exception(_should_retry),
    reraise=True,
)
def _call_gemini_raw(prompt: str, model: str) -> dict:
    url = _gemini_endpoint(model)
    headers = {
        "x-goog-api-key": settings.gemini_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ]
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()


def _extract_text(data: dict) -> str | None:
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        return None


def _call_gemini(prompt: str) -> str | None:
    if not settings.gemini_api_key:
        return None

    models = [settings.gemini_model]
    if settings.gemini_fallback_model and settings.gemini_fallback_model not in models:
        models.append(settings.gemini_fallback_model)

    for model in models:
        try:
            data = _call_gemini_raw(prompt, model)
            text = _extract_text(data)
            if text:
                return text
        except (httpx.HTTPError, httpx.RequestError):
            continue
    return None


def _fallback_summary(issues: list[dict]) -> str:
    if not issues:
        return "No issues detected. Dataset looks healthy."
    summary_lines = ["Detected the following data quality issues:"]
    for issue in issues[:5]:
        issue_type = issue.get("type", "issue")
        message = issue.get("message", "")
        summary_lines.append(f"- {issue_type}: {message}")
    if len(issues) > 5:
        summary_lines.append(f"- and {len(issues) - 5} more issues.")
    summary_lines.append("Suggested next steps: fill missing values, remove duplicates, and review outliers.")
    return "\n".join(summary_lines)


def _fallback_cleaning_plan(issues: list[dict]) -> dict[str, Any]:
    steps: list[dict[str, str]] = []
    issue_types = {issue.get("type") for issue in issues}

    if "high_null_rate" in issue_types or "primary_key_nulls" in issue_types:
        steps.append({"action": "fill_nulls", "details": "Fill numeric nulls with median"})
    if "duplicate_rows" in issue_types or "primary_key_duplicates" in issue_types:
        steps.append({"action": "drop_duplicates", "details": "Remove duplicate rows"})
    if "numeric_outliers" in issue_types:
        steps.append({"action": "remove_outliers", "details": "Filter numeric outliers using 3-sigma rule"})

    if not steps:
        steps.append({"action": "review", "details": "Manual review recommended"})

    return {"steps": steps, "source": "fallback"}


def summarize_issues(issues: list[dict]) -> str:
    prompt = (
        "You are a data quality assistant. Summarize the following issues in plain English "
        "and suggest practical fixes. Keep it short.\n\n"
        f"Issues: {json.dumps(issues)}"
    )
    response = _call_gemini(prompt)
    return response or _fallback_summary(issues)


def generate_cleaning_plan(issues: list[dict]) -> dict[str, Any]:
    prompt = (
        "You are a data cleaning assistant. Given the issues below, output a JSON object with "
        "safe cleaning steps. Format: {\"steps\": [{\"action\": string, \"details\": string}]}\n\n"
        f"Issues: {json.dumps(issues)}"
    )
    response = _call_gemini(prompt)
    if not response:
        return _fallback_cleaning_plan(issues)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {"raw": response, "source": "llm"}
