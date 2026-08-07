# Buff T1 Isolated Acceptance Design

## Goal

Prove a bounded offline Buff import, maint, relation, projection, consumer
readback, transaction, and cleanup chain without writing formal databases or
running a crawler.

## Fixed Fixture

The fixture contains exactly two records copied from
`data/standardized/buffs.standardized.json`:

- `ShadowFlame` (`source_id=153`): four source items, one inflicting NPC
  (`Clothier`), and the complete 30-row `immuneNpcs` payload.
- `Venom` (`source_id=70`): seven source items, three inflicting NPC source
  facts, and the complete 26-row `immuneNpcs` payload. The reviewed
  `SandPoacher -> DesertScorpionWalk` alias must resolve through the existing
  relation processor rather than fixture rewriting.

The fixture is local and immutable for the acceptance. No Wiki request,
backend image request, or missing-fact completion is allowed.

## Source Chain

```text
offline fixture
  -> isolated local.buffs + local.buff_source_items
  -> buffs_raw landing payload
  -> isolated maint.maint_buffs
  -> relation_buffs + item_buff_relations + npc_buff_relations
  -> projection_buffs
  -> projection readback using the backend Buff consumer column contract
```

The executor reuses `importBuffs`, `runMaintSync`, and the Buff scope of
`runSync`. It copies only the fixture's eleven formal item dependencies and
the four canonical inflicting-NPC targets into the isolated databases. Formal
local/maint/relation databases are read-only sources.

## Exact Pass Contract

- two Buff imports, two maint Buff rows, two relation Buff rows, and two
  projection Buff rows;
- eleven exact item-Buff relations;
- four exact inflicting NPC-Buff relations after the reviewed alias resolves;
- no immune-NPC relation is invented from the Buff-page list;
- `sourceItems`, `inflictingNpcs`, `immuneNpcs`, and `sourceEvidence` read back
  from each projection row match the fixture contract;
- `immuneNpcs` lengths are exactly 30 and 26, with full ordered payload
  equality rather than count-only comparison;
- unresolved entity facts, unexpected relation rows, duplicate rows, missing
  dependencies, and accidental non-entity coercion fail closed;
- formal snapshot verification, three-role transaction probes, evidence
  publication, built-in cleanup, and independent cleanup readback pass.

## Consumer Readback

The production Buff consumers hard-code `terria_v1_relation.projection_buffs`.
The acceptance must not redirect a live API process to an ephemeral database.
Instead it performs a direct read-only query against the isolated
`projection_buffs` using the exact columns consumed by `PublicBuffServiceImpl`
and `AdminBuffController`, then runs their focused tests to verify JSON mapping.
This proves the isolated row contract without changing formal runtime config.

## Authorization And Isolation

- operation ID: `canonical-buff-t1-acceptance`;
- one fresh current-hash ADMIN manifest, request, owner input, packet, and
  one-time dispatch permit;
- run-derived local/maint/relation databases and temporary least-privilege
  accounts;
- Redis DB 7 only if a fresh preflight proves it empty; otherwise amend the
  plan to another empty logical DB without clearing existing state;
- local fixture only, `networkAccess=false`, `databaseWrites=false`, and
  `isolatedResourceWrites=true`;
- no formal apply, crawler, V1 queue, scheduler, push, merge, or worktree
  cleanup.

## Validation

Use TDD for the fixture, executor, exact-count gates, payload equality,
operation manifest, authorization, and live routing. Before authorization run
the expanded Node suite, focused backend Buff tests, `git diff --check`, and an
independent zero-resource preflight. After the one-time run, independently
verify databases, accounts, transactions, Redis keys, processes, and dispatch
permits are zero before committing the tracked evidence report.
