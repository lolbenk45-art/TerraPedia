# Devlog: item-image-projection-apply-implementation

## Status

`closed`

## Context

- User goal: Execute the approved item-image projection operation implementation
  and continue the automated-ingestion closure, stopping at each exact runtime
  authorization boundary.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Base: `6d79158f`
- Related docs:
  `docs/superpowers/specs/2026-08-04-item-image-projection-apply-design.md`,
  `docs/superpowers/plans/2026-08-04-item-image-projection-apply.md`
- Related prior entries:
  `docs/devlog/entries/2026-08-04-item-image-projection-apply-design.md`,
  `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`

## Direction / Decisions

- Chosen approach: implement a new governed projection-only operation with a
  deterministic read-only proposal, private input/result evidence, exact
  transaction rechecks, and an image-only update.
- Reasoning: the canonical relation image rows own the value, while the broad
  relation sync and consumed four-layer lineage packet cannot safely own this
  fifth projection surface.
- Rejected options: widening the consumed lineage authorization, using the
  broad projection rebuild, or retaining the local item-image reverse bridge.

## Scope

- Frontend: none.
- Backend: none; existing dirty backend paths are excluded.
- Data: isolated source/test implementation only; no real DB read/write,
  crawler, network, MinIO, Shimmer, packet, permit, or service lifecycle.
- Docs/process: implementation plan, this child entry, and a scoped current
  index update.
- Out of scope: real proposal/input/request/packet/permit/apply, source flip,
  L1/L2, scheduler, push, merge, or cleanup.

## Validation

- Commands run: the ten focused Node suites in Task 9, `node --check` for all
  21 task `.mjs` source/test files, `git diff --check`, and targeted DML,
  ownership, relation-sync, armor-compatibility, and read-only audit scans.
- Results: integrated offline validation passes `155/155`; all 21 syntax checks
  pass. The only projection DML is the active-row image-only UPDATE on
  `terria_v1_relation.projection_items`; no projection INSERT/DELETE or image
  write to local/maint/landing/source relation tables exists. General relation
  sync no longer contains `SET pi.image = li.image`, while the armor-set local
  `related_items_json` compatibility path remains.
- Not run: real database proposal/read/apply, request, packet, permit, crawler,
  network, MinIO, source flip, scheduler, or service lifecycle.

## Result

- Completed: `CODE_READY`; Tasks 1-8 and Task 9's offline implementation,
  review, and validation gates.
  The governed operation now binds deterministic proposal/input/result
  evidence, exact attempt-scoped authorization artifacts, transactional drift
  checks, fail-closed readiness, and the removal of only the local item-image
  projection reverse bridge. See git for code-level diff details.
- Not completed: every authorization-gated runtime step. This code checkpoint
  does not claim item-image projection data closure or automated-ingestion
  closure.

## Residual Risks

- The dirty worktree contains many unrelated changes; staging must use explicit
  paths and preserve every existing diff.
- Shared database state can drift before a future proposal; current code work
  cannot establish a real target fingerprint or request identity.
- The independent reviewer returned material findings only after one provider
  `403 Forbidden` attempt. All accepted findings are repaired; the runtime
  target finding is resolved by coordinator arbitration described below.

## Optional: State Changes

### 2026-08-04 06:58

- Change: proposal evidence now also binds and verifies the existing lineage
  input contract path and bytes.
- Reason: the lineage completed result records exact stage counts but does not
  repeat the bundle hash; the input contract is the immutable bridge from that
  operation to the exact bundle and server fingerprint.
- Evidence: focused source inspection of the retained lineage input/result
  schemas before Task 2 implementation.

## Follow-up

- Owner: Codex in
  `docs/devlog/entries/2026-08-04-item-image-projection-apply-runtime.md`.
  Stop before any real database read until the exact read-only proposal Owner
  authorization is recorded.

## Commits

- `commit SHA pending in final response`.

## Optional: Multi-Agent Coordination

- Coordinator: Codex (`/root`).
- Parallel work allowed: review only; implementation writes are serialized.
- Agent ownership: an independent reviewer may inspect the completed plan or
  code but may not edit source, tests, devlog, data, or runtime state.
- Shared files or state: coordinator alone owns every file in this entry and
  `docs/devlog/current.md`.
- Parent entry:
  `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`.
- Serialization rule: no concurrent implementation writers.
- Result merge owner: Codex.
- Cross-boundary validation: focused offline Node suites plus final independent
  spec/security review.

## Optional: Cross-Review

- Reviewer: `/root/shimmer_task6_confinement_rereview` (read-only plan audit).
- Scope: approved design, implementation plan, current helper/catalog/manifest/
  runner entrypoints, authorization and readiness boundaries.
- Findings: ten Important gaps plus expiry coverage: missing separately bound
  private snapshot artifact; incomplete production read-only transaction/gate;
  incomplete completed-lineage validation; managed-prefix policy not bound by
  source/config hash; ambiguous child failed-result versus outer runner failure
  semantics; no explicit CODE_READY versus data-closed handoff; no real
  readiness loader path test; one incorrect private-path helper symbol;
  ambiguous one-database operation ownership versus three-database global
  fingerprint; incomplete dynamic dependency code bundle; and missing expired
  input rejection before DB/auth/connect.
- Disposition: active; plan and RED tests are being repaired serially.
- Re-review required: yes.
- Resolved by: Codex.
- Arbitration decision: none pending; all findings accepted as plan defects.
- Decision owner: Codex.
- Rationale: each finding strengthens the approved fail-closed design without
  widening projection DML scope or runtime authorization.
- Remaining risks: commit remains blocked until every repair is implemented,
  validated, and independently re-reviewed.

### 2026-08-04 07:32

- Reviewer finding: Critical live-ledger self-invalidation. Freezing the whole
  used-decisions ledger would always drift when the generic runner consumes the
  new projection decision before child spawn.
- Disposition: accepted. The proposal will validate the historical lineage
  decision once and freeze only its immutable decision/dispatch-permit hashes;
  the live ledger is excluded from projection input, authorization data bundle,
  and apply preflight. Commit remains blocked pending regression and re-review.

### 2026-08-04 07:36

- Reviewer findings: fixed no-overwrite artifact paths made a failed attempt
  impossible to retry; static catalog data paths could not bind one dynamic
  attempt input; retained packet validation did not explicitly recompute its
  canonical content hash; projection relation keys were not required to match
  source relation record keys; runtime connection fields lacked an explicit
  target-fingerprint regression; and the durable ownership change was missing
  from `00_CURRENT_SPEC.md` scope.
- Disposition: accepted. The plan now defines an immutable attempt root derived
  from the read-only Owner decision, a verified-manifest dynamic input root,
  exact packet-content and row-key regressions, runtime connection binding, and
  a current-spec ownership update. A failed attempt is retained; retry requires
  a distinct read-only decision and full fresh authorization chain. Commit
  remains blocked pending re-review and RED/GREEN implementation.

### 2026-08-04 07:45

- Re-review findings: the plan still named a fixed snapshot constant; readiness
  had no deterministic dynamic-attempt selector; the generic runner's current
  canonical-root permit path contradicted attempt confinement; proposal could
  accept an arbitrary used-decisions ledger path; and historical packet content
  verification was ambiguous about current expiry.
- Disposition: accepted. The plan now exposes only decision-derived attempt
  paths, requires a confined readiness `--attempt-root`, adds operation-specific
  packet/permit same-attempt enforcement through the runner/context helper,
  fixes the durable ledger path, and validates historical packet content
  without applying the current clock to an already completed lineage packet.
  Commit remains blocked pending fresh re-review and implementation.

### 2026-08-04 07:49

- Re-review finding: runner-side same-attempt checks did not constrain the
  generic authorization CLI before it wrote the formal request or packet, so a
  caller could still place those artifacts outside the attempt root.
- Disposition: accepted. Task 5 now requires verified-manifest-derived exact
  request/packet output paths and no-file-created regressions for outside-root,
  cross-attempt, symlinked, legacy, and absolute outputs. Commit remains blocked
  pending fresh re-review and implementation.

### 2026-08-04 07:52

- Re-review finding: the read-only Owner authorization derived the attempt but
  was not frozen into the proposal/input or expanded formal data bundle, so its
  retained bytes could drift without apply preflight noticing.
- Disposition: accepted. The plan adds exact `proposalAuthorization` path,
  byte-hash, decision, and authorization-hash binding through proposal, input,
  results, manifest data bundle, and apply preflight. Historical expiry does not
  invalidate already-created proposal evidence; any content or identity drift
  does. Commit remains blocked pending re-review and TDD implementation.

### 2026-08-04 08:02

- Implementation state: Tasks 1-4 contract/proposal/DB/apply sources and tests
  now share the read-only Owner decision-derived attempt contract. Fixed
  proposal/input/snapshot/result exports and reader defaults were removed;
  exact basenames, not-yet-valid/expired windows, proposal authorization bytes,
  historical packet content, immutable lineage permit hash, row mappings,
  transaction order, and terminal results are covered. See git for code-level
  diff details.
- Validation: focused offline integration passes `22/22`; all four source
  syntax checks and `git diff --check` pass. No database, network, packet,
  permit, or runtime action ran.
- Review state: Tasks 1-4 remain `active` and commit-blocked pending fresh spec
  then quality review; Tasks 5-9 have not started.

### 2026-08-04 08:09

- Independent spec review: Task 5's dynamic-import gate only rejected relative
  imports; Task 4 treated the expanded data-bundle validator as optional; and
  apply checked snapshot SHA/schema without comparing all snapshot content to
  the frozen input/proposal.
- Disposition: accepted. The plan now rejects every dynamic import form,
  requires the production bundle validator before connection/permit/DML, and
  requires full snapshot reconstruction comparison. Commit remains blocked
  until RED/GREEN repair and fresh review.

### 2026-08-04 11:46

- Coordinator final review finding: Important production runner sequencing
  defect. The static preflight ran before decision consumption and permit
  creation but called the dispatch helper that already required the projection
  packet and permit paths, so the real operation could never reach dispatch.
- Disposition: accepted and repaired RED/GREEN. Static technical preflight now
  validates the exact attempt manifest/output without requiring future permit
  bytes; child dispatch still requires exact same-attempt packet and permit
  paths. The runner suite passes `24/24`; the full focused matrix passes
  `152/152`.
- Re-review: the existing read-only external reviewer was retriggered. Its prior
  attempt failed with provider `403 Forbidden`; no external-pass claim is made
  unless the retriggered review returns successfully.

### 2026-08-04 12:07

- Independent review findings: readiness CLI aborted on invalid attempt
  evidence; terminal results did not compare their input hash to actual input
  bytes; formal authorization and apply disagreed on lineage evidence privacy;
  supplied manifest verification did not rerun the dynamic-import scanner; and
  the exact permit writer did not itself enforce path confinement.
- Disposition: accepted and repaired serially with RED/GREEN regressions.
  Missing/malformed readiness evidence now produces explicit gaps; completed
  and failed results bind actual input bytes; lineage input/result/apply
  snapshot privacy is consistent; supplied manifests rerun the token-aware
  scanner; and exact permit output is confined with symlink-parent rejection.
- Runtime-target finding arbitration: partially accepted. The pure contract now
  requires the exact formal `terria_v1_local`/`terria_v1_maint`/
  `terria_v1_relation` triplet before connection. The apply entrypoint already
  connects using the frozen host/port and fully qualified frozen database names;
  the approved transaction order intentionally checks `@@server_uuid` after
  both row locks and before permit consumption/DML. A second runtime-config
  source would weaken rather than strengthen that frozen target contract.
- Re-review result: coordinator inspection of every repair plus fresh focused
  integration `155/155`, 21 syntax checks, ownership scans, and diff checks
  found no unresolved Critical or Important finding. No runtime action ran.
