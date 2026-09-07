# Current Devlog

Last updated: 2026-09-07 21:25 CST by Codex

Active branch: `feat/automation-scheduler-continuation` (scheduler handoff worktree)

## Active Scheduler Handoff

- Entry: `entries/2026-08-31-automation-scheduler-activation-handoff.md`; owner:
  Codex; status: `active`; branch:
  `feat/automation-scheduler-continuation`; worktree:
  `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`;
  parent: `entries/2026-08-27-eight-domain-l2-execution-continuation.md`
  (closed at `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`).
- Child entry `entries/2026-09-03-source-dispatch-identity-repair.md` is closed
  in checkpoint `6341f8f0fda8479d5af6816ed84c034c8611c0b9`; its contract
  handoff remains canonical `sourceFingerprint/sourceRunIdentity/sourceContentIdentity`.
- Current state: P1 retained-lock and successor-alert safety is accepted after
  five RED-GREEN assertions, monitor `283/283`, fresh specification review,
  and fresh code-quality review. The cleanup failure fence now preserves the
  current successor state while emitting one deduplicated CRITICAL alert for
  the original dispatch. The Java V2 producer's returned origin/launch/
  recovery/manual-coexistence findings have RED-GREEN repairs in the current
  worktree. The latest cancel/recovery repair moves the reconciler identity
  gate ahead of progress ingestion and makes recovery validate immutable
  manifest identity before cancel adoption. The retry repair now reads the
  authoritative queue/prior attempt before Lua dispatch and Lua atomically
  repeats exact ownership-pair/source-identity checks before writes. Fresh
  focused Java validation is `312/312`, zero failures/errors
  (`5 + 24 + 51 + 61 + 37 + 2 + 92 + 40`). Fresh independent specification
  review approved the persisted retry repair with no findings. Code-quality
  review also approved it with no findings. The Node consumer now re-reads the
  exact source-monitor state immediately before live acknowledgement; its
  identity tests are `99/99` and the full automation suite is `956/956`. The
  returned Node specification findings now have six observed RED-GREEN
  regressions: both acknowledgement paths check source state before their final
  activation identity/time guard, Base reads its final source fingerprint before
  that guard, Supplementary fences preview publication before source/bundle
  writes, and manual identity-bearing environment/bundle/operation inputs fail
  closed. The affected Node suite is `210/210`, full automation is `965/965`,
  and Java producer validation is `312/312`. The returned Node code-quality
  findings are repaired: the shared monitor-state reader now requires a
  repository-confined ordinary file, opens the leaf with `O_NOFOLLOW`, and
  rechecks file identity around the read; it rejects leaf/ancestor symlinks and
  replacement races. The Supplementary initial reader is now inside the
  source-identity terminal-progress handler. Fresh independent Node
  specification and code-quality reviews approved the repair with no findings.
  Fresh coordinator full Node automation (`965/965`) and Java producer
  (`312/312`) reruns passed; the child is closed in checkpoint `6341f8f0`.
  Runtime operations remain blocked.
- Contract handoff: H8
  `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`;
  eligible domains
  `items,npcs,projectiles,armor_sets,buffs,audio,bosses,shimmer`; global
  readback
  `sha256:34af46aacb92d171c232128712c47641cbb3882a689ae0fd18195302184445e0`.
- Runtime boundary is MySQL `127.0.0.1:13306` (Flyway V60), Redis `6380`
  (`PONG`), and backend `18102`. The scheduler worktree's DB14 was aligned
  from the matching DB3 V2 prefix without changing DB3; fresh API preflight is
  HTTP `200` with H8 identity, zero live attempts/claims, and a healthy
  reconciler. Phase 0 remains blocked because persisted control is
  `enabled=true`, all eight readiness rows are stale/blocked, and no current
  H8 qualifying L1 runs/full reconciliation exist. No scheduler control,
  source refresh, crawler/import, or business-table write has occurred.
- Next agent start point: perform a fresh Phase 0 readback only under the
  parent plan's separate authorization. Do not enable scheduler runtime
  automatically.
  After this checkpoint, Phase 0 still requires a fresh readback and a distinct
  ADMIN/Owner authorization; no scheduler activation may be inferred from this
  checkpoint.
- Phase 1 evidence catalog was re-run against the linked ingestion worktree on
  2026-09-06. The current helper passed `20/20` tests and produced exactly
  `185` entries (`131/45/4/4/1`) at the private retry-02 path
  `.local/tmp/automation-evidence-catalog-scheduler-activation-20260906-retry-02.json`
  with mode `0600` and logical SHA
  `sha256:1e4bd9b5a8d596f962799aba4ff0dc5863ee22d5baa10153f686eb8ec0d2704e`.
  The historical fixed catalog path was already occupied and was not
  overwritten.
- Phase 2 offline activation-contract tests were rerun on the resumed session:
  `108/108` passed. A fresh Phase 0 baseline is recorded at
  `.local/tmp/automation-scheduler-baseline-scheduler-activation-20260906-retry-04.json`;
  the authenticated collector failed closed at `preflight requires disabled
  automation` before publication.
- Runtime verification at 20:25 CST passed `verify-local-stack.sh --skip-front`
  (database TCP, mapper XML, backend compile, and admin typecheck). No new
  API or data mutation was performed.
- On 2026-09-07 the canonical startup command was re-run and stopped at the
  MySQL TCP preflight because `127.0.0.1:13306` refused the connection;
  Redis `6380` and backend `18102` are also currently down. No runtime
  mutation occurred. An administrator must start the existing MySQL instance
  before the stack and fresh Phase 0 readback can continue.
- MySQL was subsequently restored by the operator. The stack is now healthy
  with the backend bound to the primary durable V2 marker root and scheduling
  disabled. The authorized control PUT is read back as
  `enabled=false/mode=changed-only/interval=1`.
- Governed readiness refresh wrote 32 fresh reports for the eight target
  domains; fresh preflight is `8/8 eligible`, H8 remains unchanged, live work
  is zero, and the reconciler is healthy. Phase 3 proposal/request/manifest
  artifacts are generated under retry-01; the request remains
  `AWAITING_OWNER`. No scheduler enable, Owner packet/decision, sweep,
  source probe, crawler/import, or business-table write occurred.
- The backend evidence-root repair is now implemented in
  `DomainAcceptanceServiceImpl`: Spring runtime consumes the configured
  `terrapedia.crawler.queue-v2.repo-root` before Maven CWD discovery, while
  explicit test overrides remain highest priority. The RED-GREEN regression
  and related controller/preflight tests pass `29/29`.
- The focused code checkpoint is `5bdd2fc8` (`fix(scheduler): bind configured
  evidence roots and retry manifests`). Runtime reports and authorization
  artifacts remain intentionally untracked and outside the checkpoint.
- After backend restart, monitor readback reports `repoRoot=/home/lolben/TerraPedia`.
  A governed primary-root refresh regenerated 32/32 target panels at
  `2026-09-07T13:21:24.667Z` (`pass=32`, `warning=0`, `blocked=0`). Retry-03
  preflight is self-consistent with H8, 8/8 eligible, zero live work, and all
  no-write flags. Preflight hash:
  `sha256:6834da54d50b64296b13eeb56713f8c0c08d13b334d809fba82b07973b480305`.
- Retry-03 proposal/request are self-hash-consistent and remain
  `proposalOnly=true`, `enabled=false`, `AWAITING_OWNER`; request hash is
  `sha256:57e3fa5e1d3914a8e76e4eed1e56d140728bf4ba86060b0e7f0dc18708571f99`.
  The scheduler execution-manifest CLI now accepts a retry label only for this
  proposal operation and binds retry-03 preflight/proposal paths exactly;
  retry-03 manifest is therefore structurally consumable after separate Owner
  authorization. Retry-01/02 remain retained historical artifacts and are not
  consumable.
- Current risks: MySQL and the local stack are currently reachable, but the
  existing system MySQL still requires administrator ownership to recover after
  a stop. Separate runtime authorization is still required even with healthy
  services. The
  reviewer-requested content-only
  post-apply and committed/DRY_RUN acknowledgement permutations remain a
  residual coverage consideration beyond the new pre-publication content-drift
  and normal acknowledgement-race regressions. No natural source-change-to-
  database run has occurred; the
  structured L2 diff producer and shared-`npcs` scope remain code/test evidence
  until fresh live policy-scope readback and a separately authorized canary;
  the 185 private evidence files stay unchanged in the linked ingestion
  worktree.

## Recently Closed

- `entries/2026-09-03-source-dispatch-identity-repair.md`: reviewed source-
  dispatch identity child closed in `6341f8f0`; runtime phases remain
  unauthorized.
- `entries/2026-08-27-eight-domain-l2-execution-continuation.md`: eight-domain
  L2 promotion chain closed at `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`.
