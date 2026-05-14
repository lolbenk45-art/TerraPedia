#!/usr/bin/env python3
"""
Generate a compact markdown summary skeleton for a task handoff.

Usage:
    python build_context_summary.py --topic "items image backfill" --out G:\\repo\\reports\\context-summaries\\items-image-backfill.md
    python build_context_summary.py --topic "recipe cn audit" --goal "Audit recipe Chinese names" --files back\\src\\... reports\\recipes中文名回填汇总_2026-04-02.md
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a compact context summary template.")
    parser.add_argument("--topic", required=True, help="Summary topic")
    parser.add_argument("--out", required=True, help="Output markdown path")
    parser.add_argument("--goal", default="", help="Current goal")
    parser.add_argument("--files", nargs="*", default=[], help="Relevant file whitelist")
    parser.add_argument("--excluded", nargs="*", default=[], help="Excluded paths")
    args = parser.parse_args()

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        f"# {args.topic}",
        "",
        "## Goal",
        f"- {args.goal or 'TBD'}",
        "",
        "## Scope",
        "- Files:",
    ]

    if args.files:
        lines.extend([f"  - {item}" for item in args.files])
    else:
        lines.append("  - TBD")

    lines.append("- Excluded:")
    if args.excluded:
        lines.extend([f"  - {item}" for item in args.excluded])
    else:
        lines.append("  - node_modules/")
        lines.append("  - target/")
        lines.append("  - large generated artifacts")

    lines.extend(
        [
            "",
            "## Facts",
            "- ",
            "",
            "## Changes",
            "- ",
            "",
            "## Validation",
            "- ",
            "",
            "## Next Step",
            "- ",
            "",
        ]
    )

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
