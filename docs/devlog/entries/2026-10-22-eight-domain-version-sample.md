# Devlog: eight-domain Wiki version sample

## Status

`closed`

## Context

- User goal: crawl ten bounded Wiki samples per domain across Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses, and Shimmer, verify PC-only version evidence through Wiki API, and retrieve the PC `1.4.5.8` update information without rate-limit pressure.
- Branch: `ops/eight-domain-version-sample-20261022`.
- Worktree: `/home/lolben/TerraPedia/.worktrees/eight-domain-production-readiness-main/.worktrees/eight-domain-version-sample-20261022`.
- Base: `origin/main` at `42ab9d1a7bcd939b2831bff20773e90383b78902`.
- Related plan: `docs/superpowers/plans/2026-10-22-eight-domain-version-sample.md`.
- Related parent entry: `docs/devlog/entries/2026-10-16-eight-domain-production-readiness-plan.md`.

## Direction / Decisions

- Chosen approach: reuse the existing monitor-visible ten-page sampler for seven page domains and Audio metadata-only mode; query additional source support pages, the Wiki Module namespace, and `Template:Current versions` through the shared API request gate with monitor-visible progress.
- Reasoning: keep requests serial behind the shared Wiki request gate and avoid canonical `latest` outputs or audio downloads.
- Version interpretation: source `wikiVersion`/`_terrariaversion` may support a source-level comparison; `eicons` and source-code refs are per-fact annotations only. Missing markers remain `unknown`.
- Scope clarification: all version conclusions and update-note lookup are Desktop/PC only; other platform versions are excluded from the comparison.

## Scope

- Data: bounded public Wiki samples and read-only PC version/update report under `.local/tmp/wiki-version-sample-20261022/`, including source revisions, the global current-version template, dependency metadata, and audio catalogue fields.
- Code: add typed version evidence and content hashes to the existing domain-smoke sample report.
- Out of scope: full domain recrawls, canonical/standardized data updates, source-manifest advancement, database/Redis writes, production scheduler/authorization, and Audio binary downloads.

## Validation

- Commands run: baseline smoke tests `14/14`; post-change smoke tests `17/17`; monitor-visible Iteminfo/Npcinfo probe `wiki-version-source-probe-20261022`; five-domain source probe `wiki-other-domain-source-probe-20261022`; Wiki Module namespace/supporting-page audit `wiki-version-api-source-audit-20261022`; PC version anchor probe `wiki-current-versions-template-probe-20261022`; PC update-note search `wiki-pc-update-1458-20261022`; changelog revision fetch; metadata-only Audio API re-fetch; `git diff --check`.
- Results: seven page domains returned `10/10`; Audio returned ten metadata-only records on both samples, downloaded `0`; all API probes reached terminal `completed`; the shared request gate had no cooldown before probes and none after completion; no full page body or audio binary was persisted. The focused monitor sampler tests pass `17/17`.
- Not run: full-corpus recrawls, canonical import, database tests, V2 automatic ingestion, or an exact entity-ID parity join.

## Result

- Completed: isolated worktree and plan; typed sample version evidence; 70 page revisions and ten BGM metadata rows captured; run-scoped comparison summary created.
- Wiki global PC version anchor: `Template:Current versions` revision `1032950` (2026-10-04) declares Desktop/PC `1.4.5.8`.
- API Module namespace search: `insource:"_terrariaversion"` returned eight pages, covering Iteminfo/Npcinfo modules and generators plus `Module:ArmorSetBonuses`; `insource:wikiVersion` returned zero. The three domain data claims remain Items/NPCs `1.4.5.7` and Armor Sets `1.4.5.3`; local Items/NPCs metadata is older (`1.4.5.6`/`1.4.5.1`).
- Remaining five domains: Projectiles' exact data module and docs/generator have no module-level version field, but search-result pages carry per-fact source-code references including `1.4.5.8`. `Template:GetBuffInfo` has no single version stamp; the source chain's Iteminfo/Npcinfo dependencies both declare `1.4.5.7`, while `Whips` has fact-level references `1.4.5.7` and `1.4.5.6`. Audio's ten fresh `allimages` BGM records and display-name metadata have no game-version field; downloads are zero. `Bosses` overview has no domain stamp, while representative boss pages cite source-code versions up to `1.4.5.8` and carry per-entity patch categories. The exact `微光` source page cites `1.4.4.9` and is categorized as containing information based on outdated source code; its citations are fact-level, not the current game version.
- Conclusion: the five domains do have useful Wiki PC-version evidence, but not five matching domain-wide version declarations. The current Wiki Desktop version is `1.4.5.8`; domain source provenance is mixed and does not prove local full-corpus parity.
- PC `1.4.5.8` update: the Wiki has a dedicated page, current revision `1029883`, and Desktop version-history revision `1023996` lists the release date `2026-08-23` as a Hotfix. Its changelog has two content changes and twelve bug fixes; the complete extracted list is in `.local/tmp/wiki-version-sample-20261022/version-comparison.json`. The Wiki page references official forum thread `150939`.

## Residual Risks

- `Template:Current versions` and the changelog page are Wiki evidence, not an independent game-client verification. Domain-level stamps are absent for the five domains above, and exact local entity-ID parity is not established.

## Follow-up

- For exact local-data parity, bind each sample to ten stable local entity IDs/page identities; current search-based samples include support/index/translated pages.

## Commits

- Pending; no commit was requested.

## User stop decision — 2026-11-11

- 用户明确停止全部现有任务；本条因 intentionally stopped 关闭，不代表功能完成或验收通过。
- 保留上文历史问题、验证记录与未完成项；旧的执行、授权和 next-action 指令均不自动恢复。
- 本次未重新验证业务功能；复工须重新确认目标、运行态与授权，并创建新的 active entry。
- 分支交接：`docs/handoffs/2026-11-11-workspace-stop.md`。Stop reason: user-requested cancellation and recoverable branch snapshot.
