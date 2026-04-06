# Upstream Monitor

This folder contains only the automated upstream-reading code.

## Included Here

- `check-upstream-updates.mjs`
  - Checks Terraria Wiki.gg module revisions and content hashes
  - Checks Steam Terraria news
  - Checks Terraria official forum announcements
  - Writes monitor results into `G:\ClaudeCode\terraPedia-db-redesign\data\generated`

## Not Included Here

These are fetch/import pipeline scripts, not monitor scripts:

- `G:\ClaudeCode\terraPedia\scripts\data\fetch-wiki-iteminfo.mjs`
- `G:\ClaudeCode\terraPedia\scripts\data\fetch-wiki-npcinfo.mjs`
- `G:\ClaudeCode\terraPedia\scripts\data\fetch-wiki-projectileinfo.mjs`
- `G:\ClaudeCode\terraPedia\scripts\data\fetch-wiki-armorsetbonuses.mjs`
- `G:\ClaudeCode\terraPedia\scripts\data\fetch-wiki-buffs.mjs`
- `G:\ClaudeCode\terraPedia\scripts\data\fetch-wiki-item-pages.mjs`
- `G:\ClaudeCode\terraPedia\scripts\data\normalize-wiki-items.mjs`

## Boundary

- `scripts/upstream-monitor`
  - Only reads upstream status
  - Does not run the full data-fetch pipeline
  - Does not standardize data
  - Does not import into DB

- `terraPedia/scripts/data`
  - Fetches raw upstream content
  - Normalizes upstream content
  - Builds import payloads

## Run

```powershell
node G:\ClaudeCode\terraPedia-db-redesign\scripts\upstream-monitor\check-upstream-updates.mjs --format=json
```
