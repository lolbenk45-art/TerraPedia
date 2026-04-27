# Data Directory

This directory stores data layers and generated datasets.

Active shared data outputs are currently centralized into:

- `G:\ClaudeCode\data\terraPedia`

## Target Data Layers

- `data/raw/`: external source payloads with minimal transformation.
- `data/normalized/`: cleaned and normalized intermediate data.
- `data/canonical/`: audited trusted data used by import and replacement scripts.
- `data/exports/`: generated outputs consumed by frontend, admin tools, or external tools.
- `data/legacy/`: old datasets and migration comparison snapshots.

New category replacement work should use `data/canonical/category/` as the trusted file input layer. Legacy category data should not be mixed into canonical outputs.

## Output Location

- `data/standardized/*.standardized.json`
- `data/standardized/_manifest.standardized.json`
- `data/generated/source-update-monitor.latest.json`

Current active locations:

- `G:\ClaudeCode\data\terraPedia\standardized`
- `G:\ClaudeCode\data\terraPedia\standardized-view`
- `G:\ClaudeCode\data\terraPedia\generated`

The existing `standardized`, `standardized-view`, and `generated` directories are historical active outputs. They should not be treated as the default location for new category replacement contracts unless a migration plan explicitly says so.

## Upstream Source Monitor

The automated upstream-reading code is now isolated in:

- `G:\ClaudeCode\TerraPedia-dev\scripts\tooling\upstream-monitor`

Main script:

```powershell
node TerraPedia-dev/scripts/tooling/upstream-monitor/check-upstream-updates.mjs
```

This monitor output is intentionally separate from `_manifest.standardized.json`.
`_manifest.standardized.json` describes standardized output that already exists.
The upstream monitor files describe whether upstream wiki or official release sources changed and whether a refresh pipeline should run.

## Generate / Refresh

From workspace root (`G:\ClaudeCode`):

```powershell
node TerraPedia-dev/scripts/data/transform/standardize-existing-data.mjs
```

Optional overrides:

- `TERRAPEDIA_SOURCE_DATA_DIR`: source data root (default: `terraPedia/data`)
- `TERRAPEDIA_STANDARDIZED_OUTPUT_DIR`: output directory (default: `TerraPedia-dev/data/standardized`)

Example:

```powershell
$env:TERRAPEDIA_SOURCE_DATA_DIR="G:\ClaudeCode\data\terraPedia"
$env:TERRAPEDIA_STANDARDIZED_OUTPUT_DIR="G:\ClaudeCode\data\terraPedia\standardized"
node TerraPedia-dev/scripts/data/transform/standardize-existing-data.mjs
```

## Monitor Upstream Freshness

This repo can run upstream freshness checks directly from the redesign workspace.

From workspace root (`G:\ClaudeCode`):

```powershell
node TerraPedia-dev/scripts/tooling/upstream-monitor/check-upstream-updates.mjs
```

The monitoring flow writes:

- `G:\ClaudeCode\data\terraPedia\generated\upstream-update-state.json`: last known upstream state for scheduled runs
- `G:\ClaudeCode\data\terraPedia\generated\upstream-update-check.json`: latest check snapshot

Useful options:

- `--check-official=false`
- `--state-file=...`
- `--output-file=...`
- `--format=text`
