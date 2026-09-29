# Armor closure gap audit before further implementation

## Status

`active`

## User steering and scope

- User explicitly requested finding the issues first, then filling the gaps,
  to avoid repeated rework. Pause further production implementation and audit
  the full source -> storage -> publication -> API/UI -> automatic recovery
  chain before revising the execution plan.
- Armor owner, `feat/automation-domain-armor`, starting HEAD `da0f516a`, clean
  isolated worktree. Parent `2026-09-28-armor-source-semantics-continuation.md`.
  Coordinator owns current.md and scheduler/H8; do not edit or activate them.
- Allowed scope for this task: read-only code/source/database checks, local
  diagnostic reproductions, durable findings and a dependency-ordered plan.
  No production fixes, source crawling, business DML, permit consumption,
  service restart or historical worktree cleanup.
- Audit must distinguish confirmed defects, explicit existing guards, missing
  contracts and unverified runtime risks. Test totals and hypothetical source
  IDs cannot substitute for complete Armor acceptance.

## Checks

1. Enumerate source versions, fact owners and full member coverage.
2. Trace all write scopes and the effect of admitting typed sources upstream.
3. Check each API query, DTO and UI consumer for source-kind/condition/value
   preservation and correct conditional/additive/multiplicative aggregation.
4. Trace the scheduler's actual operation, source fingerprint and acknowledgement
   path, and interrupted-commit/retry recovery for the new source operation.
5. Reproduce the concrete failures without patching them, obtain a fresh narrow
   read-only DB inventory, then freeze required contracts, exit criteria and
   regression cases before the next production edit.

## Findings recorded

- F01: the parser drops the first Initialize statement. ArmorSetBonuses rev964993
  rederivation is 64 textKeys/243 nonzero item IDs, while the current parser emits
  63/238; the dropped record is Shroomite and its five IDs.
- F02: 15 stored set combinations are old zero-head/zero-leg forms. The fixed source
  supplies the missing legs for Cobalt, Mythril, Adamantite, Beetle, Spectre and
  Chlorophyte variants. The current 233-member count is not a complete denominator.
- F03: source evidence checks text keys and benefit names but accepts a synthetic
  raw/standardized set composition drift. Complete set arrays and IDs must be bound.
- F04: source versions span 2023/1.4.5.3/1.4.5.7/1.4.5.8; only three Shroomite
  conditional multipliers are currently authoritative. Old generic 15% rows,
  qualified cells, Mining identity and set-owned stealth remain unresolved.
- F05: source-only writes and typed dry-run dispatch have no complete downstream
  owner. General apply intentionally rejects typed rows; this guard must remain until
  a publication/recovery executor exists.
- F06: admin SQL filters only `armor_attribute_cell`; public item effect SQL/DTO drops
  `condition_text`. Fresh public effects for 1546/1547/1548/411 are HTTP 200 with no
  rows, consistent with the DB snapshot.
- F07: original public composable diagnostics lose conditions and add multiplier
  values, reproducing `1.12 + 1.20 = 2.3200000000000003` instead of operation-aware
  semantics. This is synthetic offline execution, not browser evidence.
- F08: scheduler dispatch remains the old `automation-armor-sets-l1` module-only path;
  registration of the source operation is not automatic integration.
- F09: PREPARED/COMMIT_UNKNOWN/COMMITTED_READBACK_REQUIRED states exist without an
  operation-specific recovery/reconciliation entrypoint.

Evidence and read-only reports:

- `docs/audits/2026-09-30-armor-closure-gap-audit.md`
- `docs/audits/2026-09-30-armor-closure-gap-evidence.json`
- `.local/tmp/armor-closure-gap-{db,membership,membership-db,sets-diff,source-binding,ui,public-effects}-20260930-01.*`

The executable order is frozen in
`docs/superpowers/plans/2026-09-30-armor-closure-repair-order.md`. No production
fix, crawler, permit, DML, restart or scheduler activation occurred during the
read-only audit portion above; the Phase 1 parser/evidence fix is recorded below.

## Phase 1 implementation checkpoint

- Added the pure `pipelines/fetch/armor-set-module-parser.mjs` module and moved
  the fetch parser to it. Initialize body tokenization now starts after the
  function declaration, preserving the first `Create`/`Add` statement.
- `buildArmorSetSourceEvidence` now reparses raw module bytes and compares complete
  records (sets, counts, IDs, primary part, text key and benefit) against parsed
  and standardized artifacts. The obsolete Shroomite placeholder was removed.
- TDD evidence: the new parser test first failed with `ERR_MODULE_NOT_FOUND`; the
  source-evidence drift test first failed with a missing expected exception. Both
  pass after the minimal implementation.
- Validation: 14 focused Node tests pass across parser, source evidence, fetch and
  definition-source suites; direct read-only rederivation of rev964993 returns
  64 records and 243 nonzero item IDs. `git diff --check` passes.
- Scope remains code/docs only. No crawler was run, no database or permit was
  touched, and Phase 2 member/set baseline reconstruction is still open.

## Phase 2 preflight finding

- A live `START TRANSACTION READ ONLY` candidate rehearsal against server UUID
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf` could not produce a trusted proposal.
  The current module landing is id=1 with `artifact_role=legacy_compat`, no source
  revision and old page casing; the image landing is id=12437 with
  `artifact_role=legacy_compat`, `parse_status=partial` and no source revision.
  `buildArmorCanonicalMaintCandidate` correctly fails before diffing with
  `Armor landing must retain immutable source_evidence history`.
- This is F10 in the audit. Phase 2 now starts with fresh revision-bound canonical
  landings for both datasets; old compatibility rows must not be relabeled or used
  to authorize member/set repair. Diagnostic output is
  `.local/tmp/armor-phase2-live-maint-dryrun-20260930-01.json`.
- Follow-up review found that the required image bytes are already available: the
  `.a63-20260927-33` cache result contains 419 cached rows with per-file revisions
  and verified readbacks. F11 is therefore a landing-lineage gap, not permission to
  repeat image uploads. Combining that result with the corrected rev964993 module
  artifact in a read-only candidate produced a transition of 2 inserts/1 demotion
  and a maint dry-run of 1 set insert + 63 updates and 244 image inserts + 175
  updates. Artifact: `.local/tmp/armor-phase2-canonical-source-dryrun-20260930-01.json`.
