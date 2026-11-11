# Buff Item Maint Insert Core

Date: 2026-10-06. Owner: Codex, Buff continuation.

## Scope

This phase implements and replays a bounded insert contract for exactly the
six Item game IDs required by the Buff secondary dependency:
`6148`, `6149`, `6155`, `6161`, `6164`, and `6173`. It does not publish data.

## Contract

`pipelines/maint/buff-item-maint-insert-contract.mjs` verifies the frozen
Iteminfo semantic capture, derives a small Lua `data` payload containing only
the six IDs plus `_generated` and `_terrariaversion`, and reuses the existing
maint extractor. The landing uses
`canonical.buff-item-dependency.<runId>` and `is_current=0`; this prevents the
general `items_raw` sync from reading it as the full Iteminfo source. Existing
`wiki.module.iteminfo` landing and all existing `maint_items` rows are retained
as the locked baseline.

`pipelines/maint/buff-item-maint-insert-executor.mjs` requires an operation-bound
authorized context, fixed SQL columns, one real landing receipt, six distinct
maint receipts, source and baseline rederivation after locks, an immutable
prepared/materialized/terminal journal, exact preserved-row after-set, and
explicit `committed`, `rolled-back`, `commit-unknown`, and `rollback-unknown`
outcomes. It is a core module, not a command or permission by itself.

## Evidence

- Proposal/replay: `.local/tmp/buff-item-maint-insert-proposal-20261006-v1.json`.
- Contract hash: `sha256:b80c88374270561b6c22b942bb95cefb9a2875d7a045d712de96f466143a47e9`.
- Artifact SHA-256: `sha256:7c8561f23abcbf918e9a26d69a4b2d174417189721d67c0167c37e05ab422785`.
- Before baseline: `maint_items=6146`, `items_raw landing=1`.
- Buff counts: `maint/relation/projection/NPC secondary/Item secondary = 388/388/388/1290/0`.
- MySQL: loopback `127.0.0.1:13306`, UUID
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf`.
- API preflight before/after: HTTP `200`, scheduler disabled, live attempts/
  claims `0/0`, healthy reconciler, unchanged H8/epoch.

## Validation

`node --test pipelines/maint/buff-item-maint-insert-contract.test.mjs
pipelines/maint/buff-item-maint-insert-executor.test.mjs` passes `20/20`.
The replay uses a READ ONLY MySQL transaction and rollback; no database or
Redis write occurred. `node --check` and `git diff --check` remain required
before closeout.

## Remaining Gates

Registration, manifest code/data binding, fresh packet/Owner/server/fence,
one-use permit, and independent after-commit readback are required before any
real insert. The `1340` name drift, NPC immunity source IDs, and Buff
zero-baseline/full-chain ownership remain outside this phase.

## Canonical Registration

Task 18 registers `canonical-buff-item-maint-insert` separately from generic
Item sync. The manifest binds the proposal and five frozen capture/input
files, the transitive code bundle, exact six source IDs, two distinct real
fence tokens, and prepared/materialized/committed/readback outputs. The
runner verifies the canonical packet and permit using existing shared helpers,
rechecks Owner/server/policy/scheduler/live-work and both ownership predicates,
commits through the Task 17 core, then uses an independent MySQL connection
to compare the full committed snapshot hash before releasing either fence.
Source files are reread through private ordinary-file/no-follow access.

The draft canonical proposal is
`reports/authorization/canonical/canonical-buff-item-maint-insert.20261006-task18-draft-v1.proposal.json`.
Its file hash is
`sha256:83526c4c5252367f707c31f93dec850dabd5a8527b91854e6bbbc5129157e40e`,
and its contract hash is
`sha256:187b6cd155672bfb95002f3f535f6a0aec7ac13caa42860abd0726f15004ce17`.
The first draft evidence was superseded by
`.local/tmp/buff-item-maint-task18-draft-evidence-20261006-v2.json`; both are
read-only and report `AWAITING_SCOPE_CONFIRMATION`, zero live
attempts/reservations/fences, and no database writes. The v2 file predates the
review repairs below and is historical evidence only. No fake fence token,
executable manifest, authorization packet, or permit was generated for the
draft.

Actual publication awaits explicit scope confirmation because the standing
register excludes new catalog actions and this independent Item-owned insert
was not part of the earlier exact Buff additive relation authorization. The
new registration is code only. After confirmation, use fresh proposal/run
labels and two real fence receipts; never promote the draft into authority.

## Review repairs

The expiry review added validity checks after locked source/baseline
rederivation, immediately before permit consumption, and immediately before
COMMIT. It also found that ordinary 60-minute fence expiry could permit a
competing writer after unknown COMMIT/ROLLBACK or failed independent readback.
The runner now extends both exact fence rows to the maximum MySQL DATETIME in a
separate locked hold transaction, records immutable hold-prepared and
hold-committed evidence, and releases only after confirmed rollback plus
terminal journal or a successful independent committed readback. Unknown and
unread-back outcomes retain the hold for explicit reconciliation.

Fresh validation: maint contract/executor/runner `33/33`, governance/
manifest/authorization `110/110`, syntax checks, and `git diff --check` pass.
No live packet, permit, fence, landing, maint, Redis, scheduler, or business
table write occurred. The registered operation still awaits exact user scope
confirmation.

## Resume preflight — 2026-10-06

Fresh read-only evidence `.local/tmp/buff-item-maint-task18-resume-evidence-20261006-v3.json`
binds proposal
`reports/authorization/canonical/canonical-buff-item-maint-insert.20261006-task18-resume-v3.proposal.json`
with proposal SHA-256
`sha256:d4a04e9130dd5439531249bf34aa2b93213c6d412b42559f7f639af1bcd2816c`.
The current server is `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`; active
attempts, reservations, and fences are `0/0/0`; the exact six source IDs and
`1/6` landing/maint insert shape are unchanged. The evidence remains
`databaseWrites=false`, `executable=false`, and `AWAITING_SCOPE_CONFIRMATION`.

## Authorized execution — 2026-10-06

The user explicitly approved the exact six-Item scope. Fresh execution used
decision `buff-item-maint-20261006-admin-01`, run
`buff-items-20261006-task18-exec-v1`, and packet hash
`sha256:1da203d2619affe02acde7a2e9195eaecf076b37ef89d501a88ae4cbef657139`.
The canonical runner inserted one non-current landing `12546` and six active
maint rows: `6162/6163/6164/6165/6166/6167`, for source IDs
`6148/6149/6155/6161/6164/6173`. Result and independent readback are retained
at the corresponding `20261006-task18-exec-v1.result.json` and
`.readback.json` paths.

Independent SQL verification reports `maint_items=6152`, two `items_raw`
landings, all six rows linked to landing `12546` with `status=1/deleted=0`, and
active fences, attempts, and reservations `0/0/0`. API preflight returned HTTP
200 with scheduler disabled and a healthy reconciler. No local Item, Buff
relation/projection, scheduler, or Redis business write occurred.
