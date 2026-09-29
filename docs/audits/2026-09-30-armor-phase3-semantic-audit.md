# Armor Phase 3 semantic guard audit

## Scope and verdict

This checkpoint audits the Shroomite portion of Phase 3 before any landing,
maint, relation, projection, API, or scheduler write. The candidate remains
non-executable and blocked on upstream lineage and complete Armor coverage.

The source tuple is frozen to the preserved artifacts used by the current
candidate:

| Source role | Page revision |
| --- | ---: |
| `Shroomite armor` item damage semantics | `1027106` |
| `Module:Iteminfo/data` item identity/slot | `1023241` |
| `Module:ArmorSetBonuses` membership/set ownership | `964993` |

An artifact can still be byte and metadata bound while belonging to a mixed
tuple. The candidate now rejects that state before producing effects.

## Findings and repairs

1. Mixed source revisions were accepted when each artifact independently matched
   its own expected hash and metadata. The candidate now emits an explicit
   `armor-source-version-manifest/v1` and rejects revisions outside the frozen
   tuple.
2. The module's `player.shroomiteStealth = true;` evidence was not required and
   could not be represented as a source-owned effect. The candidate now requires
   that exact evidence and emits one unresolved `armor_set` `set_flag` effect;
   it never adds stealth to the three item effects.
3. A historical generic Shroomite `rangedDamage=15%` maint row could be parsed as
   a current additive item effect when its specialized note was absent. The
   relation producer now rejects that row as non-authoritative.
4. A duplicate Shroomite stealth function could be hidden behind a first-match
   parser. The source candidate now requires exactly one set-owned stealth
   definition.

The existing exact parser behavior already rejects qualified `>15%` and `>20%`
cells; those values remain diagnostics/blockers and are never converted to
numeric facts.

## Evidence and validation

- RED tests reproduced mixed-revision acceptance, missing stealth evidence, and
  generic historical 15% acceptance before the repairs.
- Focused source and typed-dispatch tests pass `46/46`.
- Combined Armor upstream/maint/relation/projection regression passes `365/365`.
- The preserved real source artifacts rederive to three item multipliers and one
  set-owned stealth flag, with the same frozen revision IDs.
- `node --check` passes for both modified production modules and
  `git diff --check` passes.

## Remaining blockers

- The frozen tuple covers the reviewed Shroomite source candidate only. The
  complete Armor manifest still needs same-version item attributes, Mining
  Helmet/Pants identity, all 243 module members, and image revisions.
- Set-owned stealth has candidate evidence but no downstream maint/relation
  publication owner yet.
- No database write, source landing, image upload, scheduler activation, API
  readback, or browser check was performed in this checkpoint.

See `docs/superpowers/plans/2026-09-30-armor-closure-repair-order.md` Phase 3
and later phases for the dependent execution order.

## Canonical image denominator guard — 2026-09-30 continuation

The maint candidate previously checked that every image row belonged to a module
text key, but it did not bind the image payload's `totalArmorSets` denominator to
the module payload's set count. A 64-set module paired with a 63-set image
payload could therefore reach a proposal with one set's images missing. The
candidate now rejects that graph before extraction with an explicit denominator
mismatch error. This preserves the existing source-image removal behavior: a
missing individual image remains a retained historical row/removal-review case;
only a producer-level set denominator mismatch is rejected as incomplete source
evidence.

The canonical maint, relation, projection and full-chain fixtures now carry the
producer denominator, and the second-module fixture supplies matching image
evidence. A worktree-sensitive fallback resolver assertion in the Armor audit
suite now uses the repository-root helper, so it validates the actual worktree
contract rather than a retired shared-root path.

Validation for this continuation:

- `node --test pipelines/maint/armor-canonical-maint-candidate.test.mjs pipelines/relation/armor-canonical-relation-candidate.test.mjs pipelines/relation/armor-canonical-projection-candidate.test.mjs pipelines/relation/armor-canonical-full-chain-intent.test.mjs`: 256/256.
- All Armor-labelled pipeline tests under `pipelines/`: 726/726.
- `git diff --check`: passed.

This remains a proposal-stage guard. The 64-set/243-member canonical landing,
typed set-effect owner, downstream API/UI publication, and automatic recovery
chain are still unresolved; no database or image mutation was performed.
