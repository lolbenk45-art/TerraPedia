# Armor versioned item-source adapter

## Status

`closed`

## Scope and contract

- Owner: Armor agent, branch `feat/automation-domain-armor`, worktree `.worktrees/automation-domain-armor`.
- Parent: `2026-09-28-armor-source-semantics-continuation.md`; follows completed guard checkpoint `1935d6b7`.
- User authorized continuation of versioned source admission in `docs/superpowers/plans/2026-09-29-armor-specialized-damage-semantics.md`.
- Deliverable: pure source adapter deriving three Shroomite headpiece damage facts from exact raw bytes/page revisions, pinned Iteminfo identities and set variants; typed no-write candidate plus existing projection-model verification. Original attribute source is never an input to patch and is never changed.
- The legacy semantic-repair source/proposal accepts a single attribute-table landing. A current item-page fact cannot inherit its2023 lineage. The new source candidate has its own schema, `executable=false`, explicit missing-upstream-lineage/full-coverage blockers, and is not accepted by that writer. No weakening of the existing strict producer/projection gates.
- No crawler import with side effects: `fetch-wiki-armorsetbonuses.mjs` executes a fetch on import. Use a narrow validated Shroomite statement from raw bytes, not that executable module. Reuse the pure Iteminfo payload decoder.
- Runtime preflight2026-09-29 23:21 CST: authenticated request timed out after login. No publication, control/DB/Redis write or service restart.

## Execution plan

1. Add `pipelines/relation/armor-shroomite-source-candidate.test.mjs`: exact three owners/conditions and1.12 multipliers; preserved source/version evidence; no equipped-total/stealth effects; bytes/revision/timestamp mismatch; wrong Iteminfo owner/slot; missing/duplicate variant; missing scope/multiplication/version quote; unsupported target version; candidate tampering; unchanged inputs and legacy writer rejection. Verify RED before implementation.
2. Add `pipelines/relation/armor-shroomite-source-candidate.mjs`: `buildArmorShroomiteSourceCandidate({page,iteminfo,armorSets,targetGameVersion})`, where each source is `{bytes, expected:{sha256,pageTitle,pageId,revisionId,revisionTimestamp}}`. Hash bytes, validate metadata, derive facts only from reviewed current sections, validate exact identities/variants, and preserve quotations in rawJson. Accept only the explicitly evidenced Desktop1.4.5.8 target; do not infer broad version intervals from history.
3. Derive candidate projection rows with existing `buildProjectionPayload`; verify owner, multiplier, unit and condition survive. `assertArmorShroomiteSourceCandidate({candidate,source})` rederives and compares the whole candidate so a modified field or self-declared executable flag cannot be admitted.
4. Run focused tests GREEN and affected producer/projection/semantic/secondary suites; run the adapter on the three preserved real artifacts with manifest binding and produce a fresh immutable local candidate. Confirm exactly3 damage facts and explicit upstream/coverage blockers; no legacy source substitution.
5. Self-review, record actual results, close this bounded adapter checkpoint and commit explicit paths. Coordinator owns current.md; retain branch for upstream integration.

## Remaining full-chain work

- Register a versioned item-source landing/maint ownership contract and bind actual IDs before these facts can become published relation rows. Current candidate null upstream IDs are deliberate unresolved lineage, not generated identities.
- Reconcile complete per-item and set-source coverage at compatible game versions, including the other Shroomite piece stats and stealth changes. Then integrate source rederivation with the reviewed canonical proposal/executor and independent projection acceptance.
- Fresh runtime preflight, governed publication, DB/admin/public condition display and automatic-run acceptance remain required. No percentage-complete claim is supported by this adapter alone.

## Spec impact

None: no runtime source ownership, schema, default command, application boundary or lifecycle changes. This is a non-executable source-candidate adapter.

## Results and review

- Implemented both pure build and rederivation APIs. The three actual artifact/manifest bindings produced exactly3 item damage facts and3 provisional projection rows, preserving each multiplier and applicability condition. Final source candidate file hash: `sha256:01c1a0a2a8644f6e8b47957d968e1b1111edd6035862575cf62d80f76ac76d94`.
- Initial RED detected the missing new adapter. Subsequent review RED explicitly reproduced comment-only source acceptance, provisional database IDs and property-order-dependent record identity. Fixed those defects;36 adapter cases and221 affected regression cases pass, zero failures. Syntax and `git diff --check` pass.
- Candidate rederivation rejects every modified semantic field and claimed authority flag; source/manifest mismatch is rejected before generation. Original sources remain byte-identical. The legacy writer rejects the new candidate schema.
- Manual contract review: the adapter recognizes only the reviewed source grammar and explicit1.4.5.8 target. No general Wiki/Lua interpretation or arbitrary version extrapolation. Unrecognized source structure requires a reviewed parser/test change. Iteminfo and set modules are used only for identity/membership, not old effect values.
- Material follow-up is recorded, not silently bypassed: no item-page landing/maint ownership, no complete same-version item/set coverage, no runtime or consumer acceptance. Version metadata remains in source evidence; the projection DTO has no separate game-version field.
- Evidence: `docs/audits/2026-09-29-armor-versioned-source-adapter.md`; immutable local candidate `.local/tmp/armor-shroomite-candidate-20260929-01.json`; logs `.local/logs/armor-versioned-source-*.log`.
- No critical/important issue remains for this non-executable adapter checkpoint. Existing qualified-cell and specialized-note guards are unchanged.

## Commit and handoff

- `commit SHA pending in final response`.
- Coordinator owns current.md; this child and the linked plan carry the new checkpoint for integration. Prior closed marker1935d6b7 is already committed; older ready-for-commit markers are historical and remain coordinator reconciliation work.
- Keep the branch and worktree for upstream contract implementation. No push, source collection, database/Redis/control writes, permit consumption, scheduler activation or service restart occurred.
