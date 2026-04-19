#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse

import httpx
from bs4 import BeautifulSoup, Tag


WIKI_ORIGIN = "https://terraria.wiki.gg"
ZH_WIKI_ORIGIN = "https://terraria.wiki.gg/zh"
DEFAULT_USER_AGENT = "TerraPedia-town-npc-maintenance/2.0"
LATEST_FILE_NAME = "wiki-town-npc-maintenance.latest.json"
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
MAX_REQUEST_RETRIES = 3

SHOP_HEADING_TEXTS = {"出售物品", "商店", "商品"}
LOCALIZED_PAGE_TITLE_OVERRIDES = {
    "Wizard": "巫师",
    "Cyborg": "机器侠",
    "Angler": "渔夫",
    "TownSlimeRed": "暴躁史莱姆",
    "Pirate": "海盗",
    "Truffle": "松露人",
    "SantaClaus": "圣诞老人",
    "TownDog": "城镇狗狗",
    "TownSlimeOld": "长者史莱姆",
}
HARDMODE_HINTS = {
    "困难模式",
    "困難模式",
    "肉山后",
    "肉山後",
    "血肉墙后",
    "血肉牆後",
    "机械骷髅王",
    "機械骷髏王",
    "机械毁灭者",
    "機械毀滅者",
    "双子魔眼",
    "雙子魔眼",
    "机械 boss",
    "机械boss",
    "機械 boss",
    "機械boss",
    "世纪之花",
    "世紀之花",
    "石巨人",
    "拜月教邪教徒",
    "月亮领主",
    "月亮領主",
    "火星暴乱",
    "火星暴亂",
    "光之女皇",
    "海盗入侵",
    "海盜入侵",
    "霜月",
    "南瓜月",
    "叶绿",
    "葉綠",
}


@dataclass
class TownNpcSeed:
    game_id: int
    internal_name: str
    page_title: str
    name_en: str | None
    name_zh: str | None


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    args = parse_args()
    repo_root = Path(__file__).resolve().parents[3]
    output_path = Path(args.output).resolve() if args.output else repo_root / "data" / "generated" / LATEST_FILE_NAME
    snapshot_path = Path(args.snapshot_output).resolve() if args.snapshot_output else repo_root / "reports" / f"wiki-town-npc-maintenance-{datetime.now().strftime('%Y-%m-%d-%H%M%S')}.json"
    source_path = Path(args.source).resolve() if args.source else repo_root / "data" / "generated" / "npc-standardized-map.json"

    seeds = load_town_npc_seeds(source_path)
    if args.limit is not None:
        seeds = seeds[: max(args.limit, 0)]

    client = httpx.Client(
        headers={"User-Agent": DEFAULT_USER_AGENT},
        follow_redirects=True,
        timeout=20.0,
    )
    try:
        records = crawl_records(client, seeds, args.delay_ms / 1000.0)
    finally:
        client.close()

    payload = {
        "entity": "wiki_town_npc_maintenance",
        "generatedAt": now_iso(),
        "sourceMode": "wiki_zh_page_html",
        "sourceOrigin": ZH_WIKI_ORIGIN,
        "sourceSeedPath": str(source_path),
        "totalTownNpcs": len(seeds),
        "summary": build_summary(records),
        "records": records,
    }

    write_json(output_path, payload)
    write_json(snapshot_path, payload)

    print(json.dumps(
        {
            "output": str(output_path),
            "snapshot": str(snapshot_path),
            "seedCount": len(seeds),
            "scrapedCount": payload["summary"]["scrapedCount"],
            "errorCount": payload["summary"]["errorCount"],
            "shopItems": payload["summary"]["shopItemCount"],
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch localized town NPC maintenance source data from Terraria wiki zh pages.")
    parser.add_argument("--source", help="Path to npc-standardized-map.json")
    parser.add_argument("--output", help="Path to latest JSON output")
    parser.add_argument("--snapshot-output", dest="snapshot_output", help="Path to snapshot JSON output")
    parser.add_argument("--delay-ms", type=int, default=1600, help="Base delay between page requests")
    parser.add_argument("--limit", type=int, help="Limit seed count for dry runs")
    return parser.parse_args()


def load_town_npc_seeds(source_path: Path) -> list[TownNpcSeed]:
    payload = json.loads(source_path.read_text(encoding="utf-8"))
    records = payload.get("records") or {}
    seeds: list[TownNpcSeed] = []

    for raw_game_id, raw_record in records.items():
        if not isinstance(raw_record, dict):
            continue
        raw_json = parse_json_object(raw_record.get("rawJson"))
        extras = raw_json.get("extras") if isinstance(raw_json.get("extras"), dict) else {}
        if not truthy(extras.get("townNPC")):
            continue

        game_id = to_int(raw_record.get("gameId")) or to_int(raw_game_id)
        internal_name = normalize_text(raw_record.get("internalName"))
        name_en = normalize_text(raw_json.get("name"))
        name_zh = normalize_text(raw_record.get("nameZh"))
        page_title = normalize_text(raw_json.get("name")) or normalize_text(raw_record.get("internalName"))
        if game_id is None or not internal_name or not page_title:
            continue

        seeds.append(
            TownNpcSeed(
                game_id=game_id,
                internal_name=internal_name,
                page_title=page_title,
                name_en=name_en,
                name_zh=name_zh,
            )
        )

    seeds.sort(key=lambda row: row.game_id)
    return seeds


def crawl_records(client: httpx.Client, seeds: list[TownNpcSeed], delay_seconds: float) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, seed in enumerate(seeds):
        if index > 0:
            time.sleep(delay_seconds + random.uniform(0.0, 0.4))
        try:
            records.append(fetch_town_npc_record(client, seed))
        except Exception as exc:  # noqa: BLE001
            records.append(
                {
                    "gameId": seed.game_id,
                    "internalName": seed.internal_name,
                    "pageTitle": seed.page_title,
                    "pageUrl": build_page_url(seed.page_title),
                    "fetchedAt": now_iso(),
                    "error": str(exc),
                    "shopItems": [],
                    "shopItemCount": 0,
                    "moveInConditions": [],
                    "suggestedGamePeriodId": None,
                    "suggestedGamePeriodReason": None,
                }
            )
    return records


def fetch_town_npc_record(client: httpx.Client, seed: TownNpcSeed) -> dict[str, Any]:
    response = None
    last_error: Exception | None = None
    candidate_titles = [seed.page_title]
    localized_title = LOCALIZED_PAGE_TITLE_OVERRIDES.get(seed.internal_name)
    if localized_title and localized_title not in candidate_titles:
        candidate_titles.append(localized_title)
    if seed.name_zh and seed.name_zh not in candidate_titles:
        candidate_titles.append(seed.name_zh)

    for candidate_title in candidate_titles:
        page_url = build_page_url(candidate_title)
        try:
            response = get_with_retry(client, page_url)
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc

    if response is None:
        if last_error is not None:
            raise last_error
        raise RuntimeError(f"Failed to resolve wiki page for {seed.internal_name}")

    html = response.text
    soup = BeautifulSoup(html, "html.parser")
    parser_output = resolve_main_parser_output(soup)
    if not parser_output:
        raise RuntimeError(f"Parser output not found for {seed.page_title}")

    intro_paragraph, move_in_conditions = extract_intro_and_conditions(parser_output)
    shop_items = extract_shop_items(parser_output)
    wiki_details = extract_wiki_details(parser_output)
    page_title = extract_title_text(soup) or seed.page_title
    page_id = extract_wg_number(html, "wgArticleId")
    revision_id = extract_wg_number(html, "wgRevisionId")
    suggested_period_id, suggested_reason = infer_game_period(intro_paragraph, move_in_conditions)

    return {
        "gameId": seed.game_id,
        "internalName": seed.internal_name,
        "pageTitle": page_title,
        "pageUrl": str(response.url),
        "pageId": page_id,
        "revisionId": revision_id,
        "nameEn": seed.name_en,
        "nameZh": page_title,
        "functionSummary": intro_paragraph,
        "moveInConditions": [{"text": text} for text in move_in_conditions],
        "moveInSummary": "；".join(move_in_conditions) if move_in_conditions else None,
        "suggestedGamePeriodId": suggested_period_id,
        "suggestedGamePeriodReason": suggested_reason,
        "shopItems": shop_items,
        "shopItemCount": len(shop_items),
        "wikiDetails": wiki_details,
        "fetchedAt": now_iso(),
        "error": None,
    }


def get_with_retry(client: httpx.Client, page_url: str) -> httpx.Response:
    last_error: Exception | None = None
    for attempt in range(1, MAX_REQUEST_RETRIES + 1):
        try:
            response = client.get(page_url)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            last_error = exc
            if exc.response.status_code not in RETRYABLE_STATUS_CODES or attempt >= MAX_REQUEST_RETRIES:
                raise
        except httpx.HTTPError as exc:
            last_error = exc
            if attempt >= MAX_REQUEST_RETRIES:
                raise
        time.sleep((0.8 * attempt) + random.uniform(0.0, 0.3))

    if last_error is not None:
        raise last_error
    raise RuntimeError(f"Failed to fetch page: {page_url}")


def resolve_main_parser_output(soup: BeautifulSoup) -> Tag | None:
    outputs = soup.select(".mw-parser-output")
    if not outputs:
        return None
    return max(outputs, key=lambda node: len(node.get_text(" ", strip=True)))


def extract_intro_and_conditions(parser_output: Tag) -> tuple[str | None, list[str]]:
    text_blocks = [child for child in parser_output.find_all(recursive=False) if isinstance(child, Tag)]
    intro_paragraph: str | None = None
    move_in_conditions: list[str] = []

    for child in text_blocks:
        if child.name == "p" and intro_paragraph is None:
            text = clean_text(child.get_text(" ", strip=True))
            if text:
                intro_paragraph = text
            continue
        if child.name == "ul" and intro_paragraph is not None:
            for item in child.find_all("li", recursive=False):
                text = clean_text(item.get_text(" ", strip=True))
                if text:
                    move_in_conditions.append(text)
            if move_in_conditions:
                break
        if child.name == "h2" and intro_paragraph is not None:
            break

    return intro_paragraph, move_in_conditions


def extract_shop_items(parser_output: Tag) -> list[dict[str, Any]]:
    heading = find_shop_heading(parser_output)
    if heading is None:
        return []

    table = heading.find_next("table")
    if table is None:
        return []

    rows = table.find_all("tr")
    if len(rows) <= 1:
        return []

    items: list[dict[str, Any]] = []
    for row in rows[1:]:
        cells = row.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        primary_anchor = cells[0].find("a", href=True)
        if primary_anchor is None:
            continue

        name_zh = clean_text(primary_anchor.get_text(" ", strip=True)) or clean_text(primary_anchor.get("title"))
        href_title = extract_title_from_href(primary_anchor.get("href"))
        name_en = normalize_title_slug(href_title)
        price_text = clean_text(cells[1].get_text(" ", strip=True))
        availability = clean_text(cells[2].get_text(" ", strip=True))
        if not name_zh and not name_en:
            continue
        items.append(
            {
                "nameZh": name_zh,
                "nameEn": name_en,
                "priceText": price_text,
                "availability": availability,
            }
        )
    return items


def find_shop_heading(parser_output: Tag) -> Tag | None:
    for heading in parser_output.find_all("h2"):
        text = clean_text(heading.get_text(" ", strip=True))
        if text and any(key in text for key in SHOP_HEADING_TEXTS):
            return heading
    return None


def extract_wiki_details(parser_output: Tag) -> dict[str, Any]:
    detail = {
        "types": [],
        "environments": [],
        "aiType": None,
        "damage": None,
        "lifeMax": None,
        "defense": None,
        "knockBackResist": None,
        "sounds": [],
        "spriteImage": None,
        "mapIconImage": None,
        "dialogPortraitImage": None,
    }

    infobox = parser_output.select_one(".infobox.npc")
    if infobox:
        sprite_section = infobox.select_one(".section.images")
        if sprite_section:
            for image in sprite_section.find_all("img"):
                alt = clean_text(image.get("alt")) or ""
                if "old" in alt.lower() or "前代" in alt:
                    continue
                src = normalize_image_src(image.get("src"))
                if src:
                    detail["spriteImage"] = src
                    break

        for image_block in infobox.select(".imageother"):
            caption = clean_text(image_block.select_one(".imageothercaption").get_text(" ", strip=True)) if image_block.select_one(".imageothercaption") else None
            image = image_block.find("img")
            src = normalize_image_src(image.get("src")) if image else None
            if not caption or not src:
                continue
            if "地图图标" in caption or "地圖圖標" in caption:
                detail["mapIconImage"] = src
            elif "对话肖像" in caption or "對話肖像" in caption:
                detail["dialogPortraitImage"] = src

    stat_tables = parser_output.find_all("table", class_="stat")
    if stat_tables:
        for row in stat_tables[0].find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) < 2:
                continue
            key = clean_text(cells[0].get_text(" ", strip=True))
            value_cell = cells[1]
            value_text = clean_text(value_cell.get_text(" ", strip=True))
            if not key or not value_text:
                continue
            if key in {"类型", "類型"}:
                detail["types"] = [clean_text(tag.get_text(" ", strip=True)) for tag in value_cell.select(".tag, .nowrap")] or [value_text]
            elif key in {"环境", "環境"}:
                detail["environments"] = [clean_text(tag.get_text(" ", strip=True)) for tag in value_cell.select(".tag, .nowrap")] or [value_text]
            elif "AI 类型" in key or "AI 類型" in key or "AI類型" in key:
                detail["aiType"] = value_text
            elif key in {"伤害", "傷害"}:
                detail["damage"] = value_text
            elif "最大生命值" in key or "最大生命值" in key:
                detail["lifeMax"] = value_text
            elif "防御" in key or "防禦" in key:
                detail["defense"] = value_text
            elif "击退" in key or "擊退" in key:
                detail["knockBackResist"] = value_text

    if len(stat_tables) > 1:
        for row in stat_tables[1].find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) < 2:
                continue
            label = clean_text(cells[0].get_text(" ", strip=True))
            if label:
                detail["sounds"].append(label)

    detail["types"] = [value for value in detail["types"] if value]
    detail["environments"] = [value for value in detail["environments"] if value]
    return detail


def infer_game_period(intro_paragraph: str | None, move_in_conditions: list[str]) -> tuple[int | None, str | None]:
    text = " ".join(filter(None, [intro_paragraph, *move_in_conditions]))
    if not text:
        return None, None

    lowered = text.lower()
    if any(keyword in text for keyword in HARDMODE_HINTS) or "hardmode" in lowered:
        return 2, "条件或说明中命中困难模式、机械 Boss、世纪之花等后期关键词。"
    return 1, "未命中困难模式关键词，默认归为前期或困难模式前可出现的城镇 NPC。"


def build_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    scraped_count = sum(1 for row in records if not row.get("error"))
    error_count = sum(1 for row in records if row.get("error"))
    shop_item_count = sum(len(row.get("shopItems") or []) for row in records)
    hardmode_suggestions = sum(1 for row in records if row.get("suggestedGamePeriodId") == 2)
    prehardmode_suggestions = sum(1 for row in records if row.get("suggestedGamePeriodId") == 1)
    return {
        "recordCount": len(records),
        "scrapedCount": scraped_count,
        "errorCount": error_count,
        "shopItemCount": shop_item_count,
        "hardmodeSuggestions": hardmode_suggestions,
        "prehardmodeSuggestions": prehardmode_suggestions,
    }


def build_page_url(page_title: str) -> str:
    encoded = quote(page_title.replace(" ", "_"), safe="/:_()'!,")
    return f"{ZH_WIKI_ORIGIN}/wiki/{encoded}"


def extract_title_text(soup: BeautifulSoup) -> str | None:
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if not title:
        return None
    return clean_text(title.split(" - ", 1)[0])


def extract_title_from_href(href: str | None) -> str | None:
    if not href:
        return None
    parsed = urlparse(href)
    path = parsed.path or ""
    if "/wiki/" not in path:
        return None
    slug = path.split("/wiki/", 1)[1]
    return unquote(slug)


def normalize_title_slug(value: str | None) -> str | None:
    text = normalize_text(value)
    if not text:
        return None
    return text.replace("_", " ")


def extract_wg_number(html: str, key: str) -> int | None:
    pattern = re.compile(rf'"{re.escape(key)}":(-?\d+)')
    match = pattern.search(html)
    if not match:
        return None
    return to_int(match.group(1))


def parse_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes"}


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def clean_text(value: Any) -> str | None:
    text = normalize_text(value)
    if not text:
        return None
    return re.sub(r"\s+", " ", text).strip()


def normalize_image_src(value: Any) -> str | None:
    text = normalize_text(value)
    if not text:
        return None
    if text.startswith("//"):
        return f"https:{text}"
    if text.startswith("/"):
        return f"{WIKI_ORIGIN}{text}"
    return text


def to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
