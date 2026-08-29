# Ten-Blocker Local Closure Design

## Goal / 目标

Close the ten independent root blockers recorded in
`reports/runtime/local-data-chain-closure/20260824/fresh-042509/residual-blockers.json`
without weakening evidence rules or replaying a consumed authorization.

关闭 `residual-blockers.json` 记录的 10 个独立根阻断，同时不降低证据标准、
不重放已消费授权。

The parent task is complete only when a fresh closure index reports zero root
blockers, the full local quality gate exits `0`, and an independent plan-auditor
review has no blocking finding.

## Boundaries / 边界

In scope:

- local-only Item evidence discovery and exact classification;
- canonical NPC terminal reconciliation from the immutable T2 Git anchor and
  existing frozen crawler evidence, without recreating private authorization
  bytes;
- one fresh six-identity NPC relation restoration/retirement/projection repair;
- separate Item, NPC, Projectile, Armor-set, and Biome image ownership repairs;
- immutable Boss and Shimmer terminal-result reconciliation;
- stack restart/readback and all final gates.

Out of scope:

- external Wiki, Steam, forum, or arbitrary network access;
- fabricated Item source facts or synthetic authorization history;
- direct SQL, broad table synchronization, or unbounded crawler execution;
- replay of owner-05, owner-06, or any consumed permit;
- production/L2 writes, worktree cleanup, staging, commit, or unrelated edits.

## Starting Facts / 起始事实

| Root blocker / 根阻断 | Current fact / 当前事实 | Closure owner / 修复归属 |
| --- | --- | --- |
| Item source evidence / 物品来源证据 | `accepted=0`; 2,354 rows are fully partitioned | Item-source lane |
| NPC terminal relation loss / NPC 终态关系丢失 | the private input stays absent; immutable T2 readback proves 1,270 Buff relation rows were lost | NPC/Buff reconciliation lane |
| NPC loot identity / NPC 掉落身份 | six active relations come from the legacy Item bundle; the canonical NPC-bundle source/fact/maint chain remains active | NPC relation/projection lane |
| Item image / 物品图片 | relation is managed; projection/evidence set drifted | Item image lane |
| NPC image / NPC 图片 | 758 relation images; projection values are not managed | NPC image lane |
| Projectile image / 弹幕图片 | 1,110 relation images; projection values are not managed | Projectile image lane |
| Armor-set image / 套装图片 | audit sees zero core/projection evidence | Armor adapter lane |
| Biome image / 生物群落图片 | 40/47 projection URLs use legacy `localhost:9000` | Biome image lane |
| Boss result / Boss 回执 | readback passes; owner-05 has no immutable terminal result/counts | Boss reconciliation lane |
| Shimmer result / 微光回执 | committed/readback passes; owner-06 lacks exact changed counts | Shimmer reconciliation lane |

## Architecture / 架构

The repair is serial and fail-closed. Each mutation lane has its own operation
ID, immutable source snapshot, ordered target keys, database fingerprint,
before/after hashes, proposal, owner decision, packet, one-time permit,
transaction result, and independent readback. A proposal is never an apply
artifact. A permit belongs to exactly one proposal hash and cannot be reused.

修复按 lane 串行执行并默认阻断。每个写入 lane 都拥有独立的 operation ID、
不可变源快照、排序目标 key、数据库指纹、前后哈希、proposal、Owner decision、
packet、一次性 permit、事务 result 和独立 readback。

### Phase A: Local evidence recovery / 本地证据恢复

1. Preserve the missing canonical NPC private input. Reconcile current state
   from the exact immutable terminal T2 Git object and the frozen 25-target
   landing/maint set; do not recreate prior authorization bytes.
2. Search raw, generated, maint, relation, and local evidence for Item source
   identities. Existing rows may be reclassified only when exact Item identity
   and source trace are proven. Otherwise they remain terminal quarantine or
   blocker rows.
3. Recover Boss/Shimmer changed-row counts only from immutable execution logs,
   transaction snapshots, or before/after hashes. Current table counts alone
   are not historical changed-row counts.

### Phase B: Exact repair operations / 精确修复操作

- NPC Buff relation recovery is Buff-owned and may insert only the exact 1,270
  relation rows regenerated from current maint NPC/Buff evidence. The existing
  local tuples are equivalence evidence only and are never copied upstream.
- NPC loot owns only six exact identity transitions: insert the missing
  canonical NPC-bundle relation row, retire the active legacy Item-bundle
  relation row, and replace the matching projection loot-array element. Local
  rows, source facts/details, maint rows, and landing rows are read-only.
- Item image is evidence/classification-only unless a fresh relation/projection
  readback proves a real row-value delta. Current live rows already match
  exactly, so stale or invalid apply evidence must not be converted into a
  fabricated DML proposal.
- NPC image owns only `projection_npcs.image_url`. For the current 758 proven
  objects it may replace the trusted legacy `localhost:9000` origin with the
  identical origin-free `/terrapedia-images/npcs/...` path; four missing
  identities remain quarantine. It must not copy or modify relation rows.
- Projectile image owns only `projection_projectiles.image_url`. For the
  current 1,110 proven objects it may perform the same exact origin-free path
  normalization; the one missing identity remains quarantine.
- Armor-set recovery first restores exactly the current 63 relation-backed
  `projection_armor_sets` rows. The historical 88-row projection is backup
  evidence only and is not an authority. Image-array readiness is evaluated
  only after the canonical projection exists; any later image mutation needs a
  separate evidence-bound operation and must not invent cached URLs.
- Biome image owns the exact 40 legacy-origin `projection_biomes.icon_url`
  values and may derive only the identical origin-free
  `/terrapedia-images/items/...` object paths already present in those rows.
  It must not refresh source timestamps, relation rows, or image bytes.

### Phase C: Consolidated authorization / 汇总授权

All fresh proposals are generated before any permit is consumed. The operator
receives one bilingual table containing operation ID, decision identity,
target database/table/columns, row count, scope hash, proposal hash, rollback
behavior, and expected readback. One confirmation authorizes only those exact
proposals. Any drift invalidates the affected proposal and requires a new
freeze; it does not broaden the authorization.

### Phase D: Apply and closeout / 执行与收口

Apply one lane at a time. After every transaction, perform a separate readback
before starting the next lane. Unknown outcomes are reconciled from the
database and result path; they are never blindly retried. Restart/reuse the
local stack only after all known writes are terminal, then run source-chain,
cross-DB, relation health, image lineage, smoke, Maven, Admin, Public, quality
gate, and final plan audit.

## Item Source Decision / Item 来源决策

The no-network rule remains authoritative. The local investigation can close
the Item blocker only if repository/database evidence already contains at
least one exact Item identity with a complete accepted trace. If it does not,
the task must report that this one root cannot be truthfully removed under the
current boundary. It must not create an empty or fabricated Item apply.

## Failure Handling / 失败处理

- Hash/key/count drift: discard only the fresh proposal attempt and rebuild a
  new freeze; do not edit or reuse the old attempt.
- Missing local evidence: quarantine with exact identity and reason.
- Permit already used or revoked: create no retry from it.
- Unknown transaction result: read back target keys and operation ledger before
  deciding whether a new operation is needed.
- One lane failure: stop database mutation, preserve terminal evidence, and
  continue only read-only diagnosis for other lanes.
- Test failure: perform one minimal owning-lane TDD repair, rerun the focused
  test, then report the blocker if it still fails.

## Validation / 验证

Required evidence:

1. focused contract tests for every added or changed operation;
2. exact transaction result plus independent key-level readback for each write;
3. fresh Item partition, NPC source/domain/runtime audits, and image lineage;
4. fresh Boss/Shimmer reconciled immutable results;
5. cross-DB integrity, relation health, and local core smoke;
6. backend Maven, Admin, Public, and full local quality gate;
7. closure index hash validation and independent plan-auditor review.

## Approval / 批准

The user approved this design as Scheme A on 2026-08-24. The approval permits
implementation, freeze, and proposal generation. Database mutation still
requires the consolidated exact-proposal confirmation described above.
