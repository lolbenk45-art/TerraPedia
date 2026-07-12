# Devlog: item-image-minio-fallback-investigation

## Status

`closed`

## Context

- User goal: Diagnose why public frontend item images frequently show the fallback image even though MinIO provides the assets.
- Branch: `investigate/item-image-minio-fallback`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/investigate-item-image-minio-fallback`
- Base: `main@5738633`
- Related docs: `docs/devlog/current.md`
- Related prior entries: `docs/devlog/entries/2026-07-12-article-embedded-recipe-tree-light.md` (separate active visual task; do not modify its files).

## Direction / Decisions

- Chosen approach: Read-only, boundary-by-boundary diagnosis from item rendering through API/image URL handling to MinIO reachability.
- Reasoning: Establish the actual failing boundary before proposing any code or configuration change.
- Rejected options: Changing the fallback behavior or restarting services before root-cause evidence exists.

### 2026-07-12 18:05

- Change: Root cause confirmed in the public item-list image selection contract.
- Reason: The list mapper accepts only current MinIO absolute origins, while persisted cached URLs still use the explicitly supported legacy origin.
- Evidence: All 6,159 `GET /api/public/items` rows have no image; 6,136 active items have cached image records at the legacy `localhost:9000` managed path; current-list join matching the runtime `19100` origins returns zero rows. Detail and suggestion routes normalize the same legacy paths to `/terrapedia-images/...`, and the front preview proxy returns `200 image/png` for that object.

## Scope

- Frontend: public item image rendering and URL construction only.
- Backend: public item display-image selection and response contract repair.
- Data: MinIO object-path and availability inspection only; no writes.
- Docs/process: diagnostic traceability only.
- Out of scope: behavioral fixes, database/MinIO mutations, crawler runs, and service lifecycle changes.

## Validation

- Commands run: branch/worktree isolation verification; public list/detail/suggestion API probes; full public-list image count; database image URL-format/count queries; direct legacy/current MinIO and front preview-proxy probes; mapper/policy history inspection.
- Results: isolated worktree is based on `main@5738633`; `MinioManagedImageUrlPolicyTest` and `PublicItemServiceImplTest` pass 19/19; an isolated backend on port 18211 returns images for 100/100 public-list rows and the existing front preview proxy serves the returned managed path as `200 image/png`.
- Not run: no data mutation, browser screenshot run, production-stack restart, or primary-cache clear.

## Result

- Completed: root cause, affected front entrypoints, and MinIO reachability have been established.
- Completed: read-only legacy-prefix policy, public read-path selection, two RED-to-GREEN regression tests, and isolated runtime proof.
- Not completed: the existing mapper SQL contract suite has three baseline failures that must be reconciled before a full focused gate can be green.

## Residual Risks

- 23 active items have no active cached image record and will correctly remain fallback candidates after the list contract is repaired.
- The bug was introduced by the public-item allowlist tightening (`cd7a842`) and must be corrected without widening the accepted source-origin set beyond configured legacy origins.
- `ItemMapperPreferredImageSqlTest` fails three baseline assertions against unchanged mapper XML: detail category aggregation, suggestion projection choice, and no-prefix rendering. These tests are outside this branch's code diff but block a fully green focused suite.

## Follow-up

- Owner: Codex. Reconcile the stale `ItemMapperPreferredImageSqlTest` assertions with the current mapper contract in a separate validation-maintenance task. Deploying this branch requires restarting the backend or an equivalent code deployment; no MinIO restart or database migration is required.

## State Changes

### 2026-07-12 18:17

- Change: Implemented the list-image repair and completed isolated runtime verification.
- Reason: The user approved the corrective implementation after root-cause confirmation.
- Evidence: The isolated backend returned 100 image-bearing public-list rows and the front proxy returned an image response for the first managed path.

## Commits

- commit SHA pending in final response.
