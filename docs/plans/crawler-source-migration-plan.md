# Crawler Source Migration Plan

## Goal

Move crawler implementation code out of `data/wiki-crawler/` and into `scripts/data/crawler/` while keeping `data/wiki-crawler/` as the data/output root.

## Scope

- move `data/wiki-crawler/src/**` to `scripts/data/crawler/src/**`
- move `data/wiki-crawler/tests/**` to `scripts/data/crawler/tests/**`
- update crawler-local imports, CLI help text, and narrow test entrypoints
- keep `data/wiki-crawler/**` output/report directories intact
- keep structure enforcement warning-only if legacy source paths reappear

## Non-Goals

- no DB apply/import/backfill behavior changes
- no crawler output schema changes
- no monitor/backend contract changes

## Migration Rules

1. `scripts/data/crawler/src/cli.mjs` becomes the canonical crawler CLI path.
2. `scripts/data/crawler/tests/*.test.mjs` becomes the canonical crawler test location.
3. `data/wiki-crawler/README.md` documents that the directory now stores data artifacts only.
4. Legacy source-layout drift is reported through `scripts/data/crawler/source-layout-check.mjs` as warning-only, never blocking.

## Verification

- `node --check scripts/data/crawler/src/cli.mjs`
- `node --check scripts/data/crawler/source-layout-check.mjs`
- `node --test scripts/data/crawler/tests/source-layout-warning.test.mjs`
- narrow crawler regression slice from `scripts/data/crawler/tests/*.test.mjs`
