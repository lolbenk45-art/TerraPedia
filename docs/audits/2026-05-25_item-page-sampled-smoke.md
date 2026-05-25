# Item Page Sampled Smoke - 2026-05-25

## Boundary

- Full crawl: not run.
- Sample sizes: `20`, then `100`.
- Sample seed: `v0.1-preview-2026-05-25`.
- Probe-only: `true`.
- DB writes: none.
- Domain evidence: not used.
- Domain report path: not written.

## Fix Before Smoke

- Initial 20-item probe selected `0` items because `data/standardized/items.standardized.json` uses a `records` top-level array while the sampled fetcher only read `items`.
- Added a focused regression test for standardized `records` input.
- Updated `scripts/data/fetch/fetch-wiki-item-pages.mjs` to accept `items`, `records`, or a top-level array.
- Focused crawler tests after the fix: `node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs scripts/data/workflow/run-wiki-sync.test.mjs` -> `20` passed, `0` failed.

## Result

- 20-item report: `reports/fetch/fetch-item-pages-probe-2026-05-25T03-22-23.552Z.json`
- 20-item selected: `20`
- 20-item changed: `20`
- 20-item errors: `0`
- 100-item report: `reports/fetch/fetch-item-pages-probe-2026-05-25T03-22-54.433Z.json`
- 100-item selected: `100`
- 100-item changed: `100`
- 100-item errors: `0`
- Candidate count before sample: `6131`
- Progress path: `reports/local-start/item-page-sampled-smoke-progress-2026-05-25.json`
- Progress status after 100 sample: `completed`, `current=100`, `total=100`.

## Runtime Notes

- Redis heartbeat attempted `127.0.0.1:6379` and was skipped because that Redis endpoint refused connection.
- The sampled probe itself exited `0` and wrote the configured progress/report files.
- Generated probe reports remain runtime artifacts and are not promoted to Domain Acceptance evidence.

## Decision

- Keep sample smoke as runtime/crawler confidence only.
- Do not promote this report to Domain Acceptance evidence.
- Do not run a full item-page crawl from this polish loop.
