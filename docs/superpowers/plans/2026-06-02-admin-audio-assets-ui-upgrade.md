# Admin Audio Assets UI Upgrade Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/operations/audio-assets` from a plain metadata table into a polished admin audio audit workbench while preserving the already-reviewed local audio stream data chain.

**Architecture:** Keep the backend and audio stream endpoint unchanged. Refactor only the admin Vue page and its static contract test: a compact audit header, a dedicated current-player panel, a denser filter toolbar, and a more scannable table. Playback still uses authenticated `fetch` plus blob URLs; no absolute local paths and no write APIs are introduced.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, scoped CSS, existing TerraPedia admin design tokens, Node built-in test runner.

---

## Scope Lock

In scope:

- Improve `data-query-app/pages/operations/audio-assets.vue` visual hierarchy, layout, and playback UX.
- Keep the page read-only.
- Keep API endpoints and backend code unchanged.
- Add `selectedAudioRowId` and computed helpers for current playback context.
- Update `data-query-app/tests/audio-assets-page-contract.test.mjs` for the new UI contract.
- Keep existing dev preview ports `18188` backend and `3101` admin frontend running if possible.
- Add selected-row/player linkage so the table and current player always explain the same row.
- Add quick read-only audit filters using existing filter state only.

Out of scope:

- Backend changes.
- New database fields or queries.
- Crawler/import/backfill/data refresh.
- Public frontend playback.
- Waveform analysis, audio metadata decoding, or custom audio engine.
- New component library dependency.

## Source Chain

```text
audio_assets API summary/list rows
  -> data-query-app/pages/operations/audio-assets.vue
  -> authenticated stream fetch
  -> blob URL
  -> current player panel <audio controls>
```

The current player panel must never bind `<audio>` directly to `/api/admin/audio-assets/{id}/stream`; it must bind only to blob URLs created after authorized fetch.

## Planned Files

- Modify: `data-query-app/pages/operations/audio-assets.vue`
  - Template: audit header actions, current player panel, filter toolbar, table row polish.
  - Script: selected row/player computed helpers and status label helpers.
  - Style: scoped classes for the workbench, player, chips, status badges, responsive layout.
- Modify: `data-query-app/tests/audio-assets-page-contract.test.mjs`
  - Assert the new current player panel exists.
  - Assert the table still uses authenticated blob playback.
  - Assert refresh/unmount cleanup still resets playback state.
  - Assert no write APIs or absolute local path fields are exposed.
  - Assert responsive/mobile CSS exists for the new workbench.

## UI Design

### Header

Use the existing `workspace-shell--unified` pattern, but make it operational:

- Left: title and short subtitle.
- Middle/inside: problem-first summary cards. `未匹配链接` is the strongest audit card and uses warning tone when nonzero; assets and links remain primary counts; shard count is secondary metadata.
- Right: reuse the existing admin operation action pattern: `.toolbar-top.action-cluster.toolbar-top--hero`. Put refresh and current result/page state here.
- Do not duplicate refresh in the filter toolbar. Search/reset stay in filters; refresh/result state stays in the hero.

### Current Player Panel

Add a full-width panel above the table:

- Empty state: compact operational text, `从表格选择一条音频加载预听`; no illustration or decorative filler.
- Loaded state: show current file title, asset id, shard/kind chips, file size, MIME, link count, relative path, and `<audio controls>`.
- Keep the player outside table rows so row density improves and browser audio controls have enough room.
- The panel is read-only and has no upload/delete/edit controls.
- The current player `<audio>` is the only `<audio>` element on the page and uses `:src="selectedAudioBlobUrl"`.
- Current panel sizing is explicit: `.audio-player-panel audio { width: 100%; min-height: 40px; }`; metadata grids use `minmax(0, 1fr)` tracks.
- The section uses `aria-labelledby`; row errors keep `role="alert"`.

### Filters

Replace the plain filter form with a toolbar-style panel:

- Search field spans the primary area.
- Selects are grouped as compact controls.
- Actions are grouped on the right.
- Show active chips below the toolbar only when filters are set; chips wrap and long values use `overflow-wrap: anywhere`.
- Add read-only audit shortcuts wired to current filter state only, at minimum `未匹配`, and preferably `缺失文件` if current filters support `status=missing`.
- Active chips are removable by clearing the matching filter and refetching page 1.

### Table

Retain the table because this is an audit/admin workflow:

- First column: compact load/playback state button. It has item-specific `aria-label`, `aria-busy` while loading, and min-height `44px`.
- Asset column: asset id, file title, source key.
- Shard/type: chips.
- Media: MIME and size.
- Status/match: grouped status badges ordered asset status then match status, with visible text labels and semantic token tones.
- Path: monospace, wraps safely, no absolute path.
- Wiki: two compact links.
- Selected row has a visible `.audio-asset-row--selected` treatment and does not rely on color alone.
- Row button labels are explicit: `当前播放`, `加载中`, `加载失败`, or `加载音频`.
- Table header is sticky inside `.table-scroll`; `th { white-space: nowrap; }`.
- Target table min width remains stable at `1420px`; path/source cells use `overflow-wrap: anywhere`; asset/media/status cells use `min-width: 0`.
- Numeric values for size and link count use tabular styling.

### Responsive

- Desktop: header/player/table work as dense dashboard.
- Tablet: filter toolbar becomes two columns, current player metadata wraps.
- Mobile: toolbar becomes one column, action buttons wrap, table remains horizontally scrollable with stable min-width.
- Page-level horizontal scroll is not allowed on mobile; only `.table-scroll` may scroll horizontally.
- Add responsive breakpoints at `1180px` and `760px`. The old `640px` mobile breakpoint may be removed or supplemented, but contract and CSS must include `760px`.

### Visual Constraints

- No new background imagery, oversized hero typography, promotional copy, animated decorative effects, decorative blobs/orbs, or nested cards.
- Reuse existing `workspace-shell--unified`, `section-card`, `summary-mini`, `.btn`, and `.input` tokens.
- `.status-badge` uses `var(--color-success|warning|danger|text-secondary)` through `color-mix`, min-height `28px`, and visible labels.
- Text must wrap safely in buttons, filter chips, player metadata, path cells, and status cells.

## Task 1: Contract Tests First

**Files:**

- Modify: `data-query-app/tests/audio-assets-page-contract.test.mjs`

- [ ] Add or update tests for:
  - `.audio-player-panel`
  - `.audio-player-panel--empty`
  - `aria-labelledby` on the current player panel
  - `selectedAudioRow`
  - `selectedAudioBlobUrl`
  - `<audio ... :src="selectedAudioBlobUrl"`
  - table rows do not render their own `<audio>` elements
  - `selectedAudioRowId = row.id` inside successful `loadAudio`
  - `selectedAudioRowId = null` inside playback reset
  - `.audio-asset-row--selected`
  - `.filter-chip-list`
  - an audit shortcut that sets `filters.matchStatus = 'unmatched'`
  - `.status-badge`
  - `@media (max-width: 760px)`
  - strict audio-source safety:
    - extract all `<audio ...>` tags and assert every tag uses only `:src="selectedAudioBlobUrl"`
    - assert no `<audio>` tag has literal `src=`
    - assert no `<audio>` tag contains `/api/admin/audio-assets`, `/admin/audio-assets`, `getAudioStreamUrl`, `localPath`, `sourceUrl`, or `wikiFileUrl`
    - assert `getAudioStreamUrl` is used only inside authenticated `fetch`
  - no `post/put/patch/del` calls
  - native `fetch` calls use `method: 'GET'` only
  - `useApi` import remains `get, handleApiError`
  - no form has a write `method`

Run:

```bash
cd data-query-app && pnpm run test:unit
```

Expected before implementation: the audio assets contract test fails on missing new UI markers.

## Task 2: Page Structure and State

**Files:**

- Modify: `data-query-app/pages/operations/audio-assets.vue`

- [ ] Add `selectedAudioRowId = ref<number | null>(null)`.
- [ ] Add computed helpers:

```ts
const selectedAudioRow = computed(() => rows.value.find((row) => row.id === selectedAudioRowId.value) || null)
const selectedAudioBlobUrl = computed(() => selectedAudioRowId.value ? audioBlobUrls[selectedAudioRowId.value] : '')
const activeFilterChips = computed(() => [
  filters.search ? { key: 'search', label: '关键词', value: filters.search } : null,
  filters.shard ? { key: 'shard', label: '分片', value: filters.shard } : null,
  filters.kind ? { key: 'kind', label: '类型', value: filters.kind } : null,
  filters.status ? { key: 'status', label: '资产状态', value: filters.status } : null,
  filters.matchStatus ? { key: 'matchStatus', label: '匹配状态', value: filters.matchStatus } : null,
].filter(Boolean))
```

- [ ] Add `applyQuickFilter(key: string)` for at least the `unmatched` shortcut:

```ts
async function applyQuickFilter(key: string) {
  if (key === 'unmatched') {
    filters.matchStatus = 'unmatched'
  }
  if (key === 'missing') {
    filters.status = 'missing'
  }
  await fetchRows(1)
}
```

- [ ] Add `removeFilterChip(key: string)` that clears exactly one filter and refetches page 1.
- [ ] In `loadAudio`, set `selectedAudioRowId.value = row.id` only after:
  - `response.ok` is true
  - `response.blob()` completes
  - `URL.createObjectURL(blob)` completes
  - the late-response guard has passed
  - `audioBlobUrls[row.id] = blobUrl` has been assigned
- [ ] No `selectedAudioRowId.value = row.id` assignment may appear before `fetch`, inside non-OK handling, inside `catch`, or inside `finally`.
- [ ] On 401: call `handleApiError`, do not create a blob URL, do not set `selectedAudioRowId.value = row.id`, and clear loading state. Existing current playback may remain only until `handleApiError` redirects/clears auth; do not switch to the failing row.
- [ ] In `resetAudioPlaybackState`, set `selectedAudioRowId.value = null`.
- [ ] Add `statusTone`, `statusLabel`, `matchStatusLabel`, `rowPlaybackStateLabel` helpers.
- [ ] Add `isSelectedRow(row)` or equivalent helper for `.audio-asset-row--selected`.

## Task 3: Template Upgrade

**Files:**

- Modify: `data-query-app/pages/operations/audio-assets.vue`

- [ ] Replace the existing filter/table-only structure with:
  - header action cluster in the hero
  - `.audio-player-panel` section between filter panel and table
  - `.filter-toolbar` and `.filter-chip-list`
  - table cells using `.asset-cell`, `.media-cell`, `.status-badge`, `.path-token`, `.wiki-link-group`

Acceptance details:

- The current player `<audio>` must use `:src="selectedAudioBlobUrl"`.
- The row button remains `@click="loadAudio(row)"`.
- Row playback state must visibly show loading, ready, error, or load action.
- Row playback buttons include item-specific `aria-label` and `:aria-busy`.
- The selected table row uses `.audio-asset-row--selected`.
- No table row renders `<audio>`.
- The table continues to render `row.localPath` only, not absolute path fields.
- Header refresh uses `.toolbar-top.action-cluster.toolbar-top--hero` and filter toolbar does not duplicate refresh.
- Active filter chips can be removed without introducing writes.

## Task 4: Scoped CSS Polish

**Files:**

- Modify: `data-query-app/pages/operations/audio-assets.vue`

- [ ] Add scoped styles for:
  - `.audio-assets-hero`, `.audio-hero-actions`, `.audio-hero-meta`
  - `.filter-panel--workbench`, `.filter-toolbar`, `.filter-chip-list`, `.filter-chip`
  - `.audio-player-panel`, `.audio-player-panel--empty`, `.audio-player-main`, `.audio-player-meta`, `.audio-player-path`
  - `.playback-state-button`, `.status-badge`, `.status-badge--success`, `.status-badge--warning`, `.status-badge--danger`, `.status-badge--muted`
  - `.audio-asset-row--selected`
  - responsive breakpoints at `1180px` and `760px`

Style constraints:

- Use existing tokens: `var(--color-*)`, `var(--radius-*)`, `var(--shadow-*)`.
- Keep cards radius at existing app defaults.
- No decorative blobs/orbs/marketing hero, no new background imagery, no oversized hero typography, no nested cards.
- Text must wrap safely inside buttons, cells, and path areas.
- Keep table min-width stable at `1420px`.
- `.audio-player-panel audio { width: 100%; min-height: 40px; }`.
- `.playback-state-button` min-height is at least `44px`.
- `.filter-chip-list { display: flex; flex-wrap: wrap; min-width: 0; }`.
- `.filter-chip` values use `overflow-wrap: anywhere`.
- `.table-scroll` owns horizontal overflow on small screens; `.audio-assets-admin` and `body` must not create page-level horizontal scroll.

## Task 5: Verification and Runtime Preview

Run:

```bash
cd data-query-app && pnpm run test:unit
cd data-query-app && pnpm run check
```

Then verify the running preview:

```bash
curl -sS -I http://127.0.0.1:3101/ | sed -n '1,8p'
TOKEN=$(curl -sS -X POST http://127.0.0.1:18188/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123456"}' | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.data.token)})")
curl -sS -o /tmp/tp-audio-ui-smoke.out -D /tmp/tp-audio-ui-smoke.headers -w '%{http_code} %{size_download}\n' -H "Authorization: Bearer $TOKEN" -H 'Range: bytes=0-15' http://127.0.0.1:18188/api/admin/audio-assets/1/stream
```

Expected:

- Unit tests pass.
- Nuxt typecheck passes.
- Frontend returns redirect or page response on `3101`.
- Backend audio range smoke returns `206 16`.

Add browser/runtime validation if Playwright or the local browser tooling is available:

- Open `http://127.0.0.1:3101/operations/audio-assets`.
- Log in or seed `tp_admin_token`.
- Wait for audio rows.
- Click the first row playback button.
- Assert the stream request includes `Authorization`.
- Assert the current player audio `src` starts with `blob:`.
- Assert no audio element has `/admin/audio-assets`, `localPath`, `sourceUrl`, or `wikiFileUrl` in `src`.
- Click refresh and page navigation; assert the current player returns to empty state.
- Check desktop, tablet, and mobile widths:
  - `document.documentElement.scrollWidth === document.documentElement.clientWidth`
  - `.table-scroll.scrollWidth >= .table-scroll.clientWidth` on mobile is acceptable
  - `.playback-state-button` height is at least `44px`
  - current panel audio is full-width and at least `40px` high

Manual visual acceptance checklist:

- Header reads as an operational audit summary, not a decorative hero.
- `未匹配链接` is visually emphasized when nonzero.
- Refresh/result state is in the hero action cluster.
- Current player is outside table rows and has enough width for native controls.
- Active filters appear as chips and can be removed.
- Status/match are badge-based and readable without color alone.
- Selected row/hover states make table-player linkage obvious.
- Mobile does not collapse into a raw form plus uncontrolled page-level horizontal scroll.

## Multi-Agent Review Split

- Agent IA reviewer: read-only review of information architecture and whether the page will feel like a real admin workbench.
- Agent UI reviewer: read-only review of visual/responsive risks and design-system consistency.
- Agent test reviewer: read-only review of test plan, playback state edge cases, and whether original safety boundaries remain covered.

No review agent writes files. Execution starts only after important review findings are repaired in this plan.
