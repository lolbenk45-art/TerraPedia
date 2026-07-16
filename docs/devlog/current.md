# Current Devlog

Last updated: 2026-07-17 05:04 CST by Codex

## Open Work

- No shared open work is recorded on `main`. The local merge of
  `fix/crawler-queue-v2-runtime` is validated and awaiting its merge commit.

## Active Focus

- Create the validated local V2 merge commit, then leave real force-crawl and
  database apply as explicit operator-authorized actions.

## Current State

- Public category child navigation is closed at `4a744dc`: six parent routes
  expose 34 image-backed child categories with verified scope, count, and
  fail-closed behavior.
- V2 crawler operation workflow is integrated from `3234cc0` pending the local
  merge commit. It adds the backend-owned 19-operation catalog, truthful
  attempt plan/result evidence, lease renewal, exact controls, and compact ID
  presentation. Fresh branch gates passed admin 311/311 plus typecheck/build,
  crawler/workflow 61/61, and focused V2 backend 527 with zero failures/errors.
- The local merge initially regressed the main notification source by treating
  missing legacy `domain.state` as V2 idle. The fallback was removed; merged
  gates now pass admin 345/345 plus typecheck/build, focused V2 backend 538/538,
  and backend test compilation.

## Next Agent Should Start Here

- After the merge is committed and its targeted gates pass, start new work from
  a new devlog entry. Do not run real crawler force/apply actions, Redis reset,
  or database writes without explicit operation-level authorization.

## Current Risks

- Broad Maven/full quality-gate baseline failures are outside the V2 scope.
- Real force-crawl, formal apply, live Redis expiry races, and adversarial HTTP
  preview-path acceptance remain manual/runtime concerns.
- Public category totals and representative images depend on current local
  data; their route and fail-closed contracts remain the acceptance boundary.

## Recently Closed

- `docs/devlog/entries/2026-07-17-v2-main-merge-integration.md`
  - branch: `main`
  - status: `closed`
  - commit: pending in final response

- `docs/devlog/entries/2026-07-16-crawler-monitor-operation-semantics.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `3234cc0`

- `docs/devlog/entries/2026-07-14-crawler-monitor-registered-idle-domains.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `3234cc0`

- `docs/devlog/entries/2026-07-16-public-category-navigation.md`
  - branch: `codex/continue-dev-20260715`
  - status: `closed`
  - commit: `4a744dc`

- `docs/devlog/entries/2026-07-12-crawler-queue-v2-runtime.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `0bad80d`
