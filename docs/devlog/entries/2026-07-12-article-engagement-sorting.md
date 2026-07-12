# Devlog: article-engagement-sorting

## Status

`closed`

## Context

- User goal: rank public articles by reading count and favorites rather than database creation ordering.
- Branch: `feat/article-engagement-sorting`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/article-engagement-sorting`
- Base: `main` at `5738633`
- Related docs: `docs/superpowers/plans/2026-07-12-article-engagement-sorting.md`
- Related prior entries: none.

## Direction / Decisions

- Chosen approach: change the shared published-article mapper ordering to `viewCount DESC, favoriteCount DESC, published_at DESC, id DESC`.
- Reasoning: the public list and article-detail recommendations both consume `GET /articles`; the query already projects both engagement metrics.
- Rejected options: frontend re-sorting would make paginated result sets inconsistent; exposing new request sort parameters is not needed for the requested fixed default.

## Scope

- Frontend: verify consumers only; no expected source change.
- Backend: published-article mapper ordering and a focused mapper contract test.
- Data: none.
- Docs/process: task plan and devlog traceability.
- Out of scope: admin article ordering, author-profile chronology, engagement counter definitions, and database indexing.

## Validation

- Commands run: the focused published-sort test first ran red; then `mvn -Dtest=ArticleMapperPublishedSortContractTest,ArticleMapperCommentCountContractTest test`; targeted consumer scan; `git diff --check`; isolated local-stack startup; public API and page HTTP checks.
- Results: the red test failed because engagement fields were absent from the sort clause. After the mapper change, both contract classes passed (4 tests); both public consumers request `GET /articles`; diff check passed. The isolated stack is reachable at backend `18205`, front `15205`, and admin `13105`; `GET /api/articles?limit=10` returned HTTP 200 and 10 records in the required stable engagement order; `/articles` returned HTTP 200.
- Not run: browser interaction assertion; the user is reviewing the running public page.

## Result

- Completed: analysis, isolated branch setup, test-first mapper change, focused validation, isolated local-stack startup, and live endpoint check.
- Not completed: browser interaction assertion; local merge follows this commit.

## Residual Risks

- Engagement totals are computed with correlated aggregates, so large published-article catalogs may need a separate performance/indexing review; this task preserves the existing query shape.
- The local-slot registry assigned a front-port collision, so this run uses explicit non-conflicting base-port overrides; keep these processes running only for this review session.

## Follow-up

- none.

## Commits

- commit SHA pending in final response.
