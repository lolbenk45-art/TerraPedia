#!/usr/bin/env python
import json
from pathlib import Path
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup


REPO_ROOT = Path.cwd()
API_URL = "https://terraria.wiki.gg/zh/api.php"
PAGE_TITLE = "\u5fae\u5149"
OUTPUT_PATH = REPO_ROOT / "data" / "generated" / "shimmer" / "wiki-shimmer-python-scrape.latest.json"


def post_api(form: dict) -> dict:
    response = requests.post(
        API_URL,
        data=form,
        headers={"User-Agent": "TerraPedia-python-scraper/1.0"},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


def normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = " ".join(value.split()).strip()
    return text or None


def extract_cell_entities(cell) -> list[dict]:
    entities = []
    for anchor in cell.select("a[title]"):
        title = normalize_text(anchor.get("title"))
        if not title or title.startswith("File:") or title in entities:
            continue
        entities.append(title)
    if not entities:
        text = normalize_text(cell.get_text(" ", strip=True))
        if text:
            entities.append(text)
    return [{"titleZh": title} for title in entities]


def parse_table(table, fallback_label: str) -> dict:
    caption = normalize_text(table.caption.get_text(" ", strip=True)) if table.caption else fallback_label
    headers = [normalize_text(th.get_text(" ", strip=True)) for th in table.select("tr th")]
    rows = []
    for tr in table.select("tr"):
        if not tr.select("td"):
            continue
        cells = tr.find_all(["td", "th"], recursive=False)
        parsed_cells = []
        for cell in cells:
            parsed_cells.append(
                {
                    "text": normalize_text(cell.get_text(" ", strip=True)),
                    "entities": extract_cell_entities(cell),
                }
            )
        rows.append(parsed_cells)
    return {
        "caption": caption,
        "headers": [header for header in headers if header],
        "rowCount": len(rows),
        "rows": rows,
    }


def main() -> None:
    generated_at = datetime.now(timezone.utc).isoformat()

    revision_payload = post_api(
        {
            "action": "query",
            "titles": PAGE_TITLE,
            "prop": "revisions",
            "rvprop": "timestamp|ids|content",
            "redirects": "1",
            "formatversion": "2",
            "format": "json",
        }
    )
    parse_payload = post_api(
        {
            "action": "parse",
            "page": PAGE_TITLE,
            "prop": "sections|text",
            "redirects": "1",
            "formatversion": "2",
            "format": "json",
        }
    )

    page = revision_payload["query"]["pages"][0]
    revision = page["revisions"][0]
    parse_data = parse_payload["parse"]
    html = parse_data["text"]

    soup = BeautifulSoup(html, "html.parser")
    tables = []
    for index, table in enumerate(soup.select("table"), start=1):
        classes = table.get("class", [])
        if "terraria" not in classes:
            continue
        tables.append(parse_table(table, f"table-{index}"))

    result = {
        "entity": "wiki_shimmer_python_scrape",
        "generatedAt": generated_at,
        "sourceApi": API_URL,
        "pageTitle": page["title"],
        "pageId": page.get("pageid"),
        "revisionId": revision.get("revid"),
        "revisionTimestamp": revision.get("timestamp"),
        "sections": parse_data.get("sections", []),
        "terrariaTableCount": len(tables),
        "tables": tables,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "outputPath": str(OUTPUT_PATH),
                "pageTitle": result["pageTitle"],
                "terrariaTableCount": result["terrariaTableCount"],
                "sectionCount": len(result["sections"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
