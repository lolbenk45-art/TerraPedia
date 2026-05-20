# wiki.gg crawler allowlist status audit (2026-05-20)

## Scope

- Plan task: `I-0.6 wiki.gg 爬虫白名单状态`
- Goal: determine whether the project has a recorded wiki.gg maintainer/bot allowlist contact and whether the User-Agent contact story is sufficient.

## Search Performed

I searched repo docs, plans, scripts, workflows, and git history for terms including:

```text
wiki.gg, allowlist, whitelist, allow-list, bot allow, maintainer, contact,
User-Agent, user agent, UA, Cloudflare, 403, challenge
```

No document, plan, issue record, script comment, or commit message was found that records contacting wiki.gg maintainers or receiving a bot allowlist.

## Existing Evidence

The repo has prior evidence that wiki.gg page-style traffic can hit Cloudflare controls:

- `docs/research/terraria-wiki-data-acquisition-analysis.md:167-192` notes that HTML/page traffic is more likely to trigger Cloudflare risk controls.
- `project-plan/archive/2026-04/微光数据链路与管理端接入汇总_2026-04-09.md:76-85` records `requests.get(https://terraria.wiki.gg/zh/wiki/微光)` returning `403 Blocked`, with the mitigation being MediaWiki API usage.

The current crawler/client User-Agent story is not centralized:

- `scripts/data/lib/wiki-request-gate.mjs:8` uses `TerraPedia-data-sync/2.0 (+https://terraria.wiki.gg/api.php)`.
- `scripts/data/lib/wiki-item-utils.mjs:10-15` overrides the gate UA with `TerraPedia-data-sync/2.0`, dropping the parenthesized contact/reference segment.
- `scripts/data/fetch/fetch_wiki_shimmer_via_bs4.py:16-21` uses `TerraPedia-python-scraper/1.0`.
- `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py:20-22` uses `TerraPedia-town-npc-maintenance/2.0`.
- `back/src/main/java/com/terraria/skills/service/impl/MinioWikiImageLocalizationServiceImpl.java:276-281` and `:375-380` use `TerraPediaBot/1.0 (+https://local.terrapedia)`.
- `front-nuxt/server/routes/preview-assets/[...path].get.ts:35-40` uses `TerraPedia preview asset proxy`.

Some of these values identify TerraPedia, but none point to a durable public contact page or email. `+https://local.terrapedia` is not a reachable external contact URL.

## I-0.6 Answer

No recorded wiki.gg bot allowlist or maintainer-contact status was found. The safe Phase 1 assumption is: TerraPedia is not allowlisted with wiki.gg.

## Required Follow-Up

Before increasing crawler volume or adding new high-volume page fetchers:

- create a tracked contact record under docs or reports with date, channel, requested scope, and current status;
- provide a durable public contact URL or email for crawler User-Agent strings;
- centralize the wiki.gg User-Agent constant so JS, Python, Java, and preview proxy traffic do not drift;
- keep default crawler behavior on the official MediaWiki API where possible and avoid high-volume HTML page crawling without explicit rate limits and monitor-visible progress.

## Phase 1 Impact

T-1.1 remains important because direct wiki.gg clients still bypass the single gate and use inconsistent User-Agent values. T-1.2 remains relevant because the repo already has documented Cloudflare/403 page-fetch failures and Linux/WSL fallback is not yet established for every path.
