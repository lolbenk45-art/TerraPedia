# Devlog: item-image-projection-apply-runtime

## Status

`active`

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
- Runtime validation: not run; no real database read or write has occurred.

## Result

- Current state: `CODE_READY`; runtime/data closure remains open.
- No proposal authorization artifact, attempt ID/root, database snapshot,
  proposal, input contract, request, packet, permit, or result exists yet.

## Residual Risks

- Shared database rows and server identity may drift before authorization and
  snapshot creation; no request hash can safely be precomputed from unread
  target state.
- The worktree contains unrelated dirty paths that must remain unstaged.

## Follow-up

- Owner: Codex. Obtain the exact read-only proposal Owner authorization fields,
  create only that artifact, then execute and verify the no-write proposal
  checkpoint. Stop again before formal request creation.

## Commits

- Runtime work pending; implementation commit SHA is reported by the
  predecessor closeout response.
