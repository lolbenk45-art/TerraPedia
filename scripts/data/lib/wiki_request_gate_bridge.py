from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode


@dataclass
class WikiRequestGateResponse:
    status_code: int
    text: str
    url: str
    status_text: str = ""

    def raise_for_status(self) -> None:
        if self.status_code < 200 or self.status_code >= 300:
            raise RuntimeError(f"Wiki request failed HTTP {self.status_code} {self.status_text}: {self.url}")

    def json(self) -> Any:
        return json.loads(self.text)


class WikiRequestGateClient:
    def __init__(self, repo_root: Path | None = None, timeout_seconds: float = 60.0) -> None:
        self.repo_root = repo_root or Path(__file__).resolve().parents[3]
        self.timeout_seconds = timeout_seconds
        self.bridge_script = self.repo_root / "scripts" / "data" / "lib" / "wiki-request-gate-bridge.mjs"

    def get(self, url: str, *, profile: str = "page", source_key: str | None = None) -> WikiRequestGateResponse:
        return self.request(
            url,
            method="GET",
            profile=profile,
            source_key=source_key,
        )

    def post_form(
        self,
        url: str,
        form: dict[str, Any],
        *,
        profile: str = "revision",
        source_key: str | None = None,
    ) -> WikiRequestGateResponse:
        return self.request(
            url,
            method="POST",
            headers={"content-type": "application/x-www-form-urlencoded; charset=UTF-8"},
            body=urlencode(form),
            profile=profile,
            source_key=source_key,
        )

    def request(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: dict[str, str] | None = None,
        body: str | None = None,
        profile: str = "page",
        source_key: str | None = None,
    ) -> WikiRequestGateResponse:
        payload = {
            "url": url,
            "method": method,
            "headers": headers or {},
            "body": body,
            "profile": profile,
            "sourceKey": source_key or url,
            "timeoutMs": int(self.timeout_seconds * 1000),
        }
        completed = subprocess.run(
            ["node", str(self.bridge_script)],
            cwd=self.repo_root,
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            timeout=self.timeout_seconds + 10.0,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or "Wiki request gate bridge failed")
        result = json.loads(completed.stdout)
        return WikiRequestGateResponse(
            status_code=int(result.get("status") or 0),
            status_text=str(result.get("statusText") or ""),
            text=str(result.get("body") or ""),
            url=str(result.get("url") or url),
        )
