# Crawler Auto-Domain Consumption And Resume Design

**Date:** 2026-08-14
**Status:** approved for specification review
**Scope:** V2 changed-only automation for `items`, `npcs`, `projectiles`, `armor_sets`, `buffs`, `shimmer`, `audio`, and `bosses`.

## Goal

Automatic crawler work must run only for a source revision that has not yet been
consumed successfully, and a failed resumable task must continue from its
validated checkpoint. A task that exceeds three automatic resume attempts must
pause for human review instead of starting another blind crawl.

## Non-Goals

- No automatic database writes are added to this change.
- No L2 automation is enabled.
- Boss loot, NPC loot, and other non-default operations remain outside the
  automatic set.
- The currently running Buff attempt is not cancelled or mutated by the fix.

## Current Failure Modes

1. Source detection and crawler completion do not consistently use the same
   manifest path. Missing records are interpreted as `changed=true`, so the
   same source can be dispatched repeatedly.
2. The V2 automation sweep hard-codes `resumeMode=fresh`, even when the action
   advertises a resumable checkpoint. Fresh mode deletes the checkpoint before
   work starts.
3. Shimmer, Audio, and Bosses are in the auto-dispatch allowlist but are not
   represented completely in the source monitor contract, so real changes are
   not detected consistently.
4. Retry metadata can inherit the original `fresh` mode, so a failed automatic
   run does not become a resume attempt.

## Design

### 1. Canonical source-consumption contract

Create one source contract used by the scheduler and completion path. Each
automatic domain declares:

- `domain` and stable `actionId`;
- `sourceKey`, `locator`, `sourceKind`, and `entityFamily`;
- canonical output path used to compute the consumed fingerprint;
- whether the operation supports `resume` and its checkpoint path;
- the automatic retry limit (`3`).

The contract resolves the manifest through the existing shared-data helper and
rejects worktree-relative shadow manifests. The source monitor, direct fetch
commands, and backend refresh finalizer all receive this resolved path.

### 2. Completion and source acknowledgement

An operation is eligible to acknowledge a source only after its child progress
is terminal `completed` and its declared output exists and is readable. The
completion path advances the manifest record for that source using the existing
content/revision fields. A failed, cancelled, timed-out, or ambiguous attempt
never advances the manifest. A successful run therefore changes the next sweep
from `changed=true` to `changed=false` without relying on a wall-clock cooldown.

The acknowledgement is idempotent: repeating completion for the same output
and source identity produces the same latest manifest record and does not create
additional crawler work.

### 3. Recovery decision

The scheduler calculates a recovery decision before dispatching each changed
action:

| Condition | Dispatch mode | Result |
|---|---|---|
| No prior attempt for this source | `fresh` | Start the source crawl |
| Prior attempt is active | none | Leave the existing attempt authoritative |
| Failed attempt, valid checkpoint, retry count `< 3` | `resume` | Continue from checkpoint |
| Failed attempt, no checkpoint or invalid fingerprint | `fresh` once | Rebuild the checkpoint from the current source |
| Automatic retry count `>= 3` | none | Mark `paused`, require human action |

The decision is recorded in the sweep evidence and operation plan. The launcher
passes `--resume-mode=resume --resume-state=<path>` only for resumable actions;
non-resumable actions never receive a fake resume flag. Manual retry uses the
same decision function but remains explicitly user initiated after the
automatic limit.

### 4. Domain coverage

The source monitor registry is expanded to include the three supplementary
source keys with the same manifest identity rules. The scheduler allowlist and
preflight derive from this registry rather than maintaining a second list.
Bosses remain limited to the existing base-data scope; no loot source or loot
operation is added.

### 5. Safety and concurrency

- One active attempt per `actionId` remains enforced by V2 Redis queue leases.
- A sweep does not dispatch while an attempt for that action is running,
  stalled, or waiting for retry.
- Automatic retry uses the existing queue retry records and preserves exact
  `queueId`, `retryOfAttemptId`, state-store epoch, and checkpoint identity.
- A checkpoint fingerprint mismatch is fail-closed; it cannot silently mix
  records from two source generations.
- The fix changes scheduler metadata and source acknowledgement only. It does
  not alter crawler raw-output or database ownership boundaries.

## Verification Contract

Tests must prove, for all eight domains:

1. Source detection resolves the canonical manifest and reports unchanged after
   a successful acknowledgement.
2. A completed output advances only its declared source record.
3. A failed or cancelled output does not advance the manifest.
4. An active attempt is not duplicated by the next sweep.
5. A resumable failure dispatches `resume` with its checkpoint path.
6. A non-resumable failure does not receive a resume flag.
7. Invalid checkpoints trigger at most one fresh rebuild, then the three-attempt
   pause guard applies.
8. Boss loot and non-default operations remain absent from the automatic set.

Focused validation will include the source-monitor Node suite, the touched
fetch/automation tests, and the focused V2 backend monitor tests. No live sweep,
manual retry, database apply, Redis reset, or current Buff interruption is part
of validation.

## Rollout

1. Land contract and tests with scheduler dispatch disabled in test fixtures.
2. Validate against a temporary manifest and isolated Redis database.
3. Wait for the current Buff attempt to reach a terminal state.
4. Restart the backend so the new scheduler code is loaded.
5. Read the next scheduled sweep and verify no duplicate dispatch for unchanged
   sources before considering the fix complete.
