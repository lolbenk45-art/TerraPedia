# Armor typed item-source dispatch

## Status

`closed` — bounded dry-run dispatch and independent validation; commit SHA pending in final response. Parent Armor ingestion remains active.

## Scope

- Armor owner, branch `feat/automation-domain-armor`, same isolated worktree; parent `2026-09-28-armor-source-semantics-continuation.md`. Previous checkpoint `6e016ccd` is committed and clean. Coordinator owns `docs/devlog/current.md`.
- Continue the recorded execution-contract follow-up: distinguish complete table-derived attributes from sparse typed item effects, rederive the typed facts from persisted maint landing bytes, and validate downstream relation/projection independently.
- Source chain: pinned Wiki page/Iteminfo/ArmorSetBonuses -> `armor_item_effects_raw` -> typed `maint_armor_attribute_rows` -> item-owned `armor_item_page` effects -> projection/API DTOs. The source-only executor exists; downstream governed publication and compatible-version coverage remain incomplete.
- No crawler, database mutation, DDL, Redis/control, scheduler/H8, service restart, consumer UI change or historical worktree cleanup. Latest live evidence is the preceding checkpoint's read-only baseline; no new runtime health claim is made by this code-only task.

## Plan and validation

1. Add a strict persisted-maint source reader. Decode embedded bytes, rederive the upstream candidate, require all three real maint IDs and exact landing/row lineage, and return validated source groups without fabricating local landing readbacks. Reject missing/extra rows, inactive sources, wrong item identity/slot and duplicate current versions.
2. Add explicit attribute/effect dispatch. Keep the legacy attribute converter's typed-source rejection. Mixed dry-run inputs produce ordinary attributes plus separately derived typed effects; typed rows never create fake defense/attribute projections. General sync apply must still reject typed sources until a reviewed downstream executor owns publication.
3. Extend the pure independent projection candidate with optional, hashed typed source snapshots. Reconstruct typed expectations from source evidence, independently of producer relation rows; compare complete relation/projection fields. Retain an explicit version/coverage blocker so a typed source does not certify the full item/set corpus.
4. Use RED-first focused tests for source tampering, lineage/owner conflicts, mixed dispatch, lost conditions, additive/multiplier confusion, and relation/consumer parity with wrong source facts. Run affected upstream/transaction, sync, independent/full-chain and existing secondary tests. Review serially with the current model.
5. Record real-source offline evidence separately from actual persistence. Update plan/spec narrowly if dispatch behavior changes, then stage explicit paths, inspect staged whitespace and commit the bounded checkpoint. Complete source coverage, downstream packets, publication and automatic retry/API acceptance remain next gates.

## Important boundary

The registered secondary-projection operation currently owns only
`armor_attribute_cell` effects. This task must not implicitly widen its
authority to `armor_item_page` effects. Recognizing typed evidence in a pure
candidate or dry run grants no write authority.

## Result and evidence

- Added the strict maint-side source reader and an explicit mixed attribute/effect dispatcher. Typed rows generate only source-bound item effects; generic attribute conversion still rejects them. Dry-run loads referenced source landing IDs; general apply rejects before reports/writes.
- Added optional hashed `itemEffectSources` to the pure projection candidate. It independently assembles expected typed fields from rederived sources and real-shaped maint IDs, rejects relation/consumer parity that contradicts those sources, and retains `complete-item-and-set-coverage-unverified`. The existing intent builder refuses this blocker. Existing secondary publication ownership is unchanged and tested closed to typed rows.
- The archived real-source proposal produced three multiply/1.12/multiplier relation and projection candidates in an offline simulation. At2026-09-29T16:59:17.315Z, current maint item identities1546/1547/1548 were read and matched. Source landing/maint IDs in the simulation are explicitly hypothetical; no source/effect persistence is claimed. Report: `.local/tmp/armor-typed-dispatch-20260930-01.report.json`.
- Current spec and parent plan updated for the read-only conversion contract. Durable audit: `docs/audits/2026-09-30-armor-typed-source-dispatch.md`. Coordinator current.md is unchanged.

## Validation and review

- Reader, dispatcher and typed projection expectations had RED cases before implementation. Focused integrated suites passed170/170.
- Final affected regression:590/590 passed, exit0, `.local/logs/armor-typed-regression.log`. Covers maint/source transaction/runner, general sync, canonical candidate/intent/executor/recovery, existing secondary projection, Armor registration and shared manifest.
- Current-model serial review found an item-ID collision gap in supplied snapshots: two different item owners could share a physical maint item ID. A RED case reproduced it; explicit uniqueness verification fixed it. Distinct source groups for the same owners are also rejected. No material implementation finding remains unresolved.
- Reviewed publication boundaries with actual existing intent and secondary builders; both refuse the new incomplete chain. No test substitutes a permissive publication flag for those contracts.
- Staged whitespace, file-scope and referenced-path checks are performed before commit; final result and SHA are reported in the final response. Private simulation artifacts stay under `.local/tmp/`.

## Follow-up

Armor owns complete compatible-version item/set coverage and Mining411 source identity. Then implement an exact downstream typed-effect publication/retirement contract, integrate it with fresh source/runtime baselines and packets, and verify DB/admin/public APIs plus automatic retry/idempotency. General sync and the current secondary executor must not be unguarded as a shortcut. Coordinator retains scheduler/H8 activation. No additional user information or local refresh/restart is required for the next implementation step.
