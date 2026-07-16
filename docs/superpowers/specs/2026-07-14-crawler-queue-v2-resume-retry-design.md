# Crawler Queue V2 Resume And Retry Design

## Goal

Make failed V2 attempts operable from the maintained admin monitor and ensure
registered resumable actions use their data checkpoints on retry without
changing existing Redis records or starting crawler work during implementation.

## Contract

- The action registry remains the authority for whether an action supports
  data-level resume and for its fixed resume-state path.
- A first domain start uses the requested `fresh`, `resume`, or `auto` mode.
- A retry creates a new attempt under the same queue. If the registered action
  supports resume, the worker receives `auto`; otherwise it receives `fresh`.
- `auto` lets the script resume only when its checkpoint and input fingerprint
  are valid; otherwise the script safely starts fresh.
- Pause/resume remains process-level `STOP`/`CONT` and is not presented as
  failure recovery.

## Persistence And Compatibility

The existing queue dedupe key already persists the first enqueue resume mode,
and retry attempts persist `retryOfAttemptId`. The supervisor combines those
two durable facts with the immutable action registry to derive the launch
mode. No Redis/Lua schema migration or mutation of existing attempts is needed.

## API And UI

- Terminal attempts retain state-machine `allowedActions` in overview.
- Failed, timed-out, and interrupted attempts expose `retry` and `cleanup`.
- Completed and cancelled attempts expose only `cleanup`.
- The UI labels retry as `接着爬` for Boss, Buff, and Town NPC maintenance, and
  `重新爬` for the other registered domains.
- Cleanup remains available from attempt history and uses exact attempt
  identity and state version.

## Recovery Boundary

Startup continues to adopt only exact, fresh running processes. Queued and
retry-wait attempts remain Redis-authoritative and are claimed by the
reconciler. Unknown process identity fails closed; no second process is
automatically launched from artifact history.

## Validation

- Backend RED/GREEN tests for terminal actions, retry identity, launch command
  arguments, unsupported resume rejection, and ready retry convergence.
- Admin RED/GREEN tests for retry/cleanup visibility and labels.
- Existing isolated resume script tests for Boss, Buff, and Town NPC.
- No real crawler, shared Redis reset, database write, or generated-data edit.
