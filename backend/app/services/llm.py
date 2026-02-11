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
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception(_should_retry),
    reraise=True,
)
def _call_gemini_raw(prompt: str) -> dict:
    url = _gemini_endpoint(settings.gemini_model)
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


def _call_gemini(prompt: str) -> str | None:
    if not settings.gemini_api_key:
        return None

    try:
        data = _call_gemini_raw(prompt)
    except (httpx.HTTPError, httpx.RequestError):
        return None

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        return None


def summarize_issues(issues: list[dict]) -> str | None:
    prompt = (
        "You are a data quality assistant. Summarize the following issues in plain English "
        "and suggest practical fixes. Keep it short.\n\n"
        f"Issues: {json.dumps(issues)}"
    )
    return _call_gemini(prompt)


def generate_cleaning_plan(issues: list[dict]) -> dict[str, Any] | None:
    prompt = (
        "You are a data cleaning assistant. Given the issues below, output a JSON object with "
        "safe cleaning steps. Format: {\"steps\": [{\"action\": string, \"details\": string}]}\n\n"
        f"Issues: {json.dumps(issues)}"
    )
    response = _call_gemini(prompt)
    if not response:
        return None
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {"raw": response}
