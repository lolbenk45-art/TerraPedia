# Buff Insert-Only Candidate Refresh

Date: 2026-10-06. Owner: Codex, Buff continuation.

## Scope

This is a read-only rederivation of the deferred Buff insert-only candidate
for IDs `389-400` after the authorized six-Item maint publication. It does not
create a packet, consume a permit, acquire a fence, or write MySQL, Redis,
scheduler state, landing, maint, relation, or projection rows.

## Result

The refreshed artifact is
`.local/tmp/buff-insert-only-candidate-20261006-v2.json` with SHA-256
`sha256:b3b1232a21eabbbaaeb365bc369fd57a7df7d4d3f63b353b9a5e8d6895693af0`.
It remains `status=blocked`, `executable=false`, `applyAllowed=false`, and
`databaseWrites=false`.

The six authorized Item identities are now resolved through the current
`maint_items` snapshot. The candidate proposes 12 maint inserts, 12 relation
Buff inserts, 12 projection Buff inserts, 14 Item-Buff secondary inserts, and
zero NPC-Buff secondary inserts while preserving 2,454 existing relation and
projection rows. Current Buff counts read as
`maint/relation/projection/NPC-secondary/Item-secondary = 388/388/388/1290/0`.

One source-item issue remains: Buff `395` carries page spelling
`FlaskOfVenom` while Iteminfo and `maint_items.source_id=1340` use canonical
`FlaskofVenom`. The current candidate records this as
`source-item-maint-identity-drift`; no alias or payload rewrite is inferred.

## Blocking gates

- IDs `389-400` have no historical baseline; zero-baseline owner and full-chain
  executor authorization are still required.
- Item `1340` spelling drift requires an explicit source disposition.
- 114 NPC immunity facts remain display-only without stable NPC source IDs, so
  no NPC-Buff secondary inserts are proposed.
- Canonical publication still requires a fresh operation packet, locked
  rederivation, real fences, one-use permit, and independent committed
  readback.

## Validation

`node --test pipelines/relation/buff-insert-only-candidate.test.mjs
pipelines/relation/buff-secondary-identity-lineage.test.mjs` passed `7/7`.
Candidate and diagnostic drivers pass `node --check`; the source rederivation
used SELECT-only MySQL reads against `127.0.0.1:13306`. No business-table or
control-plane write occurred.
