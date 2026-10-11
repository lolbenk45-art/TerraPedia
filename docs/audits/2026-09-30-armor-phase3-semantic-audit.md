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

## `.a63-20260927-33` completeness check — 2026-09-30 continuation

The retained image-cache result is internally valid (`COMPLETED`, 315 uploaded
files and 419 cached rows, payload SHA
`sha256:238600dd11bc2f94681c12f198b6bcd1ce1bcb52c31475148170d81911a04015`),
but it is not a complete canonical image source for the corrected module:

- module revision `964993` reparses to 64 set keys and 243 positive member IDs;
- the image payload declares `totalArmorSets = 63`, contains 63 set keys and
  419 rows;
- the sole missing key is `ArmorSetBonus.Shroomite`.

The new maint denominator guard rejects this bundle before extraction. The
verified 63-set cache bytes remain reusable evidence, but a fresh revision-bound
image source bundle must add Shroomite coverage and then revalidate the full
64-key denominator. No image upload or database write is authorized by this
finding.

Two local artifacts were checked as possible substitutes and rejected:

- `data/generated/wiki-armor-sets.latest.json` contains two Shroomite image rows,
  but its source revision is `2026-04-04`, its identity is `WikiArmorSet.Shroomite
  armor`, and the merge helper emits that legacy namespace. It cannot satisfy the
  `ArmorSetBonus.Shroomite` module-key and revision-bound image contract.
- Historical item-image lineage bundles contain Shroomite single-piece icon
  evidence. Those rows are item-owned icons, not set-page male/female/part image
  evidence, so they cannot be promoted into `armor_set_images_raw`.

The only valid next source step remains a fresh 64-key image collection with the
existing verified cache bytes reused where their source identity matches.

## Fresh 64-set image proposal and retained-cache contract — 2026-09-30 continuation

The fresh revision-bound image source now has 64 set keys and 431 rows, including
12 new Shroomite rows. The prior completed cache result is reused as 315 verified
file receipts covering 419 compatible rows. Each retained receipt was read back
from the local MinIO object path and its bytes matched the prior receipt hash;
the 12 new source downloads carry their explicit CDN transfer evidence.

The first draft exposed a contract gap: reconstructing the old proposal from
MinIO bytes loses the original CDN transfer proof for optimized files. The cache
operation now uses `armor-image-cache-proposal/v2`, which binds the complete
current source payload, the retained receipt set, and the prior completed result
payload/source lineage; only uncovered assets carry source bytes. The proposal
validator rejects missing or failed history, source metadata drift, receipt URL
drift, and altered historical payloads. Retained objects are read back again
before any new upload.

Read-only artifacts:

- proposal: `reports/authorization/canonical/canonical-armor-image-cache.a64-20260930-02.proposal.json`
- execution manifest: `reports/authorization/canonical/canonical-armor-image-cache.a64-20260930-02.manifest.json`
- authorization request: `reports/authorization/canonical/canonical-armor-image-cache.a64-20260930-02.request.json`
- proposal SHA: `sha256:8f2d76c5790c8d5f46b1db21f9a465aa14d506a4fd3868426f771a0781add6af`
- request SHA: `sha256:a9f5a572e5189e2ed7298dd217210bc28b386d760a21e50f17f661c0a083b685`

Validation: cache contract tests pass `37/37`; combined cache runner,
registration and manifest tests pass `111/111`; the real proposal revalidates as
`64 sets / 431 rows / 315 retained files / 12 new assets`. The request remains
`AWAITING_OWNER`. No MinIO upload, database write, landing/import, permit
consumption, Redis mutation, scheduler activation, API readback, or browser check
was performed.
