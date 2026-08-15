# Upstream Monitor

This folder contains only the automated upstream-reading code.

## Included Here

- `check-upstream-updates.mjs`
  - Checks Terraria Wiki.gg module revisions and content hashes
  - Checks Steam Terraria news
  - Checks Terraria official forum announcements
  - Writes monitor results to the configured shared-data root under `generated/`

## Not Included Here

These are fetch/import pipeline scripts, not monitor scripts:

- `pipelines/fetch/fetch-wiki-iteminfo.mjs`
- `pipelines/fetch/fetch-wiki-npcinfo.mjs`
- `pipelines/fetch/fetch-wiki-projectileinfo.mjs`
- `pipelines/fetch/fetch-wiki-armorsetbonuses.mjs`
- `pipelines/fetch/fetch-wiki-buffs.mjs`
- `pipelines/fetch/fetch-wiki-item-pages.mjs`
- `pipelines/normalize/normalize-wiki-items.mjs`

## Boundary

- `platform/tooling/upstream-monitor`
  - Only reads upstream status
  - Does not run the full data-fetch pipeline
  - Does not standardize data
  - Does not import into DB

- `terraPedia/pipelines`
  - Fetches raw upstream content
  - Normalizes upstream content
  - Builds import payloads

## Run

```bash
node platform/tooling/upstream-monitor/check-upstream-updates.mjs --format=json
```
