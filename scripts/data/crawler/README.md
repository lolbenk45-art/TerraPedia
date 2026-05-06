# Data Crawler Scripts

This directory owns crawler source code and crawler tests.

## Layout

- `scripts/data/crawler/src/`
  - crawler implementation
- `scripts/data/crawler/tests/`
  - crawler-focused tests and fixtures
- `scripts/data/crawler/source-layout-check.mjs`
  - warning-only structure check for legacy source paths

## Data Boundary

`data/wiki-crawler/` remains the crawler data and output root.
It should keep rerunnable outputs, fixtures, and README-level documentation, but not long-term source code.

## Migration Notes

- CLI entrypoint moved from `data/wiki-crawler/src/cli.mjs` to `scripts/data/crawler/src/cli.mjs`
- test entrypoint moved from `data/wiki-crawler/tests/*.test.mjs` to `scripts/data/crawler/tests/*.test.mjs`
- legacy `data/wiki-crawler/src` and `data/wiki-crawler/tests` should be treated as warning-only structure drift if they reappear
