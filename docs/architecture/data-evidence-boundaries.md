# Data And Evidence Boundaries

Status: active boundary policy for the 2026-05-14 responsibility cleanup.

This document defines where TerraPedia data artifacts and evidence artifacts belong. It is a compatibility guard, not a migration plan. Do not move active data contracts, relation evidence JSON, crawler outputs, or script entrypoints based only on directory appearance.

## Boundary Rules

- `data/**` stores source inputs, transitional data contracts, canonical data, exports, legacy snapshots, and crawler outputs.
- `reports/**` stores evidence produced by audits, relation checks, readiness gates, or local runtime processes.
- Unknown ownership or unknown consumers must be marked `needs-followup`; do not infer `unused` from a single search.
- Future path moves require an alias-first migration plan, consumer inventory, validation command, and rollback path.
- This pass does not move or edit `data/**` files, `reports/relation/*.json`, or script implementations.

## Data Layers

### `data/canonical/**`

`data/canonical/**` is the trusted target layer for audited domain inputs. New replacement work should promote data here only after the source, writer, validation, and consumer contract are explicit. Import or write-db scripts should not bypass canonical by reading raw or legacy inputs as their default source.

Current note: `data/canonical/category/**` is the preferred trusted input layer for category replacement work.

### `data/generated/**`

`data/generated/**` is semantically mixed and compatibility-critical. It contains active transitional inputs, derived support maps, override layers, runtime monitor state, and historical snapshots.

High-risk generated contracts must stay path-stable until every direct consumer has migrated or an alias exists. This includes item group files, recipe reference files, boss and town NPC latest files, shimmer outputs, and crawler NPC bridge outputs. If a generated artifact has unclear consumers, label it `needs-followup`.

### `data/standardized/**`

`data/standardized/*.standardized.json` and `data/standardized/_manifest.standardized.json` are active transitional contracts. They are used by import, maintenance, audit, monitor, and view-splitting flows. They are not cold archives.

The manifest describes standardized outputs that already exist; upstream freshness monitor state is a separate generated concern.

### `data/standardized-view/**`

`data/standardized-view/**` is a downstream split view of standardized data. It exists for compatibility, inspection, and consumer convenience. Treat it as derived from `data/standardized/**`, not as a source-of-truth layer.

### `data/legacy/**`

`data/legacy/**` stores old data, migration comparison snapshots, and rollback evidence. New scripts must not default to this path. Any read from legacy data must be explicit in script parameters, reports, and acceptance evidence.

### `data/exports/**`

`data/exports/**` is reserved for generated outputs consumed by frontends, admin tools, or external tooling. Export files are not automatically source of truth; each export needs a writer, upstream source, and consumer contract before it can be moved or regenerated.

### `data/terraPedia/raw/**`

`data/terraPedia/raw/**` is external-source payload storage with minimal transformation. It is raw evidence for later normalization or canonical promotion. Runtime and database import flows should not treat raw files as default trusted inputs.

### `data/wiki-crawler/**`

`data/wiki-crawler/**` is reserved for crawler data, reports, normalized outputs, canonical candidates, audits, and other rerunnable artifacts. Crawler source and tests live under `scripts/data/crawler/**`; this data directory should not regain script-source responsibility.

Crawler output under this path is not promoted into long-term facts until the relevant milestone gate accepts it.

## Evidence Layers

### `reports/**`

`reports/**` is evidence, not an implicit data source. It may include tracked audit evidence and ignored local runtime output. A report becomes durable project knowledge only when it is tracked, linked from a plan/audit, or promoted into `docs/audits/**`.

### `reports/relation/**`

`reports/relation/**` contains tracked relation evidence and readiness snapshots. Existing JSON files in this directory are explicitly not moved in this pass. Treat them as compatibility-sensitive evidence because downstream audit, handoff, or review workflows may reference the exact path.

### `reports/canonical/candidates/**`

`reports/canonical/candidates/**` is candidate evidence only. It is not source of truth until a domain-specific promotion writes an accepted artifact under `data/canonical/{domain}/**` and records validation.

## Move Readiness Standard

A data or evidence family is move-ready only when all of the following are true:

- Direct and indirect consumers are inventoried.
- A writer or generation command is known.
- Source-of-truth status is explicit.
- Git tracking policy is explicit.
- Compatibility aliases or reference updates are planned.
- Validation commands cover freshness, manifest, and consumer behavior.

If any item is missing, the family is `not-ready` or `needs-followup`.
