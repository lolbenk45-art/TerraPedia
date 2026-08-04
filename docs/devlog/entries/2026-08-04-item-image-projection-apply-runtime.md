# Devlog: item-image-projection-apply-runtime

## Status

`blocked`

## Context

- User goal: Continue automated ingestion through the governed item-image
  projection data closure, asking for authorization at each runtime boundary.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Parent: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`
- Predecessor:
  `docs/devlog/entries/2026-08-04-item-image-projection-apply-implementation.md`
- Operation: `canonical-item-image-projection-apply`

## Direction / Decisions

- The next checkpoint is read-only proposal materialization only. It may read
  the formal local/maint/relation database triplet and write private repository
  evidence, but it performs no database DML and consumes no formal apply permit.
- The proposal Owner artifact must bind exactly: schema/version and kind,
  operation/action, actor, reason, authorization reference, decision identity,
  authorization/expiry timestamps, the formal database triplet, `noWrite: true`,
  and the canonical authorization hash over those preceding fields.
- The canonical apply request hash is deferred until the separately authorized
  database snapshot, proposal, and input bytes exist.
- Owner authorization
  `canonical-item-image-projection-proposal-read-20260804-01` was accepted only
  for the no-write proposal checkpoint. The attempt is retained fail-closed;
  it cannot be widened into an image-sync, lineage repair, or projection apply.
- The initial image-sync packet expired unconsumed. A fresh separate Owner
  decision `canonical-image-sync-legacy-origin-repair-20260805-01` authorized
  only the worktree MinIO start and 331-item legacy-origin repair. Its success
  value is the origin-free
  `/terrapedia-images/items/...` bucket/object path; `localhost:9000` is only
  the legacy selector and `127.0.0.1:19100` is only the current probe origin.

## Scope

- Allowed after explicit Owner authorization: create the private read-only
  Owner artifact, read the exact shared database snapshot in a read-only
  transaction, and materialize snapshot/proposal/input evidence under the
  decision-derived attempt root.
- Still out of scope: formal request/packet/permit/apply, crawler, network,
  MinIO, source flip, L1/L2, scheduler, service lifecycle, push, merge, cleanup.

## Validation

- Predecessor code checkpoint: focused offline matrix `155/155`, 21 syntax
  checks, ownership scans, and `git diff --check` passed.
- Runtime validation: the private Owner artifact is `0600`, its canonical hash
  recomputes to
  `sha256:9d7340dafa008c3a9a132e58e198f28c8e44353d68eadf6bc17cb1e07f1f12ab`,
  and the authorized read-only proposal opened `START TRANSACTION READ ONLY`,
  read the exact relation/projection snapshot, rolled back, and closed.
- The proposal failed closed before writing snapshot/proposal/input evidence:
  `relation cachedUrl must be managed for AbigailsFlower`. A second targeted
  read-only transaction confirmed `6131` active primary relation rows consist
  of `5800` origin-free managed paths and `331` stale
  `http://localhost:9000/terrapedia-images/items/...` URLs. No DML ran.
- Legacy repair implementation is checkpointed at `3c93bcd1` and its exact CLI
  manifest binding at `fd3d92eb`. Fresh focused validation passes `53/53`, both
  changed scripts pass `node --check`, and the scoped diff check is clean.
- The authorized MinIO process is PID `2881550`, serves the configured
  `~/.local/share/terrapedia/minio/data` on `127.0.0.1:19100`, and passes both
  live health and a real candidate-object HEAD (`200`). No other service was
  started.
- Private `0600` request
  `sha256:d710ede350cf7398e351044905b759d4eb31bd1f329570af5b337f25920280dd`
  and packet
  `sha256:8c1795effa4371f122f4aa1c465fa9cce2a4f83228b03705aafefa98facbb3ca`
  re-verified against current code/data/server/policy identity before dispatch.
- Formal dispatch completed at exit `0`. Fresh post-run comparison against the
  exact pre-run Git bytes proves `6131` stable records, exactly `331` changed
  `imageUrl` fields, zero invalid path transformations, and zero changes to any
  other record field. The final standardized hash is
  `sha256:fdb1d2a73c9816dc7ac705e736a4525333f7805253d758fa76eb103643f4756c`.
- Result evidence is `completed` with `331` candidates, `331` changed, zero
  uploads, and zero failures. The decision occurs once in the durable ledger;
  no dispatch permit, process, `.lock`, `.tmp`, or `.part` residue remains.

## Result

- Current state: standardized source normalization is complete; the projection
  remains blocked only by the required refreshed lineage/proposal chain.
- The private proposal authorization artifact exists under attempt
  `869d9b566e98532922667e82b115bb7f3952d0e2a6c769d355589a4ea77faa8b`.
  No snapshot, proposal, input contract, formal request, packet, permit, or
  result was created.
- All `6131` standardized item image URLs now use origin-free
  `/terrapedia-images/items/...` paths. The worktree MinIO remains healthy on
  `127.0.0.1:19100`; backend, crawler, projection, source flip, and scheduler
  were not started or executed.

## Residual Risks

- After source normalization, a new immutable lineage bundle/four-layer apply
  and a fresh projection proposal decision are required; the current attempt
  cannot be reused.
- The worktree contains unrelated dirty paths that must remain unstaged.
- The now-running worktree MinIO was explicitly authorized to start; stopping
  it or changing any other service remains outside this operation.

## Follow-up

- Owner: Codex. Stop at this checkpoint. Regenerate immutable four-layer
  lineage evidence and obtain a separate Owner decision before any lineage
  apply or fresh projection proposal/apply. Do not reuse the failed read-only
  proposal attempt or widen the consumed image-sync decision.

## Commits

- Legacy-origin implementation: `3c93bcd1`.
- Manifest CLI binding: `fd3d92eb`.
- Standardized-data checkpoint is ready for a focused commit.
