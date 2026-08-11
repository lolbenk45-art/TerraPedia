# Crawler V2 Automation Controls Design

## Goal

Expose usable V2 automation controls in the crawler monitor, with a bounded
items-domain fixture acceptance path that reads real tracked input without
starting a real crawler or writing a database.

## Decisions

- V2 automation has its own config and sweep record below
  `reports/crawler-monitor/v2/`; V1 auto-dispatch files and endpoints remain
  legacy-only history.
- A disabled manual scan may run source-update detection but cannot enqueue
  crawler attempts. Enabling V2 automation permits changed eligible sources to
  enqueue through the V2 service, retaining its dedupe, deadline, and exact
  attempt identity guarantees.
- Changed-only automation covers items, NPCs, projectiles, armor sets, and
  buffs. Biomes remains manual because its safe preview does not advance the
  ingestion manifest and would otherwise repeat each interval.
- The system drawer has a stable desktop width and full viewport height. The
  controls are fixed while diagnostic and report lists scroll independently.
- The acceptance fixture reads a small metadata sample from the tracked items
  source, writes only its isolated V2 attempt artifacts, and has no network or
  database access.

## Out Of Scope

- Enabling automation in the current local runtime.
- A recurring external scheduler process, database apply actions, or a real
  wiki fetch as part of acceptance.
