# Frontend Migration Plan (User-Facing App)

Last Updated: 2026-03-28
Scope: user-facing frontend migration records, originally executed under `front/`
Mode: docs-first, batch execution, strict context control

## 1. Hard Constraints

1. Only read/edit files required for the current batch.
2. Keep each batch small enough to fit a compact context window.
3. Database rule (mandatory): do not use physical foreign keys (`FOREIGN KEY`, `REFERENCES`).
4. Only logical foreign keys are allowed (`*_id` + index + app/service validation + clear error codes).
5. During execution, keep process logs. After a batch is completed, merge into one summary markdown and clear temporary logs for that batch.

## 2. Multi-Agent Discussion Summary

- Agent A (migration slicing): split migration into 4 batches with rollback per batch.
- Agent B (logical FK policy): add API contract metadata (`logicalReferences`, `logicalReferenceStatus`) and review checklist.
- Agent C (logging flow): use `process-logs/batches -> summaries -> cleanup` with a merge script.

## 3. Batch Plan

## 3.1 Progress Snapshot

- B1 (Entry and Router Split): completed on 2026-03-28
- B1 summary: `process-logs/summaries/summary-20260328-B1.md`
- B1 cleanup record: `process-logs/cleanup/cleanup-20260328-132133.log`
- B2 (List/Home Pages): completed on 2026-03-28
- B2 summary: `process-logs/summaries/summary-20260328-B2.md`
- B2 cleanup record: `process-logs/cleanup/cleanup-20260328-144800.log`
- B3 (Detail + Editor pages, safe subset): completed on 2026-03-28
- B3 summary: `process-logs/summaries/summary-20260328-B3.md`
- B3 cleanup record: `process-logs/cleanup/cleanup-20260328-145242.log`
- B4 (Auth/API contracts): completed on 2026-03-28
- B4 summary: `process-logs/summaries/summary-20260328-B4.md`
- B4 cleanup record: `process-logs/cleanup/cleanup-20260328-145511.log`

## 3.2 Batch 1: Entry and Router Split (completed)

Goal:
- Separate router bootstrap from `src/main.ts`.
- Keep runtime behavior unchanged.

Files:
- `src/main.ts`
- `src/router/index.ts` (new)
- `src/router/routes.ts` (new)

Acceptance:
- `pnpm run check` passes.
- `pnpm run build` passes.
- Auth guards still work (`requiresAuth`, `guestOnly`).

Rollback:
- Revert the 3 files above.

## Batch 2: List/Home Pages (completed)

Goal:
- Move list/home view wiring to stable modules with minimal coupling.

Primary files:
- `src/views/HomeView.vue`
- `src/views/HomePage.vue`
- `src/components/*` (list/home related only)

Acceptance:
- Home/list routes render and filtering works.

Rollback:
- Revert changed view/components only.

## Batch 3: Detail and Editor Pages (completed, safe subset)

Goal:
- Migrate detail/editor pages with aggregate-first API strategy.

Primary files:
- `src/views/ItemDetailView.vue`
- `src/views/ArticleDetailView.vue`
- `src/views/ArticleWriteView.vue`
- `src/components/ItemDetailModal.vue`

Acceptance:
- Detail and write flows work.
- Aggregate fallback path works.

Rollback:
- Revert changed detail/editor files.

## Batch 4: User Auth and API Contracts (completed)

Goal:
- Stabilize auth flows and enforce logical FK contract checklist for backend integration.

Primary files:
- `src/stores/userAuth.ts`
- `src/views/User*.vue`
- `src/api/*.ts`

Acceptance:
- Login/register/reset/profile flow works.
- API docs include logical FK contract fields for integration endpoints.

Rollback:
- Revert auth-related store/views/api files.

## 4. Logical FK Integration Checklist (No Physical FK)

For each integration endpoint touching relational data:

1. Document source field (`*_id`), target entity, and required target status.
2. Define check stage: create/update/delete.
3. Define error code when referenced target is missing or invalid.
4. Return trace/debug status in response (example: `logicalReferenceStatus`).
5. Add tests for valid, missing, and invalid-state target records.

## 5. Logging Workflow

- Working logs: `process-logs/batches/*.md`
- Period summary: `process-logs/summaries/*.md`
- Cleanup record: `process-logs/cleanup/*.log`

Process:
1. Write batch progress to a batch log.
2. When batch is done, run merge script.
3. Produce one summary markdown.
4. Clear temporary logs for the completed batch and record cleanup.
