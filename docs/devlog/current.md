# Current Devlog

Last updated: 2026-09-06 05:17 CST by Codex

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
- Runtime boundary: MySQL `127.0.0.1:13306` (Flyway V60), Redis `6380` (`PONG`),
  backend `18102`; the scheduler worktree's Redis DB 14 has no durable V2
  cutover state while the existing state is in DB 3. V2 automation/preflight
  reads therefore remain `409 STATE_STORE_RESET`; no reset, state copy, or
  control write was performed.
- Next agent start point: perform a fresh Phase 0 readback only under the
  parent plan's separate authorization. Do not enable scheduler runtime
  automatically.
  After this checkpoint, Phase 0 still requires a fresh readback and a distinct
  ADMIN/Owner authorization; no scheduler activation may be inferred from this
  checkpoint.
- Current risks: separate runtime authorization is still required, so runtime
  stays blocked. The reviewer-requested content-only
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
