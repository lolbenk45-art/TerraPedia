# Current Devlog

Last updated: 2026-07-29 10:23 CST by Codex

Active branch: `design/crawler-auto-ingestion-readiness`

## Open Work

- Automated-ingestion closure execution is active.
  Owner: Codex; status: `active`; branch: `design/crawler-auto-ingestion-readiness`;
  worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`;
  child of `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`;
  blocked-by: exact operation-level authorization at formal write/crawler/L1/L2/scheduler checkpoints,
  plus an ownership-valid `canonical-npc-apply` split/orchestration decision;
  contract handoff: `../superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`.
  Current execution snapshot: authorized Batch 04 consumed its recipe and boss
  identities exactly once and both completed. Recipe applied the frozen 3,663
  input, backfilled 124 group ingredients and 239 station names, consolidated
  providers at 45 activated / 3,429 deactivated, and left formal totals at
  11,658 recipes / 19,601 ingredients / 15,195 stations. Boss strict import
  updated 33 groups, mapped 51 NPC members, and localized all 29 candidates
  (21 GIF / 8 PNG) with zero unresolved or failed images. The isolated worktree
  backend on `18192` exited, Redis DB 14 is empty, the database has zero active
  transactions, and the original `18191` backend remains on PID 654976.
  Batch 02 NPC outputs are valid and frozen as 25 normalized/audit pairs. NPC
  apply remains fail-closed only because its cross-capability write set has no
  ownership-valid executor or execution manifest. Image sync changed exactly
  1,788 item `imageUrl` fields. The latest read-only domain gate is 40 pass /
  4 warning / 1 blocked: recipe is warning rather than blocked, boss source is
  pass, and item image coverage remains the sole blocked panel. Batch 04 and all
  earlier consumed identities cannot be reused.
  The first authorized group bootstrap identity
  `canonical-item-group-bootstrap-20260729-01` stopped before packet creation:
  commit `ac13f0e0` changed the shared manifest module after the frozen request,
  so current-code verification rejected its stale code hash. The identity is
  unused and no database write ran, but it remains bound to the superseded
  request and cannot authorize replacement bytes. The authorized current-byte
  retry `canonical-item-group-bootstrap-20260729-02` then consumed packet
  `sha256:dddef0127ccb1fe02e05f9045e06a2dec04af4fbd5a0db937bfa8ff6c7bb51f5`
  exactly once and completed. Readback proves 4 landing sources; maint
  `35/163/72/2`; relation `35/163/72`; local `34/161/70`; `PUBLISHED` state at
  snapshot `8d3fb0b1...fe819`; and zero active transactions. Compatibility readers
  and the running service were not changed. Plan progress is now 63/86. The
  independent biomes L1 policy-promotion request remains
  `sha256:df50664e72b2ff475c7e839c7e1129a7a77b8ed953353d6b98547f109431282a`;
  it remains `AWAITING_OWNER`. Group bootstrap action/acceptance/shadow/readiness/
  runner validation passes 35/35 and policy-decision validation passes 27/27.
  Full group cutover still requires Task 13 Step 4 shadow/API evidence, fallback
  disablement, and an authorized service lifecycle. L1 promotion remains a later
  independent checkpoint. Boss-loot still lacks its frozen bundle;
  shimmer lacks the raw file and three of five importable data shards in this
  worktree, so neither lane was fabricated or dispatched.
  The detailed task progression below is historical context; this snapshot is
  the current execution authority.
  Task 1 locked 13 initial pre-cutover group JSON production references; the
  current post-cutover inventory is 10 after registering the explicit readiness
  and T1 bootstrap readers. Task 2
  defines the 4 maint / 3 relation / 4 local canonical group tables, certified
  source/admin partitions, and shared projection-state fence. Task 3 now parses
  the frozen bootstrap at 33 recipe groups / 27 redundant overrides / 2
  exclusions and emits four group-only landing descriptors. Task 4 now proves
  deterministic maint/relation/local projection: the real dry-run yields 35
  maint groups, 161 resolved members, one blocked group, and 34 runtime groups;
  the dependency suite passes 123/123 with one existing skip. The group
  bootstrap remains unapplied. Task 5 now proves the only two allowed shadow
  normalizations and an exact 35-row compatibility round trip; its dependency
  suite passes 55/55. Task 6 now cuts backend, recipe expansion, pipeline group
  readers, and the admin page to canonical repositories. Its fresh gates pass
  backend 34/34, Node 83/83, admin 8/8, and Nuxt typecheck. Task 7 expands the
  exact capability catalog from 19 to 21 with
  the disabled canonical group preview/apply pair, source-derived ownership,
  backend child-status progress, and fail-closed admin visibility; its combined
  Node suite passes 61/61 and backend tests pass 28/28. Task 8 now routes the
  fail-closed canonical item-group readiness v1 contract through offline
  freshness, manual refresh planning, backend overview, admin labeling, and the
  local gate; focused Node 45/45, backend 16/16, and admin 15/15 pass. Task 9
  now proves group CODE_READY and T1_VERIFIED: final Node coverage has 300 test
  positions with one existing skip, backend passes 78/78, admin passes 37/37
  plus typecheck, T0 passes 36 schema checks, and T1 freezes/verifies 128 tables
  before proving 35 maint groups, 34 runtime groups, exact compatibility round
  trip, rollback/commit/restore, and zero resource leaks. Task 10 now fail-closes
  empty-shell/dry-run producer evidence and repairs armor definitions to 132
  mapped plus 19 reviewed placeholders; the current read-only result is 39 pass /
  5 warning / 1 blocked. Task 11 now reaches fixture-only NPC `CODE_READY`: scoped
  T0 `npc_7a854dc3e2150815` proves 13 tables, paired evidence, one matched fact,
  non-empty Buff/shop/loot relation/local lanes, `0/1/0` transaction counts, and
  zero cleanup leaks. Task 12 produced seven `AWAITING_OWNER` request hashes;
  those hashes are superseded by the Task 15 V58 authorization-contract repair.
  The exact bootstrap packet has now been consumed once: formal governance holds
  one ACTIVE Owner (`admin`), one `biomes` L0/DISABLED policy, and one immutable
  policy version. Task 15 code-only gating requires two committed L1 applies, closed
  circuit state, exact current policy identity, and fresh promotion/scheduler
  decisions; V58 is now applied on formal local. A continuation audit expanded authorization
  from seven incomplete requests to 17 independent operations and found that
  packet verification was not consumed by a formal runner. That defect is now
  repaired with current-identity revalidation, durable one-time decision use,
  and no-shell dispatch; its fail-closed request-as-packet probe exited before
  dispatch. Recipe progress and NPC governed preview are now code-ready. Batch
  02 produced a valid 25-pair NPC frozen input; NPC apply remains closed on the
  ownership/executor boundary rather than crawler evidence. NPC isolated T1,
  four warnings plus one blocked image panel, exact Owner identity fields, T2,
  and two L1 applies remain distinct
  checkpoints.
  Task 12A now supplies governed schema, group, biomes L1, and policy/activation
  executors. Sixteen of 17 operations have manifests whose hashes recursively
  bind repository-local static imports; the 16 downstream requests were
  regenerated against policy-set hash
  `sha256:fddd9c42ad0f2c22c4d611f63fb06fbe2444e4aea97029d0c11396e66d0b0e3c`.
  All six Batch 01 decision identities are consumed. Projectile, recipe crawl,
  and NPC crawl completed; Batch 03 completed schema and Batch 04 completed the
  exact recipe and boss retries. The partial item image result remains blocked
  on source/upload coverage. The fresh post-bootstrap
  full gate passes data workflow 287/287 and automation contracts 177/177;
  the latest read-only domain rerun fail-closes at 40 pass / 4 warning / 1 blocked
  evidence checkpoint. Fresh Batch 04 focused validation passes Node 42/42 and
  backend upload contracts 10/10; earlier broader focused validation passes
  Node 88/88 and backend 227/227. The packet-consuming Node runner is the single
  formal write path; the unused backend apply bean remains fail-closed. Only
  `canonical-npc-apply` has no executor because its proposed write set crosses
  capability owners. Its valid 25-target manifest and real crawler outputs are
  present, but the apply evidence contract is not satisfied. Local V56-V58 and
  maint/relation role schemas are applied; no group or NPC T2 apply has run.

- Crawler automated-ingestion readiness implementation remains active.
  Branch: `design/crawler-auto-ingestion-readiness`; worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`.
  Six Task 4-9 checkpoint commits delivered frozen evidence/policy/run persistence (V55 + 14 immutable tables),
  three-database apply protocol (mutation-generation, ownership-fence, staged/single-txn),
  19-operation capability manifest (all L0+DISABLED), admin workflow with T2 read-only
  boundary, T0/T1 acceptance runner, quality-gate automation contract step.
  Fresh no-database evidence: automation/admin Node 121/121, progress owners 25/25,
  Java automation/action 52/52, admin Nuxt typecheck, and git diff --check all pass.
  The progress and backend-owned disabled-reason code gates are closed; the real Spring
  profile defaults fail-closed to read-only. Authorized live T0/T1 acceptance now passes:
  three-schema rollback/commit/restore is `0/1/0`, T1 freezes and verifies 116 bounded
  ownership tables, and all isolated databases/accounts/Redis reservations clean to zero.
  Focused Node 181/181, Java 41/41, and Admin 14/14 plus typecheck pass. The branch is not
  merge-ready because the full gate stops on four B1 panels representing seven canonical
  migration exemptions expired on 2026-06-30; those data-governance blockers require a
  separate project/data owner repair before the full gate and any L1 checkpoint. The user
  approved the full landing -> maint -> relation -> local repair design and retained the
  four JSON paths as read-only compatibility outputs. A boundary review found and repaired
  NPC source, zero-check gate, feedback-loop, Owner authorization, formal-cutover,
  consumer-scope, T1-prefix, and export-lifecycle defects.
  The measured B1 review and user decisions are incorporated, and Step 0 is delivered. On
  2026-07-27 the interrupted formal-local V55 setup was repaired: all 18 empty manually created
  automation tables were removed, the branch backend let Flyway apply and register V55 with
  checksum `166205513`, and a second complete startup reported schema version 55 up to date.
  V55 now owns 18 empty tables and 18 immutable-fact triggers. The Owner/policy bootstrap module
  exists and is dry-run by default; its exact authorized formal bootstrap has now
  created the singleton Owner and the `biomes` L0/DISABLED policy. The approved B1 group chain is decomposed into independently
  verifiable phases. Phase 1A is complete through commits `f4221d6d`, `8402611c`, and
  `a11cd7b8`: it defines canonical landing identity/history, fail-closed importer rotation,
  and read-only audit/lineage consumers. The canonical group implementation now reaches
  CODE_READY/T1_VERIFIED through closure-plan Tasks 2-9; V56/V57/V58 are now
  registered on formal local while relation role completion remains pending. Task 10
  CODE_READY and filesystem-only work are complete; Task 11 fixture `CODE_READY`
  and Task 12 request generation are complete. The bootstrap and Batch 01
  packets were consumed; none of their decision identities can be reused.
  No production deployment, V1 deletion, new external sources, scheduler activation,
  or formal T2 apply was performed. L1/L2 promotion requires separate Owner authorization.
  See `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md` and
  `../superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md`.

- Post-merge acceptance in progress on branch `dev/post-merge-acceptance`
  (from local `main` @ `518d9a0`, 31 commits ahead of origin, unpushed).
- Uncommitted work pending user acceptance: triage-board layout fixes,
  V1-engine warning banner, one-shot V2 cutover script. See
  `entries/2026-07-17-crawler-v2-per-env-activation-guard.md`.
- Admin P0 audit batch is complete (8/8, commits `e6cda9c`..`ad8e9bd`); see
  `entries/2026-07-17-admin-p0-security-batch.md` for verification evidence
  and the three explicit follow-ups (backend @Profile for test-state,
  ItemMapperPreferredImageSqlTest baseline reds, P1 dead-code sweep).

## Active Focus

- Front P2 WP-11.2..WP-14, its closed P1-tail/WP10 dependencies,
  post-acceptance repairs, and the approved Mist Workbench/Linen Paper button
  systems are locally integrated into `main`. Focused contracts, the full
  frontend gate, both preview copies, and the 16-case runtime matrix passed for
  button scope. The blocked data-audit compatibility commits remain excluded;
  no push or local worktree cleanup was performed.

- Admin/backend P1+P2 batch is closed and locally integrated into `main` at
  `b778e57f`. The task branch and worktree are intentionally preserved; no push
  or cleanup has been performed.

- V2 queue engine activated on this worktree
  (cutoverId `crawler-v2-20260717T034735Z`). buffs re-dispatched and resumed
  from checkpoint 147/388 after a V1-era stuck-domain incident.
- V1 code deletion is deferred until V2 survives several full crawl cycles;
  boundary audit recorded in the entry above.

## Current State

- Front P2 merged-result validation passes the full public frontend gate and
  the focused public armor/recipe backend suite (16/16). The source integration
  worktree remains available with two unstaged HTML acceptance auxiliaries.

- C2 commits `b825ecc`, `02ee0a7`, `635f5ba`, and `fd3689e` keep table overflow
  local, action buttons on one row, and article filters readable across widths.
  Focused contracts pass 11/11 and admin typecheck passes. Fresh browser geometry
  at 1280/1130/1024/900/800/761/760 confirms every toolbar control has computed
  and actual height 44px, stays inside its toolbar, and causes no document,
  command-bar, or toolbar overflow. Specification and quality re-review have no
  findings; temporary ports 3010/9223/18088 are closed.

- C3 commits `c20d7b2` and `dcf214c` repair all seven classification-audit tokens
  and add a transactional shared five-section pager. The final behavior suite
  passes 13/13 and admin typecheck passes; it executes aggregation, deferred
  commit, failed-target retry, contraction/zero-result clamp, and waiting-state
  preservation. Specification and quality re-review report no remaining findings.

- C4 commits `3a1d178` and `06d655b` migrate login/dashboard theme colors,
  delegate category controls to global styles, restore >=4.5:1 light/dark normal
  text contrast, and keep KPI gradients within their semantic domains. Focused
  contracts pass 21/21, admin typecheck passes, runtime geometry has no layout
  regression, and fresh specification/quality re-review has no blocking findings.

- C5 commit `630ddb5` exports the shared cookie key, reuses `resolveApiUrl`, makes
  audio match status token-exact, and maps items through a 24-field whitelist.
  Focused contracts pass 23/23 and admin typecheck passes. Quality review found
  two Important issues: recipe loading can race submission or a later edit, and
  the whitelist contract does not execute the actual `handleEdit` behavior.

- C5 repair commit `02df27b` adds template/function submission gates, generation
  identity, and executable deferred handler tests; focused contracts pass 25/25.
  Fresh quality re-review confirmed those two findings are resolved, then found
  the remaining failure-path ambiguity: `fetchItemRecipes` catches errors as `[]`,
  so the page can still unlock and later write an empty recipe set.

- C5 final repair `2e101c9` preserves the default array contract while exposing
  strict null-on-error only to the edit page. Failed loads remain write-blocked,
  legitimate empty recipes remain savable, stale requests cannot change current
  state, and production-body contracts pass 28/28. Final fresh specification and
  quality reviews report no findings.

- D1 initial commit `a801455` consolidates 35 local trim helpers with focused
  5/5 and seven compiling checkpoints. Specification review found two blockers:
  five original Unicode-blank helpers are not equivalent to `String.trim()`, and
  seven `firstNonBlank` bodies were textually changed by qualification.

- D1 repair `d2a8782` adds the narrowly-scoped Unicode-blank variant for exactly
  five owners and restores seven firstNonBlank bodies with static import. Focused
  tests pass 10/10, compilation passes, and fresh specification/quality review
  reports no findings.

- D2 commits `4ab211e7`, `7d6457fc`, and `c86ddcd1` remove all eight naive
  controller IP parsers, inject `ClientIpResolver`, and prove seven previously
  weak paths with exact fixed-IP propagation plus URI/unique-header request
  identity. Final specification and quality reviews report no findings; the
  coordinator reran 151 targeted backend tests and compilation successfully.

- D3 commit `c13ce117` replaces the category-null envelope with an exact global
  404 and lets six local catches surface through existing 400/500 handlers.
  MockMvc 404/400/500 coverage, final specification review, final quality review,
  and coordinator test/compile validation all pass.

- D4 commit `c7835ee7` preserves no-filter blank reviewStatus semantics, adds the
  parameterized mapper filter, and removes frontend count refreshes. Backend 62/62,
  admin contracts 33/33, typecheck, and final reviews all pass.

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

- Front P2 and the light-theme button adaptation require no further merge
  action. Read `entries/2026-07-22-front-p2-local-integration.md` for the
  curated-history boundary and excluded data-audit work, and
  `entries/2026-07-22-light-theme-button-system.md` for button validation and
  residual-risk boundaries.

- Admin P1+P2 requires no further action. Read
  `entries/2026-07-18-admin-p1-p2-batch.md` only for historical context. The
  local task branch/worktree remain available for acceptance follow-up.

- Read `entries/2026-07-17-crawler-v2-per-env-activation-guard.md` before any
  crawler-monitor work. This environment routes V2; other worktrees still
  route V1 until they run `scripts/dev/crawler-v2-cutover.sh`.
- Do not run real crawler force/apply actions, Redis reset, or database writes
  without explicit operation-level authorization.
- For automated-ingestion closure, read
  `entries/2026-07-27-crawler-automated-ingestion-closure.md` and resume Task 15.
  Group CODE_READY/T1 and Task 10's authorized scope are complete. Do not execute V56/V57/V58, formal bootstrap,
  crawler/import/backfill/image-sync/apply, Owner/policy bootstrap, L1/L2/T2,
  or scheduler activation without the separate operation-level authorization
  named by the plan.

## Current Risks

- Acceptance follow-up browser checks observed intermittent failed Nuxt
  prefetches for unvisited crawler-monitor modules. The login and article
  targets had zero console errors, zero target request failures, and zero
  non-auth/non-resolver writes; the prefetch noise is unrelated to this scope.

- D6 is committed at `513ab4db` with test repair `fda1484c`; final admin gates
  pass 400/400. Runtime screenshots pass at six 1280px routes with stable-state
  zero console/network errors and no page overflow. C4's focused CSS evaluator intentionally supports only the
  repository's current syntax subset and does not model future decorative
  background layering.

- Broad Maven/full quality-gate baseline failures are outside the V2 scope.
- 6/8 local worktrees still silently route V1 until cut over; the new banner
  only appears after they merge this change.
- V1 defects (fake exit 0 on recovered processes, reducer contradiction
  swallow) remain in code but are unreachable under V2 routing.
- Real force-crawl, formal apply, live Redis expiry races, and adversarial HTTP
  preview-path acceptance remain manual/runtime concerns.
- Public category totals and representative images depend on current local
  data; their route and fail-closed contracts remain the acceptance boundary.

## Recently Closed

- `docs/devlog/entries/2026-07-22-light-theme-button-system.md`
  - branch: `main` from `feat/front-p2-integration`
  - status: `closed`
  - commit: `466146c1`; two approved light button systems and byte-identical
    interactive previews complete

- `docs/devlog/entries/2026-07-22-front-p2-local-integration.md`
  - branch: `main` from `feat/front-p2-integration`
  - status: `closed`
  - commit: `8dedd321`; curated local integration complete

- `docs/devlog/entries/2026-07-18-admin-p1-p2-batch.md`
  - branch: `fix/admin-p1-p2-batch`
  - status: `closed`
  - commit: `b778e57f`; integrated into local `main`

- `docs/devlog/entries/2026-07-18-front-p1-tail-refactor.md`
  - branch: `refactor/front-p1-tail`
  - status: `closed`
  - integration commit: `8dedd321`

- `docs/devlog/entries/2026-07-17-admin-p0-security-batch.md`
  - branch: `dev/post-merge-acceptance`
  - status: `closed`
  - commits: `e6cda9c` `f750425` `4db4df8` `462e483` `7a0a82e` `f8f9b3a` `cc287de` `ad8e9bd`

- `docs/devlog/entries/2026-07-17-v2-main-merge-integration.md`
  - branch: `main`
  - status: `closed`
  - commit: `518d9a04`

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
