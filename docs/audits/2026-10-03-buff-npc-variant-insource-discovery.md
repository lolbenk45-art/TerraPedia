# Buff NPC Variant Insource Discovery — 2026-10-03

## Scope and Boundary

This is a read-only, bounded MediaWiki API discovery for the 68 unresolved
NPC-page infliction scope gaps in
`.local/tmp/buff-npc-infliction-scope-gap-classification-20261003-v2.json`.
It did not run landing, maint, relation, projection, packet, permit, scheduler,
Redis-control, standardized-data, or database writes.

Input SHA-256:

`sha256:0c5cb51838426d626e9312ee352fb571c21983212a43ab5cf2b3108cb104d9b5`

The discovery artifact is
`.local/tmp/buff-npc-variant-insource-discovery-20261003-v1.json` with
SHA-256:

`sha256:229dc8c6c639d2f13765d45ab7b348d3dcc3ce8472ea29703c529bc9cf7cdfd7`

## Method

Each stable NPC ID was queried separately with the bounded search expression:

`insource:"npc infobox" insource:"auto=<id>"`

Search hits were then fetched through `prop=revisions` with the latest returned
revision identity and parsed with the maintained NPC parser. A result counted as
variant-owned evidence only when the infliction row's `sourceInfobox.autoId`
matched the requested stable NPC ID. Display-name matching, shared-page rows,
language subpages, and unrelated item/history hits were not promoted.

## Result

- 68/68 gap IDs returned at least one search hit.
- The hits reduced to 28 unique revision-bound pages.
- 68/68 IDs had a revision-bound NPC infobox with the requested `auto` value.
- 0/68 IDs had a variant-owned `debuff`/infliction fact.
- Variant-owned fact count: `0`.
- Every inspected target row is therefore still a shared-page scope gap; the
  page's other infoboxes may carry positive facts for a different stable NPC ID.

The discovery confirms that the Wiki API can locate and freeze shared page
source, but it does not expose an independent structured infliction relation for
these variants. It also does not prove that the absent `debuff` row means an
empty inflicting-NPC set. The 68 groups remain `unknown` and must preserve the
active relation baseline until variant-owned evidence or an independently
reviewed complete negative-scope contract is available.

## Structured-source probe

The follow-up probe artifact
`.local/tmp/buff-npc-structured-source-probe-20261003-v1.json` has SHA-256
`sha256:81f4ea9e514ccbaaf6839d2fcc8d3fde189ffbc7185e9ee64cb6fa9dac8e04e9`.
Revision-bound results were:

- `NPC_ID` is a legacy redirect (revision `515466`).
- `NPCs` is a current table page (revision `1030318`) but exposes no stable
  NPC-to-`debuff`/`inflicts` relation column; its matching text is general NPC
  prose and equipment descriptions.
- `Module:Npcinfo/data` (revision `1022313`) and
  `Module:Npcinfo/datagen` (revision `1022307`) expose `buffImmune` and
  all-buff immunity semantics, not NPC-owned infliction facts.
- `Template:NPC infobox` is not a registered page in the API response, and the
  Cargo schema independently has no `NPC infobox` table or NPC `debuff` field.

This closes the cheap structured-API discovery branch. It does not change the
source disposition: variant-owned infliction evidence or a separately reviewed
complete negative-scope source is still required before replacement or empty
classification.

## Runtime and Validation

The temporary Buff backend and Nuxt sessions from the preceding preflight were
stopped before this discovery. Ports `18102`, `18104`, `5190`, and `3017` are
clear afterward. Read-only runtime checks returned Redis DB14 `PONG`, 230
historical V2 attempt records all in terminal states (`145 completed`, `81
failed`, `4 timed_out`) with no lease keys, and MySQL
`run_attempt/reservation/active-fence = 0/0/0`. The focused Buff/NPC/parser/
relation regression passed `200/200`; all touched modules passed `node --check`
and `git diff --check` passed. No database or Redis mutation occurred. The
active branch remains `feat/automation-domain-buff` with the existing dirty
source/test/audit changes preserved.
