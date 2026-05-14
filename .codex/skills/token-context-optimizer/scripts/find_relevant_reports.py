#!/usr/bin/env python3
"""
Find likely relevant report artifacts in a report-heavy repository.

Usage:
    python find_relevant_reports.py --root G:\\repo --query "items image backfill"
    python find_relevant_reports.py --root G:\\repo --query "recipe chinese name" --limit 8
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from time import time
from typing import Iterable


TEXT_EXTENSIONS = {".md", ".json", ".log", ".txt"}


@dataclass
class Match:
    path: Path
    score: int
    reasons: list[str]


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in re.findall(r"[A-Za-z0-9_\-\u4e00-\u9fff]+", text) if t.strip()]


def score_file(path: Path, terms: list[str]) -> Match | None:
    name = path.name.lower()
    stem = path.stem.lower()
    score = 0
    reasons: list[str] = []

    for term in terms:
        if term in name:
            score += 8
            reasons.append(f"name:{term}")
        elif term in stem:
            score += 6
            reasons.append(f"stem:{term}")

    if "summary" in name or "汇总" in name or "方案" in name or "审计" in name:
        score += 5
        reasons.append("summary-like")
    if "总结" in name or "验收" in name or "最终" in name or "现状" in name:
        score += 4
        reasons.append("high-value-report")
    if "context-summaries" in str(path).replace("\\", "/"):
        score += 3
        reasons.append("context-summary-dir")
    if any(flag in name for flag in ("smoke", "retry", "apply", "rerun", "localonly", "probe-result")):
        score -= 4
        reasons.append("intermediate-artifact")

    if path.suffix.lower() == ".md":
        score += 4
        reasons.append("markdown")
    elif path.suffix.lower() == ".json":
        score += 1
        reasons.append("json")

    try:
        age_days = max(0, int((time() - path.stat().st_mtime) // 86400))
        age_bonus = max(0, 5 - min(5, age_days))
    except OSError:
        age_bonus = 0
    if age_bonus:
        score += age_bonus
        reasons.append(f"recent+{age_bonus}")

    return Match(path=path, score=score, reasons=reasons) if score > 0 else None


def iter_candidates(root: Path) -> Iterable[Path]:
    reports_dir = root / "reports"
    search_root = reports_dir if reports_dir.exists() else root
    for path in search_root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        yield path


def main() -> int:
    parser = argparse.ArgumentParser(description="Rank likely relevant report files.")
    parser.add_argument("--root", required=True, help="Repository root")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--limit", type=int, default=10, help="Max results")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    terms = tokenize(args.query)
    if not terms:
        print("No usable query terms.")
        return 1

    matches: list[Match] = []
    for path in iter_candidates(root):
        match = score_file(path, terms)
        if match:
            matches.append(match)

    matches.sort(key=lambda m: (-m.score, str(m.path)))

    if not matches:
        print("No likely report matches found.")
        return 0

    for idx, match in enumerate(matches[: args.limit], start=1):
        rel = match.path.relative_to(root) if match.path.is_relative_to(root) else match.path
        print(f"{idx}. score={match.score:02d} path={rel}")
        print(f"   reasons={', '.join(match.reasons[:6])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
