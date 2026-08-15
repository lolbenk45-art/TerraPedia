# 双路径域入库验收执行计划

> 本文件在 Review Plan 一起评审；未得到明确批准前不得执行任何 crawler、scheduler mutation 或数据库写入。

**目标：** 在 WSL 的 `terria_v1_local` 中验证六个小域的真实手动/自动入库，并验证 Items/Projectiles 的本地数据+真实探针 dry-run。

**架构：** 先补齐 activation-gated automatic apply，移除 supplementary apply 对逐次 Owner approval 的强依赖；手动和自动使用同一 frozen bundle、owned-table fence、事务和审计链。所有域串行执行。

**技术栈：** Node.js ESM、Spring Boot V2 crawler monitor、Redis V2、WSL MySQL/InnoDB。

---

## Task 0：前置授权、快照和 writer 基线

**文件/证据：** `reports/authorization/canonical/`、`data/generated/`、`reports/`

- [ ] 确认四份 Review/Execution 文档已获批准，并确认本次允许启动 canonical activation。
- [ ] 确认只使用 WSL：`pwd` 必须为 `/home/lolben/TerraPedia`，MySQL 必须监听 `127.0.0.1:13306`，数据库必须为 `terria_v1_local`。
- [ ] 确认没有 crawler、Node fetch、Java backend refresh 或 importer writer：

```bash
ps -eo user,pid,etimes,cmd | rg 'crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh|import-.*-to-db|java' | rg -v 'rg ' || true
```

- [ ] 记录 Git 状态，但不触碰既有未提交的 `data/generated/wiki-bosses.latest.json`、armor 数据和 authorization artifacts。
- [ ] 记录写前数据库基线：

```bash
mysql --protocol=TCP -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -e \
"SELECT DATABASE(); SELECT 'items',COUNT(*) FROM items UNION ALL SELECT 'npcs',COUNT(*) FROM npcs UNION ALL SELECT 'projectiles',COUNT(*) FROM projectiles UNION ALL SELECT 'buffs',COUNT(*) FROM buffs UNION ALL SELECT 'armor_sets',COUNT(*) FROM armor_sets UNION ALL SELECT 'boss_groups',COUNT(*) FROM boss_groups UNION ALL SELECT 'audio_assets',COUNT(*) FROM audio_assets;"
```

若某表不存在，停止并记录 schema blocker，不得自行建表。

- [ ] 依赖边界确认：NPC/Boss 主数据更新不会隐式更新 `npc_loot_entries`；不要调用 `run-boss-sync-pipeline.mjs`，因为它会显式追加 Boss loot。`npc-loot-*` 和 `boss-loot-*` action 全部保持不调用。

## Task 1：先补自动 apply 的 activation gate

**修改：**

- `scripts/data/automation/run-supplementary-domain-l1-operation.mjs`
- `scripts/data/automation/supplementary-domain-l1-contract.mjs`
- `scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs`
- `scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs`
- `scripts/data/pipeline/independent-entity-sync-args.mjs`
- `scripts/data/pipeline/independent-entity-sync-args.test.mjs`
- 对应 `*.test.mjs`

- [ ] 写 RED 测试：activation disabled/stale/domain-set mismatch 时，automatic apply 在 `BEGIN` 前失败且不写 `crawler_automation_approval`、owned tables 或 generation。
- [ ] 写 RED 测试：activation enabled/current 时，automatic apply 使用 activation decision identity，写入 run/evidence/apply/audit，但不插入逐次 Owner approval；manual apply 仍可显式使用 manual context。
- [ ] 写 RED 测试：automatic apply 的 bundle decision/mode 不再声明 `APPROVED_OWNER_L1`，但保留 activation hash、bundle hash、policy set hash、baseline 和 write fence。
- [ ] 运行：

```bash
node --test scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs scripts/data/automation/supplementary-domain-l1-contract.test.mjs
```

- [ ] 实现最小改动：引入 activation context 校验；保留现有 transaction/rollback/generation fence；删除自动路径对 `crawler_automation_approval` 的插入和 `approvalId` 强制要求；不改 manual path 的显式 `apply=true` 保护。
- [ ] 同时让 independent-entity pipeline 接受并严格校验 `--entity=armor_sets`、`--entity=buffs`、`--entity=projectiles` 等单域选择；默认行为保持不变，未知或空域必须失败。
- [ ] 重新运行同一测试，并运行：

```bash
node --test scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs
```

- [ ] 运行 focused Maven registry/monitor tests：

```bash
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
```

- [ ] 只提交本 Task 代码和测试，提交前运行 `git diff --check`、`git status --short`、`git diff --cached --stat`。

## Task 2：验证 activation preflight，不写库

- [ ] 启动 WSL MySQL（若已监听则复用），确认 `SELECT 1`。
- [ ] 启动本地栈：

```bash
bash ./scripts/dev/start-local-stack.sh
```

- [ ] 以内存 token 登录 `http://127.0.0.1:18191/api/auth/login`；只读请求：

```text
GET /api/admin/crawler-monitor/overview
GET /api/admin/crawler-monitor/v2/automation/preflight
```

- [ ] preflight 必须显示 `enabled=true`、`mode=changed-only`、8 个域、无意外域；失败则停止，不调用任何 dispatch/apply。
- [ ] 不调用 `PUT /admin/crawler-monitor/v2/automation`，除非 activation packet 已核对且本执行阶段明确记录一次启用操作；不调用任意 domain start。

## Task 3：Items/Projectiles 本地数据 + 真实探针

- [ ] 对 Items、Projectiles 分别运行本地 source probe/manifest 检查，不执行全量网络 fetch。
- [ ] 手动 dry-run：

```bash
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync
node scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false
```

- [ ] 自动 dry-run：使用 V2 monitor 的 changed-only 计划/预览入口，确认 action/domain/sourceKey 映射正确，确认 active attempt 不重复；不得使用 `--apply=true`。
- [ ] 记录两个域的数据库计数前后完全一致，并保存 probe hash、dry-run report、terminal progress 和 dedupe 证据。

## Task 4：Armor Sets 真实手动链

- [ ] 记录 `armor_sets` 及相关 owned-table 写前计数和 generation。
- [ ] 先为 independent-entity pipeline 增加并测试 `--entity=armor_sets` 单域过滤，禁止默认同时刷新 buffs/projectiles；然后运行真实受限 source refresh：

```bash
node scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs \
  --progress-path=data/generated/domain-source-armor-sets-progress.latest.json \
  --manifest-path=data/generated/wiki-source-manifest.latest.json
```

- [ ] 生成 frozen input，执行 `node scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs --apply=true --entity=armor_sets`；不得同时运行 buffs/projectiles。
- [ ] 核对 terminal progress、报告、写后计数、样本和 unrelated-table count；任一失败 rollback 并停止。

## Task 5：Bosses 真实手动链

- [ ] 先执行 `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=boss-sync`，确认计划不包含 Boss loot。
- [ ] 不执行 `scripts/data/pipeline/run-boss-sync-pipeline.mjs`；该组合入口会追加 Boss loot。只执行下面拆开的 Boss base-data fetch/import。
- [ ] 手动真实抓取与 import 使用独立输出和报告路径：

```bash
node scripts/data/fetch/fetch-wiki-bosses.mjs \
  --output-json=data/generated/wiki-bosses.acceptance.latest.json \
  --report-json=reports/wiki-bosses-acceptance.json
node scripts/data/import/import-wiki-bosses-to-db.mjs \
  --input=data/generated/wiki-bosses.acceptance.latest.json \
  --apply=true \
  --report-json=reports/wiki-bosses-import-acceptance.json
```

- [ ] 明确不运行 `run-boss-loot-sync-pipeline.mjs`；核对 `boss_groups`/owned NPC scope、样本、generation 和 audit。

## Task 6：Shimmer 真实手动链

- [ ] 运行真实 Shimmer extraction，使用 canonical progress：

```bash
node scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs \
  --progress-path=data/generated/domain-source-shimmer-progress.latest.json
```

- [ ] 读取 verified canonical Shimmer input contract，执行现有 import pipeline 的真实本地 apply；只允许四个 Shimmer transform/decraft/entity/NPC transform 表。
- [ ] 核对 generation、terminal progress、四表计数/样本和 audit；schema/importer failure 立即 rollback。

## Task 7：Buffs 与 NPCs 真实手动链

- [ ] Buffs：

```bash
node scripts/data/fetch/fetch-wiki-buffs.mjs \
  --progress-path=data/generated/fetch-wiki-buffs-progress.latest.json \
  --manifest-path=data/generated/wiki-source-manifest.latest.json
node scripts/data/import/import-buffs-to-db.mjs --apply=true
```

- [ ] NPCs：先执行 `run-backend-data-refresh.mjs --mode=plan --steps=wiki-npcs-refresh`，再按既有 independent entity import 的真实受限输入执行；不与 Buffs 并行。
- [ ] 两域分别核对 388/762 规模的输入、terminal progress、写后 count/sample、generation、audit 和 unrelated table count。

## Task 8：Audio 真实完整目录与手动入库

- [ ] 直接运行共享 Audio helper 的完整受限目录，命令必须显式传递：

```bash
node scripts/data/fetch/fetch-wiki-audio-assets.mjs \
  --mode=all \
  --allow-full-audio-corpus=true \
  --max-api-pages-per-prefix=100 \
  --max-total-files=600 \
  --progress-path=data/generated/wiki-audio-assets-progress.latest.json
```

- [ ] 确认四个前缀分页耗尽、接受文件 <=600、manifest/bundle 可读后，才执行：

```bash
node scripts/data/import/import-wiki-audio-assets-to-db.mjs --apply=true
```

- [ ] 核对 `audio_assets`、`audio_asset_links` count/sample、报告、source acknowledgement 和 no-binary-before-discovery 证据。

## Task 9：自动入口逐域验收

- [ ] 不直接调用 domain start；使用已启用的 canonical V2 scheduler activation，触发一次受控 changed-only sweep。
- [ ] 对每个真实域确认 source fingerprint changed、匹配 actionId、单一 attempt、progress running->completed、activation-gated transaction、audit/result 和 acknowledgement。
- [ ] 对 Items/Projectiles 确认只进入 local-input dry-run，不产生 DB mutation。
- [ ] 对手动阶段已最新的域，自动 apply 必须仍生成真实 transaction/audit terminal result，允许 affected rows 为 0；不得因 0 变化重新无限派发。
- [ ] 第二次只读 overview/preflight 必须显示同一 fingerprint 已 acknowledgement、无新增 attempt、无 active duplicate。

## Task 10：失败路径和无限运行验证

- [ ] 在隔离 fixture/test harness 中验证 activation disabled、stale identity、probe error、pre/post drift、unreadable bundle、active duplicate、retry limit 和 Audio page/file guard 全部在 mutation 前失败。
- [ ] 不在真实库故意制造 partial write；使用现有 importer tests 和 isolated connection 验证 rollback。
- [ ] 运行集中回归：

```bash
node --test scripts/data/monitor/supplementary-source-probes.test.mjs \
  scripts/data/monitor/check-source-updates.test.mjs \
  scripts/data/lib/wiki-sync-manifest.test.mjs \
  scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs \
  scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs \
  scripts/data/import/import-independent-entities-to-db.test.mjs \
  scripts/data/import/import-buffs-to-db.test.mjs \
  scripts/data/import/import-wiki-audio-assets-to-db.test.mjs \
  scripts/data/import/import-wiki-bosses-to-db.test.mjs \
  scripts/data/import/import-wiki-shimmer-to-db.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
git diff --check
```

## Task 11：收尾

- [ ] 读取所有 terminal progress、DB after-count、audit/result、source manifest 和 scheduler overview。
- [ ] 停止本地栈，确认没有 crawler/importer writer；不删除 runtime artifacts。
- [ ] 更新 dual-path devlog，列出每域手动/自动 attempt IDs、结果、计数、残余风险。
- [ ] 只提交代码测试和文档；生成数据、authorization artifacts、armor 数据保持未暂存。
