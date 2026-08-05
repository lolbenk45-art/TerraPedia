# NPC T2 And Source Contract Cutover Design

## Goal

Complete the remaining automated-ingestion closure by producing an
authorization-bound, read-only NPC `T2_CUTOVER_VERIFIED` result and using fresh
passing readiness evidence to promote the remaining canonical source contracts.

## Current State

- Item-group readiness already passes with `T2_CUTOVER_VERIFIED`.
- NPC owner phases, both base-maint partitions, T1 isolation, formal database
  snapshots, and API evidence exist, but the current NPC report remains
  `T1_VERIFIED` and has no cutover identity.
- The source contract registry still declares three item-group compatibility
  inputs and `data/standardized/npcs.standardized.json` as `b1_migrating`.
- The retired NPC bridge remains absent and must stay `retired`.
- Domain acceptance is `45 pass / 0 warning / 0 blocked`; the full quality gate
  passes. No scheduler daemon or crawler run is active.

## Chosen Approach

Add one governed read-only operation,
`canonical-npc-t2-cutover-verification`, then perform a repository source
contract promotion only from its fresh passing output.

The operation is an evidence boundary, not a data migration. It must not write
business data, consume a crawler permit, start services, upload assets, or alter
automation policy. Its only durable runtime output is private immutable JSON
evidence under a decision-derived authorization attempt directory, followed by
the maintained NPC readiness report after successful verification.

## Authorization Contract

The ADMIN request and execution manifest bind:

- operation ID and one-time decision identity;
- actor, reason, authorization reference, issue time, and expiry;
- current repository code bundle;
- canonical NPC apply input and reconstructed owner-phase completion;
- reconstructed two-part base-maint completion;
- T1 acceptance evidence;
- formal local/maint/relation database identities;
- expected backend API base and read-only endpoint set;
- exact proposal/result paths and no-write declaration.

The decision is consumed once. A failed attempt is retained as historical
evidence and cannot be reused or overwritten.

## Verification Flow

1. Validate the ADMIN packet and current code/data hashes before opening a
   database connection.
2. Reconstruct owner-phase and base-maint completions from their immutable
   result files; reject missing, duplicate, stale, or mismatched predecessors.
3. Open read-only transactions against the exact formal database triplet and
   rebuild landing, maint, relation, local, and runtime snapshot hashes.
4. Probe only the maintained admin/public NPC GET surfaces and bind their
   returned identities to the local snapshot.
5. Revalidate the T1 rollback, restore, cleanup, and source artifact evidence.
6. Build a deterministic cutover identity containing the decision identity,
   packet hash, run ID, input hash, owner completion hash, base completion hash,
   database snapshot hash, API evidence hash, and verification timestamp.
7. Emit `T2_CUTOVER_VERIFIED` only if every prerequisite passes. Any mismatch
   produces a failed terminal result and leaves the maintained readiness report
   unchanged.

## Source Contract Promotion

After the T2 result is independently read back and the maintained readiness
reports are fresh, promote exactly these rows in
`docs/audits/canonical-migration-boundary.md`:

- `data/generated/recipe-material-reference.json`
- `data/generated/recipe-group-overrides.json`
- `data/generated/item-group-overrides.json`
- `data/standardized/npcs.standardized.json`

The three item-group inputs reference
`reports/canonical-migration/canonical-item-group-readiness.json`. The NPC input
references
`reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`.
Canonical rows have no migration deadline. The retired bridge row is unchanged.

The source flip is a repository contract change, not database DML. It is
committed only after the registry passes for every affected domain with reports
younger than the existing 24-hour canonical evidence limit.

## Failure Handling

- Authorization, code, predecessor, database, or API drift fails before T2
  publication.
- Read-only transaction or API failure creates terminal attempt evidence but
  does not modify the current readiness report.
- A stale or non-passing readiness report blocks the source contract commit.
- A failed source-registry or repository gate reverts no runtime data; the
  contract edit remains uncommitted until repaired and revalidated.
- No prior decision identity, packet, failed attempt, or report bytes are
  overwritten.

## Validation

- RED/GREEN unit contracts for packet binding, predecessor reconstruction,
  read-only enforcement, deterministic cutover identity, and fail-closed report
  publication.
- NPC readiness tests requiring the exact formal T2 identity.
- Canonical source registry tests for all four promoted rows and the unchanged
  retired bridge.
- Fresh authorized read-only T2 execution and independent result readback.
- NPC readiness, domain acceptance, and cross-database quick audit.
- Full `scripts/dev/quality-gate.sh` with explicit isolated E2E credentials.
- `git diff --check`, explicit staged-path review, and focused commits.

## Commit Boundaries

1. T2 verifier, authorization manifest support, and tests.
2. Fresh T2 runtime evidence and maintained NPC readiness report.
3. Source contract promotion and durable audit updates.
4. Task 13/16 devlog and plan closeout.

## Out Of Scope

- New crawler or network fetches.
- Database, MinIO, landing, maint, relation, or projection writes.
- Scheduler daemon deployment or recurring execution.
- L1/L2 policy changes, additional domain promotion, or deletion of historical
  authorization/generation evidence.
- Push, merge, or worktree cleanup.
