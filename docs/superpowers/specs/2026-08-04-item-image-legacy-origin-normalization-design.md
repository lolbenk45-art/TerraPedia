# Item Image Legacy-Origin Normalization Design

## Goal

Repair the 331 item image records that still store the historical
`http://localhost:9000/terrapedia-images/items/...` origin, while preserving the
canonical bucket/object path form and refusing uploads or partial writes.

## Boundary

This is an extension of the governed `canonical-image-sync` items lane. The
repair may issue read-only HEAD probes against the configured MinIO origin and
may atomically update `data/standardized/items.standardized.json` only. It does
not upload objects, fetch wiki sources, write any database layer, run a
crawler, flip a source contract, or start/stop services.

## Contract

- The manifest freezes `--legacy-origin-repair=true`, the exact legacy origin
  `http://localhost:9000`, the configured probe origin, and expected candidate
  count `331` alongside the current standardized/promotion evidence.
- Candidates are exactly item records whose `imageUrl` is an absolute URL at
  the legacy origin and whose path is under `/terrapedia-images/items/`.
- The run validates the complete candidate set before consuming its dispatch
  permit and before the first HEAD probe.
- Each candidate is probed at the configured current origin with the same path.
  A successful probe stages the origin-free path
  `/terrapedia-images/items/...` in memory.
- Every probe must succeed. Any failure publishes failed report/progress
  evidence and leaves the standardized file byte-identical.
- On full success, one atomic write updates only the 331 `imageUrl` fields;
  `uploaded=0`, `normalized=331`, and no other record field changes.

## Verification

Tests must prove exact candidate selection/count, no uploader or wiki resolver
use, all-or-nothing standardized writes, successful path normalization, and
manifest argument binding. Existing progress and formal authorization gates
remain in force.
