# Armor specialized damage semantics implementation plan

> **For agentic workers:** Execute serially using the existing Armor worktree and the executing-plans review checkpoints. Track completion below; continuation is already authorized.

**Goal:** Prevent Shroomite's weapon-specific multiplicative bonus from becoming an unconditional additive ranged bonus, and record the concrete remaining path to Armor ingestion acceptance.

**Architecture:** Retain the strict numeric cell parser. Reject recognized specialized ranged-damage notes in both the relation producer and independent projection rederivation, even when the numeric cell is exact. Keep summary columns diagnostic-only; they never create effects. This bounded repair does not resolve versioned source admission or publish data.

**Tech stack:** Node ESM, node:test, existing Armor maint/relation/projection contracts.

## Evidence and boundaries

- Preserved source: `.local/tmp/a63-20260929-armor-source-01/raw/shroomite-headgear.json`, page4771/revision1027106, `2026-09-02T13:55:25Z`.
- Direct Notes and History establish multiplication after other bonuses, specialized weapon/ammunition scope, and the Desktop1.4.5.0 change from15% to12%. The 2023 attribute table cannot silently inherit those current values.
- Existing `operation=multiply`, `unit=multiplier`, `condition_text` and API DTO fields can carry the eventual typed effect. Attribute-cell producers currently emit only `add`; no versioned item-source adapter exists here.
- No crawler, database/Redis mutation, service restart, permit, scheduler/H8 change, DDL, local.items write, historical source overwrite or coordinator index edit.

## Task 1 — reproduce the semantic admission gap

Files: `pipelines/relation/sync-maint-to-relation.test.mjs`, `pipelines/relation/armor-canonical-projection-candidate.test.mjs`.

- [x] Add producer rejection cases for all three notes with exact `12%` and `15%` cells:

```js
assert.throws(() => buildArmorAttributeEffectRows([{
  itemId: 1546, recordKey: 'head',
  rawCellsJson: JSON.stringify({ rangedDamage: '12%', otherBonus: '额外弓伤害' }),
}]), /specialized damage semantics/);
```

- [x] In the projection fixture, first generate a valid generic `rangedDamage: '12%'` effect, then attach each specialized note to both dependency and consumer attributes; assert `build(input)` rejects it independently. This catches a parity-perfect but semantically wrong effect.
- [x] Add diagnostic cases for the three `>15%` effect cells and three `>20%` summary cells; assert exact cells/roles/raw values. Add positive controls for ordinary ranged damage with an unrelated visual note and summary-only values.
- [x] Run `node --test pipelines/relation/sync-maint-to-relation.test.mjs pipelines/relation/armor-canonical-projection-candidate.test.mjs`; confirm new assertions fail for missing rejection/diagnostics.

## Task 2 — enforce the narrow source contract

Files: `pipelines/relation/sync-maint-to-relation.mjs`, `pipelines/relation/armor-canonical-projection-candidate.mjs`.

- [x] After exact numeric validation and before producing a nonzero ranged-damage effect, reject the observed specialized source notes:

```js
if (cellKey === 'rangedDamage' && value != null && value !== 0
    && /额外(?:弓|枪|其他远程)伤害/.test(String(rawCells.otherBonus ?? ''))) {
  throw new Error('Armor effect cell rangedDamage has unresolved specialized damage semantics');
}
```

- [x] Implement the same invariant independently in `expectedItemEffects` using its `raw` cells. Do not replace independent rederivation with producer output.
- [x] Extend diagnostics to the three damage+crit summary columns, tagging only these `cellRole: 'summary'`. Report exact specialized cells with `reason: 'specialized-damage-semantics-unresolved'` and original `sourceContext`; preserve existing numeric-diagnostic fields.
- [x] Run the two focused suites green, then fetch/utils/relation-candidate regression and `git diff --check`.

## Task 3 — record source correction and checkpoint

Files: `docs/devlog/entries/2026-09-29-armor-specialized-damage-semantics.md`, this plan, `docs/audits/2026-09-29-armor-shroomite-source-semantics.md`.

- [x] Recompute raw hash against the preserved manifest; record exact quotations, item identities, version boundaries and distinction between piece effects, equipped totals and conditional stealth effects.
- [x] Run diagnostics against all230 preserved parsed rows. Expected: three qualified effect cells plus three qualified summary cells; no candidate/publication claim.
- [x] Review changed code and stage explicit paths only. Commit a focused checkpoint and retain the worktree for the next task.

## Checkpoint review

- Completed implementation tasks passed273/273 targeted tests;11 RED failures were reproduced before the fix.
- Full-source diagnostics:230 rows,3 qualified effect cells and3 qualified summary cells.
- No critical/important defects remain in the bounded guard change. The main ingestion goal remains open: source admission, publication and consumer/automation gates below are not satisfied.
- Fresh runtime check at2026-09-29 23:16 CST: login succeeded on retry, authenticated preflight timed out. TCP18102/13306/6380 reachable; scheduler/DB/Redis health is not established. No service restart or control change attempted.

## Remaining Armor closure milestones (not satisfied by Tasks1–3)

1. **Versioned source admission:** use the pinned current Shroomite page together with pinned Iteminfo/ArmorSetBonuses identities. Implement a separate item-source adapter carrying original quotation, revision/hash, game-version applicability, item owner, `multiply/1.12/multiplier`, and exact weapon/ammunition condition. Preserve the old table unmodified. Reject a current override presented as a 2023 cell correction; never exclude the affected rows to make the candidate pass. Add tests for mismatched revision, wrong owner, missing condition and mixed-version replacement before implementing the adapter.
2. **Complete source candidate:** extend `build-armor-semantic-repair-proposal.mjs` and its source contract to consume that adapter only after source rederivation. Bind the Mining identity correction, all selected-member attributes and set-owned textKey/variant evidence. Full-set13/25/20/12 totals must not create extra set effects; stealth belongs to the set. Missing source facts remain named blockers. Require complete lineage and zero unresolved source/effect blockers before generating a packet.
3. **Governed publication:** refresh authenticated runtime/DB/Redis preflight; lock the actual landing, maint, relation and projection baselines. Create a fresh reviewed registered-operation packet and one-time decision. Retire the incorrect generic effects through the executor, preserve their history, and verify transaction readback. Prior counts/IDs are historical evidence, never current authority.
4. **Consumer and automation acceptance:** compare DB to authenticated admin/public item and armor-set APIs, including1546/1547/1548/411. Verify specialized conditions and multipliers reach consumers, no duplicate equipped totals, no stale generic15% row, and all required members are covered. Validate the automatic ingestion/retry/idempotency path separately; scheduler/H8 activation stays with the coordinator. A unit-test checkpoint is not full ingestion acceptance.

If an adapter or candidate exposes another gap, add a reproducing case and repair the affected milestone before publication. Preserve the user's Armor closure objective.

## Versioned adapter checkpoint

The standalone item-source adapter is implemented and has produced three real
source-bound multiplier candidates. See
`docs/audits/2026-09-29-armor-versioned-source-adapter.md` and
`docs/devlog/entries/2026-09-29-armor-versioned-item-source-adapter.md`.
Milestone1's adapter is complete; admission into persisted landing/maint and
milestones2–4 remain open. The existing single-table repair proposal cannot
truthfully own these item-page facts, so upstream ownership must be established
before wiring them into a writable proposal. Do not disguise that missing
contract as an override of the2023 source cells.

## Upstream candidate checkpoint

The no-DDL proposal now has separate local/maint landing copies and three typed
maint rows, with exact readback binding and explicit legacy-conversion rejection.
See `docs/audits/2026-09-29-armor-item-effect-upstream-contract.md` and
`docs/devlog/entries/2026-09-29-armor-item-effect-upstream-contract.md`.
This advances the upstream candidate contract only: the real baseline, registered
executor/dispatch, full coverage, packet, publication and consumer/automation
acceptance are still required. The offline empty baseline is hypothetical.

## Registered source transaction checkpoint

The separate source-only runner and registered authorization contract are now
implemented; actual read-only preparation confirms a0/0/0 namespace baseline
and1/1/3 planned landing/maint inserts.450/450 affected tests pass. See
`docs/audits/2026-09-30-armor-item-source-execution-contract.md` and
`docs/devlog/entries/2026-09-30-armor-item-source-transaction.md` for the exact
artifact hashes, query-plan repair and validation scope. No live source write,
packet/permit, relation publication or consumer acceptance occurred.

Next, Armor must add reviewed typed-source dispatch and independent relation/
projection validation, then finish compatible-version item/set coverage and
Mining identity repair. Only after those admission gates should fresh packets
publish the source and downstream facts serially. Milestones2–4 remain open;
the four concrete next gates are listed in the execution-contract audit.

## Typed-source dispatch checkpoint

Dry-run maint-to-relation dispatch and independent projection expectations now
recognize typed item sources, rederive their original evidence and preserve
all three specialized conditions.590/590 affected tests pass. The real-source
offline simulation uses explicitly hypothetical source IDs plus current item
identity readback; it is not proof of persisted effects. See
`docs/audits/2026-09-30-armor-typed-source-dispatch.md` and
`docs/devlog/entries/2026-09-30-armor-typed-source-dispatch.md`.

The complete-version-coverage blocker remains mandatory, and existing general
sync/secondary publication still reject typed sources. Next resolve the
complete per-item/set evidence and Mining identity, then register the exact
downstream publication/retirement contract. Milestones2–4 remain open.
