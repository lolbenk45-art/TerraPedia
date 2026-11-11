# Buff Variant Empty-Scope Evidence Design

## Goal

Resolve shared-page NPC scope gaps only when a target variant's own
revision-bound infobox proves an exhaustive empty `debuff*` group, while
preserving the active baseline for every ambiguous or incomplete target.

## Scope

In scope:

- a pure evidence builder over the existing revision-bound NPC raw-page
  capture;
- stable NPC identity, page/revision, raw-byte hash, and infobox-field
  completeness checks;
- contract integration that emits `variant-owned-complete-empty` only for
  independently complete evidence;
- focused regression tests and a read-only evidence report.

Out of scope:

- scheduler activation or control-plane changes;
- landing, maint, relation, projection, import, or database writes;
- changing the 389-400 missing-baseline rule;
- copying a positive fact from another NPC variant;
- treating a missing page or parser failure as an empty group.

## Evidence Contract

Each empty-scope row must bind:

1. the requested stable NPC ID and `internalName`;
2. the exact requested/resolved page title, page ID, revision ID and timestamp;
3. the raw page byte hash and the source capture hash;
4. the target infobox selected by `auto=<id>` with a complete parsed field map;
5. an explicit `debuffFieldNames=[]` result after parsing all infobox fields;
6. the page-wide positive facts, retained as diagnostics and never assigned to
   the target row.

The builder fails closed for missing/ambiguous target infoboxes, unclosed or
unparsed blocks, revision/hash drift, duplicate target identities, or any
target `debuff*` field. The existing variant contract then consumes these rows
as `variant-owned-complete-empty`; all other rows remain `unknown` with
`preserveBaseline=true`.

## Validation

- RED tests prove missing identity, hash drift, duplicate rows, incomplete
  fields, and target debuff fields are rejected.
- GREEN tests prove a complete empty row is accepted and other-variant
  positive facts remain diagnostics.
- Replay the 68 retained gaps and verify counts, hashes, no-write flags, and
  the unchanged 389-400 missing-baseline fence.
- Run focused Buff/NPC/parser/relation tests, Node syntax checks, and
  `git diff --check`.
