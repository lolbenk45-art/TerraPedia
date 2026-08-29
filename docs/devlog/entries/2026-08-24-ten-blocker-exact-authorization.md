# Seven-Operation Exact Authorization / 七项操作精确授权确认

## Status / 状态

`blocked`

This document is the single database-write decision point for the current
ten-blocker closure. It does not itself execute a write.

本文档是当前十阻断闭环唯一一次数据库写入决策点；填写或阅读本文档本身不会写库。

## Plain-Language Terms / 专有名称白话解释

| Term | English | 中文白话 |
| --- | --- | --- |
| Proposal | Frozen description of the exact rows that would change; it cannot write the database. | 冻结的“准备改哪些行、改前改后是什么”的清单，本身不会写库。 |
| Operation ID | Permanent program name for one narrowly owned kind of change. | 某一种窄范围修改的固定程序名。 |
| Decision ID | Unique approval number; it prevents one approval from being reused for another run. | 本次批准的唯一编号，防止批准被拿去重放别的执行。 |
| Scope SHA-256 | Fingerprint of target keys, before/after state, database identity, and boundaries. | 目标 key、改前改后、数据库身份和边界的指纹。 |
| Proposal SHA-256 | Fingerprint of the exact proposal file bytes. | 整份 proposal 文件原始字节的指纹。 |
| Physical rows | Number of actual table rows inserted or updated. | 数据库中实际插入或更新的行数。 |
| Permit | One-time transaction token, generated only after approval and consumed inside the locked transaction. | 批准后才生成的一次性事务令牌，只能在锁定事务内消费一次。 |
| Independent readback | A separate SELECT after commit that compares every target key with the approved after-hash. | 提交后另开只读核对，逐个目标 key 对比批准时的改后哈希。 |

## Exact Batch / 精确批次

- Database / 数据库: local MySQL server UUID
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, target database
  `terria_v1_relation`.
- Total physical rows / 实际写入总行数: `3921`.
- Network access / 外网访问: forbidden / 禁止.
- Direct SQL / 直接 SQL: forbidden / 禁止; only registered canonical runners.
- Execution order / 执行顺序: the seven rows below, serially from `1` to `7`.
- Transaction fence / 事务保护: lock and compare the exact before-set, then
  consume the one-time permit, write, compare the after-set, and commit. Any
  pre-commit mismatch rolls back and stops the batch.
- Unknown outcome / 未知事务结果: stop and reconcile from result path plus
  independent database readback; never retry blindly.
- Batch binding SHA-256 / 整批绑定指纹:
  `sha256:bf56a7b9446d18c06188b2387d05c82874a00f646e29037f353e864c986cefcf`.
- Independent rebuild evidence / 独立重建证据:
  `reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/proposal-independent-rebuild-v2.json`,
  byte SHA-256
  `sha256:46f363bee59b9cf2c58b9c9dd9419ab1704fbfb4b6f21d1657852d6d70c02005`.

## Operations / 操作明细

| # | Operation / 操作 | Exact change / 精确修改 | Physical rows / 实际行数 | Decision ID / 决策编号 |
| ---: | --- | --- | ---: | --- |
| 1 | NPC Buff relation recovery / NPC Buff 关系恢复 | Insert the exact 1,270 maint-derived rows into the currently empty `npc_buff_relations`; local tuples are comparison evidence only. / 向当前空表插入 1,270 条由 maint 推导的关系；local 只作等价核对，不反向复制。 | 1270 | `canonical-npc-buff-relation-recovery-20260824-owner-07` |
| 2 | NPC loot identity restoration / NPC 掉落身份恢复 | For six identities: insert six canonical relations, retire six legacy relations, replace six NPC projection array elements. / 六个身份各执行：插入 canonical 关系、退役旧关系、替换 NPC 投影数组元素。 | 18 | `canonical-npc-loot-identity-restoration-20260824-owner-08` |
| 3 | Item image origin normalization / 物品图片来源地址规范化 | For 331 identities, remove only trusted `localhost:9000` from both relation `cached_url` and projection `image`; keep 15 legacy-only identities quarantined. / 对 331 个身份，仅从 relation 与 projection 两侧移除可信旧域名；15 个仅投影旧身份继续隔离。 | 662 | `canonical-item-image-origin-normalization-20260824-owner-09` |
| 4 | NPC image origin normalization / NPC 图片来源地址规范化 | Remove only the trusted old origin from 758 existing `projection_npcs.image_url` values; four missing identities stay quarantined. / 仅规范化 758 条现有投影图片地址；4 个缺图身份继续隔离。 | 758 | `canonical-npc-image-origin-normalization-20260824-owner-10` |
| 5 | Projectile image origin normalization / 弹幕图片来源地址规范化 | Remove only the trusted old origin from 1,110 existing `projection_projectiles.image_url` values; one missing identity stays quarantined. / 仅规范化 1,110 条现有投影图片地址；1 个缺图身份继续隔离。 | 1110 | `canonical-projectile-image-origin-normalization-20260824-owner-11` |
| 6 | Biome image origin normalization / 生物群落图片来源地址规范化 | Remove only the trusted old origin from 40 `projection_biomes.icon_url` values; seven already-correct controls remain unchanged. / 仅规范化 40 条旧域名地址；7 条已正确的对照行保持不变。 | 40 | `canonical-biome-image-origin-normalization-20260824-owner-12` |
| 7 | Armor projection restoration / 套装投影恢复 | Insert exactly 63 current relation-backed Armor projections into the empty table; do not restore the obsolete 88-row backup. / 向空投影表插入当前 relation 推导的 63 条套装；不恢复过时的 88 条备份。 | 63 | `canonical-armor-set-projection-restoration-20260824-owner-13` |

## Hash And Readback Bindings / 哈希与回读绑定

| # | Scope SHA-256 | Proposal SHA-256 | Expected after-readback / 预期改后回读 |
| ---: | --- | --- | --- |
| 1 | `sha256:bf0f0674edbc2ff9b0b8d1917d924f6f1d86e03ca052b71b88e4aa84f19365cc` | `sha256:8bca37734b271f52a3de83719c34cbc5d241853e7048953e62bb8e8599f33cd3` | 1,270 rows; `sha256:96109a7d338d4b122cd71e7f1a1c947cb818687324a036ea1c8f6ea826cb7bc9` |
| 2 | `sha256:b88dd7eedc5ca39292a4a1399600603bbc9531a27e25fe8febffc253e4273595` | `sha256:1f23a7f5dcdd0c5fe4a5f2db8a58b266c8902ce23cc64ac953c66c7dd05e8383` | Exact 6/6/6 sets; `sha256:89011c401f2f31d30e9ceb4f4c00884204411de53ab56c8bdcd96465a86600cd` |
| 3 | `sha256:2819897d7dcebeb6cd85cfc047513819296596263c5d49446d1a51ef583bafb3` | `sha256:56716d02dabeb8a0ebeade7f65454b3f65b56eefc219454b7809dab89a2d08e5` | Projection `sha256:c00586fc3694c30e802209e2192b22cbcf0c1d78f0176116fa20fa04ba44a1d6`; relation `sha256:02402d3cba5c4d9af820bc3c9dcc1f671b588eeb8512a83715ca33c18a1cdd31` |
| 4 | `sha256:761d32c524d5961f9b32adbf8a9a3c7105b155ba31fa2eba9e45cc449cf414b4` | `sha256:a117c436fd8fb3221c3db05e6f89c809242a1684129a6a509e591cb83857f8ec` | `sha256:9c1909b5ef8143951c647ebe71d7a351e9b5d73d52a2b3405c1deae33a0df2dc` |
| 5 | `sha256:3b744355ef387f815677c00c83d0e725140a7241ba90f8b0461b525bd24eaa19` | `sha256:75783487ac5a87a962953d8ccf5d6c08554b2222d6d9823917d120d081f6ecf9` | `sha256:d6534859a397f525771d0b016a2ee428f6ae5b3233bd94d1d5c5a4c522e3e85f` |
| 6 | `sha256:48e5b339c6a5332b2e7e07bb802818dd705a9fc2249415028911c18bee9d88af` | `sha256:8b8da96eca2d6a228bc9b550b22bd90d361680f0bf7f9aaf5b41f5df1924d043` | `sha256:47d1c54ca89a8b453b368f1acf77d6275d33ec8878277a1b0e61a7c0c152c340` |
| 7 | `sha256:a9c56991e479d6be915bbbe7a925d47da57220b83a4d8439c6e21be862bcb1bd` | `sha256:361ae4c78ca75ce2974f9537ab1c76e9d6b9494960ceabfa99ecb79ff6470ba1` | 63 rows; `sha256:186b03dd074594fc343f29f5dfd2e8fc7589b7f3973bc2f0b1b553c8c417f1f7` |

## Preserved Buff History / 保留的 Buff 历史文件

The following fixed-name files are stale historical technical artifacts. They
must not be overwritten, used for authorization, or deleted:

以下固定名文件是过期的历史技术材料，不得覆盖、用于本次授权或删除：

| Path / 路径 | Byte SHA-256 |
| --- | --- |
| `reports/authorization/canonical/canonical-npc-buff-relation-recovery.input.json` | `sha256:ecc1d4098ea47f8ce17c984fbc4e3d76e9bbdd69fef1c1bb7b6a5f883c3dff6f` |
| `reports/authorization/canonical/canonical-npc-buff-relation-recovery.execution-manifest.json` | `sha256:a99710db85383b66dc73f8b7bd25091c0a8cd24bb86207c59d9008f20e40812d` |
| `reports/authorization/canonical/canonical-npc-buff-relation-recovery.request.json` | `sha256:36c5de0e77d174aadec565926b6edca2eee0aeaad0c4be5581996ca99628077a` |

The current Buff attempt will use
`canonical-npc-buff-relation-recovery.retry-01.{input,execution-manifest,request,result}.json`.
None of those files may exist before approval.

本次 Buff 将使用上述 `.retry-01.*` 文件；批准前这些文件必须全部不存在。

## Owner Decision / Owner 决策

Prefilled technical fields / 已代填技术字段：

- Actor / 批准人: `Owner (user)`
- Reason / 原因: `Close the seven exact local data-chain blockers using the frozen proposals and serial governed readback.`
- Authorization reference / 授权引用:
  `devlog://2026-08-24/ten-blocker-exact-authorization`
- Scope / 范围: only the seven proposal hashes and decision IDs in this file.
- Excludes / 不包含: Item external-source fabrication, network requests,
  production/L2 writes, direct SQL, cleanup, staging, commit, or permit replay.

Choose exactly one / 只选一项：

- [x] `APPROVE_ALL_EXACT_PROPOSALS` / 批准以上七项精确 proposal
- [ ] `REJECT_OR_REVISE` / 拒绝或要求修改

Owner confirmation received / 已收到 Owner 确认:

- Confirmed at / 确认时间: `2026-08-24 11:53 CST`
- Exact reply normalized across the line break / 换行合并后的精确回复:
  `APPROVE_ALL_EXACT_PROPOSALS sha256:bf56a7b9446d18c06188b2387d05c82874a00f646e29037f353e864c986cefcf`
- Pre-write read-only snapshot / 写入前只读快照: all seven proposal byte and
  scope hashes match, physical rows total `3921`, server UUID matches, no other
  InnoDB transaction is active, and every approved before-count matches.

Exact approval reply / 精确批准回复：

```text
APPROVE_ALL_EXACT_PROPOSALS sha256:bf56a7b9446d18c06188b2387d05c82874a00f646e29037f353e864c986cefcf
```

Any other approval wording, any changed hash/count/key, or any proposal drift
does not authorize DML. The affected proposal must be frozen again and returned
for confirmation.

任何其他措辞、哈希/行数/key 变化或 proposal 漂移都不授权写库；受影响 proposal
必须重新冻结并再次确认。

## Execution Update / 执行更新 (2026-08-24 12:45 CST)

- Owners 07-12 completed with independent readbacks matching their approved
  after hashes. No retry or permit replay occurred.
- Owner 13 (Armor) stopped before permit consumption and INSERT because the
  locked source snapshot changed after the Item image operation. The old
  proposal remains historical and is not executable.
- A new read-only Armor proposal was frozen at
  `reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/armor-set-projection-restoration.retry-02.proposal.json`:
  source snapshot `sha256:7383382e906cd3cb735aa164718fd49c077c6558f9cedefc0b9557ab99b291b1`,
  proposal bytes `sha256:f2b5740f5a6ed15098095c390140e46fae7d1efe0cb0d2705508c113cd3d0ff4`,
  scope `sha256:6052f70a743d1bdaa30eba8749ef23d031cc13150ee08abfb3c78d986ba4c930`,
  and 63 insert-only rows. It has no authorization, packet, permit, or DML.
- Fresh NPC readiness was regenerated with the current local API token and
  now passes; `support.town_npc_maintenance` is pass. The acceptance crawler
  wrapper was repaired to import the source-layout checker from the repository
  root through a file URL, with a regression test.
- Fresh acceptance is `19/19` pass, including cross-DB `10/10`. Contract tests
  are `336/336` and automation tests are `189/189`.
- Quality gate stops at domain acceptance because one global reresolve report
  is consumed by six domains. Its 63 unresolved rows were created on
  2026-08-23, while the previous report is the unrelated 2026-05-24 baseline
  of 34. This is one shared trend blocker, not six independent repairs. The
  43 auto-matched candidates and 20 manual-review rows remain read-only; no
  candidate apply was authorized.

## Current Blockers / 当前阻断

1. New Armor exact owner approval is required for the retry-02 proposal above.
2. Reresolve trend needs a fresh comparable baseline or a separately approved
   candidate operation; do not fabricate a historical report or apply the 43
   candidates without exact authorization.

## Historical Continuation Update / 历史继续更新 (2026-08-24 13:41 CST)

The following checkpoint is retained as historical evidence and is superseded
by the final 16:49 CST continuation update below.

- Fresh read-only acceptance completed `19/19`; cross-DB is `10/10`, core
  smoke is `OK: true`, and domain acceptance dry-run is `47/47 pass` with zero
  warnings or blocks. The latest reresolve report is comparable to the prior
  same-day report: `63 -> 63`, `delta=0`, `direction=flat`; no candidate was
  applied.
- The first fresh quality-gate attempt exposed a test-only PID-file race:
  `ProcessBuilderCrawlerAttemptLauncherTest` saw an empty file after
  `Files.exists` became true. Existing user changes had already added the
  `fileHasContent` helper for later cases; this continuation applied the same
  wait to the two missed cases. The focused class, ten repeated target tests,
  and full Maven then passed (`1573 pass / 10 skipped`). No production crawler
  code changed.
- Full quality gate rerun completed with exit `0`. Durable log:
  `reports/runtime/local-data-chain-closure/20260824/fresh-134127-quality-gate-rerun/quality-gate.log`.
- Fresh image lineage was run with the explicit completed Item attempt root,
  not by changing audit semantics. Item remains blocked by
  `item_image_projection_after_rows_drifted`: the old 6129-row evidence has
  absolute URLs while the authorized Item origin normalization left current
  relation/projection values as origin-free paths. At that historical point,
  Armor was not ready with missing core/projection rows.
- The historical plan-auditor review is recorded at
  `reports/runtime/local-data-chain-closure/20260824/fresh-134127-quality-gate-rerun/plan-auditor-review.json`
  and `.zh.md`. At that historical checkpoint the verdict was `blocked`, with
  three historical issue categories: the former Armor retry-02 approval gap,
  Item source `accepted=0`, and stale Item projection evidence.
  `canCloseParent=false`.

The old seven-proposal authorization remains valid only for the seven original
proposal hashes. It did not authorize Armor retry-02
(`sha256:f2b5740f5a6ed15098095c390140e46fae7d1efe0cb0d2705508c113cd3d0ff4`).
No packet, permit, or DML was created for retry-02.

## Final Continuation Update / 最终继续更新 (2026-08-24 16:49 CST)

- Armor retry-05 received a separate exact authorization and completed through
  the registered insert-only operation. Result:
  `reports/authorization/canonical/canonical-armor-set-projection-restoration.retry-05.result.json`;
  `affectedRows=63`, `transactionCommitted=true`, after hash
  `sha256:186b03dd074594fc343f29f5dfd2e8fc7589b7f3973bc2f0b1b553c8c417f1f7`.
- Independent readback is recorded at
  `reports/runtime/local-data-chain-closure/20260824/fresh-163744-armor-final/armor-independent-readback.json`:
  `63/63` exact proposal match, all 63 Chinese names present, all 63 rows
  traced to `terraria.wiki.gg` / `Module:Armorsetbonuses`, with source revision
  timestamps present.
- Fresh validation is green: domain acceptance `47/47`, acceptance `19/19`,
  cross-DB `10/10`, core smoke `OK: true`, image lineage `6/7 ready`, Maven
  `1573 pass / 10 skipped`, Public `67/67` plus build, Admin `413/413` plus
  typecheck/build, isolated user-auth E2E smoke `OK`, and complete quality
  gate `exit 0`. Reresolve remains `63 -> 63` flat with no candidate apply.
- The fresh closure index and bilingual plan-auditor review are:
  `reports/runtime/local-data-chain-closure/20260824/fresh-163744-armor-final/closure-index.json`,
  `plan-auditor-review.json`, and `plan-auditor-review.zh.md`.
- Eight original independent roots are closed. The parent remains `blocked`
  with two real Item roots: source evidence has `accepted=0`, and Item image
  readiness still rejects the stale pre-normalization projection evidence as
  `invalid_item_image_projection_apply_evidence`. No Item operation, candidate
  apply, direct SQL, external request, cleanup, staging, stash, reset, or commit
  occurred in this continuation.
