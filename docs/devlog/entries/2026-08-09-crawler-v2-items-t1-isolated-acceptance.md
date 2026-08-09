# Devlog: crawler-v2-items-t1-isolated-acceptance

## Status

`closed`

## Context

- User goal: prove the real V2 Item scheduled fixture can ingest bounded offline Item records into disposable local/maint/relation schemas and clean all resources.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Related plan: `docs/superpowers/plans/2026-08-09-crawler-v2-items-t1-isolated-acceptance.md`

## Direction / Decisions

- Added a recorded Item executor with a one-hundred-record cap, repository-relative downloaded JSON enforcement, formal readonly identity closure, isolated three-schema writes, and terminal progress/readback.
- Reused the owned scheduler system driver and loopback-only lifecycle; Item mode skips the Recipe dependency seed and binds separate readonly/provisioner identities.
- The owner has explicitly authorized one governed Item T1 dispatch. It remains
  limited to the frozen 100-record offline fixture and run-derived resources.
- The first two authorized dispatches failed before child execution because the
  generated manifest omitted required driver arguments. Their decisions were
  consumed once, all resource counters remained zero, and the manifest now
  freezes `--driver-module`, a run-owned `/tmp` marker root, and a run-specific
  no-overwrite report path.
- Production scheduler, formal writes, Wiki network, activation proposal, and
  every other operation remain out of scope.

## Scope

- Backend: existing fixture-only V2 route and runtime jar freshness check.
- Data: Item records selected from `data/standardized/items.standardized.json`; target schemas are run-derived only.
- Docs/process: Item manifest, canonical report, request, and this handoff.
- Out of scope: formal `terria_v1_*` mutation, Wiki access, production scheduler activation.

## Validation

- Focused Node suites: `111/111` passed after the Item one-hundred-record
  lifecycle changes, including the governed operation-ID catalog assertion.
- Maven package: `mvn -DskipTests package` passed; backend jar rebuilt before live run.
- Live run: `item-t1-live-100-20260809-01` passed with `itemCount=100`, `maintCount=100`, `relationCount=100`, `unresolvedIdentities=0`, exact SQL readback by Item identity/record key, two lease renewals, restart adopt/mismatch rejection, lease-loss reap, and all cleanup counters zero.
- Independent post-run checks: Redis DB14 keys `0`, run-derived schema count `0`, backend port free, marker root removed.
- Final current-hash request: `reports/authorization/canonical/canonical-crawler-v2-items-t1-acceptance-20260809-07.request.json`, hash `sha256:8c1b72ec06262ac960811b2491d1aef1f907579aae9b7dab2831c59241e8a2b4`; its `AUTHORIZED` packet was consumed exactly once.
- Authorized run: `npc-t1-crawler-v2-items-20260809-07` passed under decision
  `canonical-crawler-v2-items-t1-acceptance-20260809-admin-07`; its private
  packet is `...-20260809-07.packet.json` and its unique canonical report is
  `reports/canonical-migration/canonical-crawler-v2-items-t1-acceptance-npc-t1-crawler-v2-items-20260809-07.json`.
- The final run again wrote/read back `100/100/100` Item/maint/relation rows
  with zero unresolved identities, two lease renewals, restart adopt/mismatch
  rejection, lease-loss reap, and independent cleanup of schemas, credentials,
  Redis DB14, port, marker root, process, and dispatch permit to zero.

## Result

- Completed: Item executor, fixture routing, driver Item mode, canonical manifest/report, and fresh request.
- Completed: owner-authorized, run-specific Item T1 dispatch and independent
  cleanup readback.

## Residual Risks

- The live scheduled action remains the existing fixture action ID while Item mode is selected through isolated backend environment; formal production routing is unchanged and disabled.
- Item acceptance now covers one hundred bounded standardized records, not a full 6131-record Item corpus crawl.
- Decisions `...admin-05` and `...admin-06` remain consumed startup-failure
  audit records and cannot be reused.

## Follow-up

- No Item follow-up remains. Do not consume the separate scheduler request or
  enable formal automation.

## Commits

- Commit SHA pending in final response.

### 2026-08-09 08:00

- Change: completed and verified Item T1 isolated acceptance.
- Reason: close the remaining Item real-lifecycle gap after Scheduler T1.
- Evidence: canonical report and request paths above; see git for code-level diff details.
