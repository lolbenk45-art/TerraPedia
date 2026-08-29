# 本地数据链闭环实施计划

> **面向执行型 Agent：** 执行时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐项执行；所有步骤使用复选框跟踪。

**目标：** 只使用现有本地证据，完成 NPC/Boss 掉落、物品来源 lineage、图片、Projectile 关系、投影、API 和 UI 验收缺口；不执行无边界 Wiki 全量爬取。

**架构：** 全程停留在本地三库链：`maint → relation → local → API → UI`。本次以本地已有标准化文件、冻结 bundle、报告和数据库记录为证据源。本地快速 API 模式通过显式环境变量关闭后端 HTTP 限流，只允许回环地址，绝不改变生产配置。

**技术栈：** Node.js ESM / `node:test`、MySQL 8 / `mysql2`、Spring Boot、Nuxt、本地 Redis、受治理的 import/relation operation、JSON 审计报告。

---

## 不可突破的边界

- 本计划不执行 Wiki、Steam、官方论坛全量抓取。
- 只有在生成“本地证据缺口报告”并得到用户明确同意后，才能另开受限外部 source-refresh 任务。
- 只使用回环 MySQL 上的 `terria_v1_maint`、`terria_v1_relation`、`terria_v1_local`。
- 禁止直接 SQL 修复、临时 importer、废弃 `scripts/**` 路径、生产库、L2 晋级和无关 UI 改造。
- non-boss loot 与 Boss loot 必须保持互斥 owner scope。
- 每次写入必须有本地冻结 bundle、操作授权、事务/写围栏、读回和日期化报告。
- 快速 API 模式只能使用 `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false` 且后端必须是回环地址；测试结束恢复默认值 `true`。

## 闭环完成标准

只有以下条件全部有新鲜绿证据，才能称为“本地完整链可用”：

1. NPC runtime parity 中 `api_gap=0`、`duplicate_or_polluted=0`。
2. Item source facts、details、NPC loot/shop relations 与 local acquisition 具备稳定 lineage 和 parity；6,056 条警告全部关闭或有明确隔离证据。
3. non-boss 与 Boss loot 中可发布范围没有 unresolved、ambiguous、polluted、rejected。
4. Item image lineage 和 readiness 使用现有 managed assets 通过。
5. Projectile item/NPC 关系只使用本地显式 `shoot`/`projectileId` 证据并通过 readiness。
6. cross-DB、relation-health、loot-closure、runtime-parity、后端/前台/管理端 smoke 以及本地 quality gate 全部通过。

任一链缺少本地证据时，只停止该链，写出 blocker 报告，并先告知用户；不能擅自访问 Wiki。

## 任务 0：锁定本地边界并启用快速 API 模式

**文件：**
- 修改：`pipelines/audit/npc-loot-runtime-parity-audit.mjs`
- 测试：`pipelines/audit/npc-loot-runtime-parity-audit.test.mjs`
- 修改：`platform/local/start-local-stack.sh`
- 测试：`platform/local/local-stack.test.mjs`
- 文档：`platform/local/config/README.md`

- [ ] **步骤 1：增加仅回环地址可用的快速选项。** 保留限流开启时的默认间隔；新增显式 `--fast-local-api`，只接受 `localhost`、`127.0.0.1`、`::1`，将请求间隔设为 0，其他主机直接失败。
- [ ] **步骤 2：同时在 CLI parsing 和 injected options 实现该选项。** 固定使用以下形状，避免调用方绕过主机验证：

```js
fastLocalApi: booleanOption(raw['fast-local-api'] ?? raw.fastLocalApi, false),
// apiBaseUrl 规范化后：
if (fastLocalApi) {
  assertLoopbackApiBaseUrl(apiBaseUrl);
  requestIntervalMs = 0;
}
```

`assertLoopbackApiBaseUrl` 必须使用 `new URL` 解析，只接受 `localhost`、`127.0.0.1`、`[::1]`；其他情况抛出 `fast local API mode requires a loopback api base URL`。只有完成回环验证后，才允许 request interval 使用 `nonNegativeIntegerOption`。
- [ ] **步骤 3：补测试。** 覆盖回环地址通过、远程地址拒绝；运行 `node --test pipelines/audit/npc-loot-runtime-parity-audit.test.mjs`。
- [ ] **步骤 4：在本地栈 manifest 中导出并记录 override。** 后端启动前加入以下内容：保留显式传入的值，普通本地启动默认 `true`：

```bash
export TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED="${TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED:-true}"
```

在生成的 local-stack manifest 的 backend 区加入 `httpRateLimitEnabled: process.env.TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED !== 'false'`。在 `platform/local/local-stack.test.mjs` 覆盖默认值和显式 `false` 两种情况。
- [ ] **步骤 5：本地验收启动后端时关闭限流：**

```bash
RUN_DATE="$(date +%Y%m%d)"
RUN_ROOT="reports/runtime/local-data-chain-closure/$RUN_DATE"
mkdir -p "$RUN_ROOT"
TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false \
  bash ./platform/local/start-local-stack.sh
bash ./platform/local/verify-local-stack.sh --skip-front
```

- [ ] **步骤 6：验证 manifest 报告 `httpRateLimitEnabled: false`，运行无 `429` 的回环 burst smoke，并把两项结果写入 `$RUN_ROOT`。** 不修改 `application.yml` 默认值，不把该环境变量带入生产或普通本地开发。

## 任务 1：只读重建本地基线

**文件 / 报告：**
- `pipelines/audit/cross-db-referential-integrity.mjs`
- `pipelines/relation/relation-health-report.mjs`
- `pipelines/audit/npc-source-coverage-inventory.mjs`
- `pipelines/audit/npc-domain-loot-chain-audit.mjs`
- `pipelines/audit/npc-loot-closure-smoke-check.mjs`
- `pipelines/audit/npc-loot-runtime-parity-audit.mjs`
- `pipelines/audit/build-item-source-final-closure-status-report.mjs`

- [ ] **步骤 1：记录本地数据库、分支、进程和当前报告。** 确认没有 crawler/import writer 在运行。
- [ ] **步骤 2：创建一个按日期划分的证据目录，并对三个本地库运行全部只读审计。**

```bash
node pipelines/audit/cross-db-referential-integrity.mjs --write-report=true --output="$RUN_ROOT/cross-db.json"
node pipelines/relation/relation-health-report.mjs --date-tag="$RUN_DATE" --write-report=true
RELATION_HEALTH_REPORT="reports/relation/relation-health-$RUN_DATE.json"
node pipelines/audit/npc-source-coverage-inventory.mjs --write-report=true --output="$RUN_ROOT/npc-source-coverage.json"
node pipelines/audit/npc-domain-loot-chain-audit.mjs --write-report=true --output="$RUN_ROOT/npc-loot-domain.json"
node pipelines/audit/npc-loot-runtime-parity-audit.mjs --api-base-url=http://127.0.0.1:18091 --fast-local-api --write-report=true --output="$RUN_ROOT/npc-loot-runtime.json"
node pipelines/audit/npc-loot-closure-smoke-check.mjs --write-report=true --domain-report="$RUN_ROOT/npc-loot-domain.json" --coverage-report="$RUN_ROOT/npc-source-coverage.json" --runtime-report="$RUN_ROOT/npc-loot-runtime.json" --relation-health-report="$RELATION_HEALTH_REPORT" --output="$RUN_ROOT/npc-loot-closure.json"
node pipelines/audit/build-item-source-final-closure-status-report.mjs --verify-local-db=true --output="$RUN_ROOT/item-source-closure.json"
```
- [ ] **步骤 3：把每个问题归为“可由本地证据修复 / expected-zero / 外部证据阻断”。** 不能为了减少数量把未知行改成 expected-zero。
- [ ] **步骤 4：遇到外部证据阻断时，只停止该 lane，并先报告缺少的本地文件；其他独立 lane 可以继续。**

## 任务 2：修复 NPC API runtime parity

**文件：**
- 修改：`pipelines/audit/npc-loot-runtime-parity-audit.mjs`
- 测试：`pipelines/audit/npc-loot-runtime-parity-audit.test.mjs`
- 按需检查/修改：`services/catalog-api/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`、`services/catalog-api/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- 测试：`services/catalog-api/src/test/java/**` 对应 controller/service 测试

- [ ] **步骤 1：增加一个 segmented NPC（body/tail）和一个重复 head 的 RED fixture。** fixture 必须同时有 relation、projection、local、结构化 API 和旧 JSON 字段。
- [ ] **步骤 2：沿 API → SQL 路径确认是否把结构化 loot 与 `lootItemsJson` 合并了两次。** 在测试名和 devlog 中记录最终 canonical source。
- [ ] **步骤 3：实现单一 canonical API 行路径。** 每个稳定 loot identity 只输出一次，保留数量/概率/条件，并显式标记 `direct` 或已批准的 inheritance；不能靠审计 normalizer 隐藏差异。
- [ ] **步骤 4：按现有本地 inheritance contract 处理 segmented NPC。** 如果已批准的 relation/local 行应该可见，则修 API 查询；如果行没有批准证据，继续 blocked，不能猜测继承。
- [ ] **步骤 5：运行 Node 和 Maven 聚焦测试，再用快速本地 API 跑 418 个 NPC。** 结果中不应再出现限流阻断，只保留真实数据/语义问题。

## 任务 3：闭合 Item 来源、掉落和关系 lineage

**文件：**
- `pipelines/fetch/build-item-relations-bundle.mjs`
- `pipelines/fetch/build-npc-item-relations-bundle.mjs`
- `pipelines/relation/item-source-relation-processor.mjs`
- `pipelines/relation/sync-maint-to-relation.mjs`
- `pipelines/relation/sync-relation-to-local-compat-tables.mjs`
- 审计：`pipelines/audit/audit-items-without-active-sources.mjs`、`pipelines/audit/audit-item-source-existing-evidence-layers.mjs`、`pipelines/audit/build-item-source-final-closure-status-report.mjs`

- [ ] **步骤 1：只读盘点 6,056 条缺少 maint/relation trace 的 local acquisition 行。** 按稳定 item identity、source type、可用 record key 分组。
- [ ] **步骤 2：只对已有 `maint_item_sources`、`maint_npc_crawler_facts` 或冻结 relation bundle 支撑的行做 reconciliation。** recipe、worldgen、fishing、event、crate、Shimmer 等 taxonomy 保持独立。
- [ ] **步骤 3：生成冻结 preview，分别列出 source facts、details、shop relations、loot relations、目标 local 行。** 要求无越界表写入。
- [ ] **步骤 4：preview 批准且本地证据通过后，只通过现有受治理 relation operation apply。** 禁止直接 SQL 和新增 Wiki 请求。
- [ ] **步骤 5：读回三层并重跑 source closure / cross-DB。** 没有稳定 lineage 的行保留隔离并进入报告。

## 任务 4：使用本地 bundle 完成 non-boss / Boss loot

**文件：**
- `pipelines/import/import-normal-npc-loot-to-db.mjs`
- `pipelines/import/import-boss-loot-to-db.mjs`
- `pipelines/generate/generate-boss-loot-bundle.mjs`
- `pipelines/audit/npc-loot-correctness-gate.mjs`
- `pipelines/audit/npc-loot-gap-closure-audit.mjs`

- [ ] **步骤 1：只用现有标准化输入和冻结 bundle 重跑 non-boss 与 Boss 审计。** 保持两个 owner scope 分离。
- [ ] **步骤 2：对仍可发布的行生成 preview，证明 unresolved/ambiguous/polluted/rejected 没有被静默丢弃。**
- [ ] **步骤 3：先 apply non-boss 并读回，再单独 apply Boss，并保留 `drop_source_kind`。** 禁止合并操作。
- [ ] **步骤 4：运行 loot correctness、source coverage、closure、runtime parity。** 若缺行需要新的上游证据，立即停止并报告。

## 任务 5：使用现有 managed assets 完成 Item 图片 lineage

**文件：**
- `pipelines/audit/image-source-lineage-report.mjs`
- `pipelines/relation/` 与 `pipelines/workflow/` 中现有受治理图片 lineage/apply 脚本
- `reports/domain/items/image-readiness-*.json`

- [ ] **步骤 1：无网络盘点现有 managed image objects 和 relation 行。**
- [ ] **步骤 2：生成冻结图片 lineage preview，拒绝 raw Wiki URL 和缺失 managed object。**
- [ ] **步骤 3：只有本地对象和 hash 都匹配时，才调用现有 canonical image projection operation。**
- [ ] **步骤 4：验证 Item API、public image proxy、admin image path 和 image readiness。** 缺图写 blocker 报告，不能启动 Wiki 下载。

## 任务 6：使用本地显式字段完成 Projectile 来源关系

**文件：**
- `pipelines/relation/` 中现有 relation processor
- `pipelines/audit/domain-readiness-audit.mjs`
- `pipelines/relation/` 测试及 `reports/domain/projectiles/` 报告

- [ ] **步骤 1：只从 maint raw JSON 读取 `shoot`、`projectileId`、`projectile_id`。**
- [ ] **步骤 2：缺失或歧义 ID 生成 unresolved audit；禁止从 `aiStyle`、名称或展示文本推断。**
- [ ] **步骤 3：通过受治理 relation operation preview/apply item/NPC Projectile 关系。**
- [ ] **步骤 4：读回 relation/projection/local/API，并要求 Projectile relation readiness 通过。**

## 任务 7：最终快速本地运行态验收

**文件 / 命令：**
- `platform/local/smoke-local-stack.sh`
- `platform/local/quality-gate.sh`
- `reports/runtime/local-data-chain-closure/$RUN_DATE/`

- [x] **步骤 1：用显式回环快速模式运行 NPC parity：**

```bash
TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false \
node pipelines/audit/npc-loot-runtime-parity-audit.mjs \
  --api-base-url=http://127.0.0.1:18091 \
  --fast-local-api \
  --write-report=true
```

- [x] **步骤 2：运行 closure、cross-DB、relation-health、domain-readiness、image-readiness、Projectile relation 审计。** domain/loot/Projectile lane 通过；relation-health 与 cross-DB 为 warning-only；item-source/image lane 仍按下文阻塞。
- [x] **步骤 3：运行后端聚焦测试、前台/管理端检查、本地 API smoke 和 `bash ./platform/local/quality-gate.sh`。** Spring `48/48`、admin check 通过，基础 smoke `200`；public check 因 sitemap evidence 缺失失败，managed-image smoke 因 image origin 不可达而阻塞，quality gate 为 `322/327`，5 项是 fail-closed fixture 缺失。
- [x] **步骤 4：恢复正常本地 API 保护，发起一个小型 smoke 请求，记录快速 override 未保留。**
- [ ] **步骤 5：只有所有闭环标准全绿才能标记 ready；否则保持 active/blocked，并记录报告路径和下一责任人。**

## 任务 8：文档和交接

- [x] **步骤 1：在中英文计划中填写实际命令、报告路径和证据计数。**
- [x] **步骤 2：更新 `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md` 和 `docs/devlog/current.md` 的真实残余状态；只有有新鲜证据时才删除旧阻断数字。**
- [x] **步骤 3：提交前运行 `git diff --check`、`git status --short`、`git diff --cached --stat`。**

## 外部请求停止 / 升级规则

任何任务若需要 Wiki/Steam/论坛请求，执行者必须在请求前停止并报告：所属 lane、缺少的本地 artifact、受影响实体、为什么本地数据无法判定、拟执行的受限外部命令。只有用户明确批准后才能恢复。

## 执行记录（2026-08-18）

- [x] Task 0-1 已完成，只读证据和回环 fast-mode smoke 已记录。
- [x] Task 2 已完成：修复分段 NPC API identity，保留 shop/buff representative
  语义；Node `22/22`、Spring `48/48` 通过，并覆盖 structured/legacy 组合 fixture。
- [x] Task 3 已完成只读盘点：`269` candidates、`276` planned duplicates、
  `0` dry-run source rows；未执行 apply。
- [x] Task 3 treatment 复核确认 `292` 个 focused candidates，`276` 条计划行均为
  duplicate，`toInsert=0`，另有 `10` 条 projection-required（CenxsWings 加九条
  Biome）。CenxsWings 没有当前 maint/relation lineage，历史 town-NPC 导入不可重放。
- [x] Task 4 审计通过；未执行 loot apply。
- [x] Task 5 图片 lineage 盘点完成；非 Boss managed projection 值缺失，apply
  保持阻断。
- [x] Task 5 已使用 legacy 与 canonical managed 前缀完成环境复核。修正后 readiness
  为 `4/7`：NPC、Boss、Projectile、Armor 通过；Item 缺少 governed projection 授权
  证据，Buff projection image 为空，Biome 缺少 lineage 表/字段。未执行 apply 或下载。
- [x] Task 6 Projectile relation readiness 通过；未解决 image backfill 为非阻断项。
- [x] Task 7 已在精确 duplicate quarantine 后完成：新鲜 loopback parity 为
  `418/418` trusted direct loot，`api_gap=0`、`duplicate_or_polluted=0`，relation/
  projection/local/API 四层均为 `1542` 行。证据：
  `reports/runtime/local-data-chain-closure/20260818/post-quarantine/npc-loot-runtime-parity.json`。
- [x] quarantine 后 closure smoke 通过：domain blocker `0`、runtime blocker `0`、
  open loot audit `0`。relation-health 仍为 warning-only（`21 pass / 1 warning /
  6 info / 0 blocking`），cross-DB 为 `9 pass / 1 warning / 0 blocking`。证据：
  `reports/runtime/local-data-chain-closure/20260818/post-quarantine/npc-loot-closure.json`、
  `reports/relation/relation-health-20260818-fresh.json`、
  `reports/runtime/local-data-chain-closure/20260818/cross-db-20260818-fresh.json`。
- [x] 精确 quarantine readback 确认目标 8 行均为 soft-disable（`status=0`、
  `deleted=1`），4 行 survivor 保持 active，两个 canonical identity 各只剩 1
  条 active local 行。证据：
  `reports/authorization/canonical/canonical-npc-duplicate-quarantine.result.json`。
- [x] fast-mode 验证后已重启本地栈并恢复普通保护；最终 manifest 为
  `backend.httpRateLimitEnabled=true`。基础 API smoke 返回 `200`；managed-image
  探测因配置的 image origin 不可达而保持阻塞。
- [x] duplicate-governance 只读审计已完成。报告：
  `reports/runtime/local-data-chain-closure/20260818/npc-duplicate-governance-audit.json`
  （`verdict=blocked_no_current_exact_authorization`）。当前没有绑定这四条重复行的
  request、packet、bundle、preview 或 readback（`Clothier` relation `623/1543`、
  local `82367/83287`；`DyeTrader` relation `755/1544`、local `82499/83288`）。
  历史 non-boss/Boss 决定已消费且只覆盖整分区，不能复用做逐行修复。未执行 API
  去重、SQL 删除、宽分区 apply、crawler 或外部请求。
- [x] 已生成只读 frozen duplicate preview：
  `reports/runtime/local-data-chain-closure/20260818/npc-duplicate-owner-scope-preview.json`
  （`applyAllowed=false`；relation IDs `623/1543/755/1544`；local IDs
  `82367/83287/82499/83288`）。未选择 canonical winner，也未创建 packet。
- [x] 继续验证：NPC/closure/domain Node suites `107/107`；lineage/owner-phase
  contracts `17/18`，唯一失败是缺少
  `reports/authorization/canonical/canonical-npc-apply.input.json` 的预期 fail-closed。
- [x] Task 8 已将 quarantine 后 parity/closure 证据写入中英文计划和 active devlog。
  整体计划仍 active：item-source closure 仍为 `269` 个只读候选、`276` 个重复、
  `0` 条可插入、`17` 条 projection（其中 1 条没有 public contract 覆盖）；image
  readiness 未绿；local contract gate 为 `322/327`，5 项因缺失 fail-closed artifact
  失败；public `pnpm run check` 仍因既有 `public/sitemap.xml` 缺失而失败。
- [x] 已只读尝试最终本地 contract gate：
  `bash ./platform/local/quality-gate.sh --skip-front --skip-admin`，`322/327` 通过，
  `5` 项因 fail-closed 授权 fixture 缺失而失败。closure 仍 blocked，未伪造缺失 artifact。

## 外部证据扩展（2026-08-18，用户已授权）

- [x] 外部请求前已加 request-gate 安全门禁：遇到 `429` 立即结束当前请求，
  将 `Retry-After` 秒数/日期写入共享 cooldown，并且不重试同一请求。Focused
  gate 测试 `14/14` 通过。
- [x] 已冻结目标 manifest：
  `reports/runtime/local-data-chain-closure/20260818/external-refresh-target-manifest.json`
  （`sha256:f8fde04e5cd413d2b8bc44444219223b32e961e02b1d376fde8c296a60d17c14`）。
  当前输入为 `113` 条 group-page variant 行、`33` 个页面，以及 `368` 个唯一
  open backfill candidate key（Item `117`、Projectile `251`），去重后为 `299` 个
  Wiki 页面，其中 `25` 个页面同时属于两条 lane。旧交接数字 `185/247` 只保留为
  stale 对照，不作为本次 target source。
- [x] 单页 smoke（`Hornet`）通过，monitor progress terminal 且无限流；随后 detached
  串行刷新完成 `299/299`，观测到 `0` 个 `429`、无 gate cooldown、无数据库写入。
  progress、normalized、canonical、audit 输出位于
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/`。
- [x] 只读 evidence freeze 已生成：
  `reports/runtime/local-data-chain-closure/20260818/external-refresh-evidence-freeze.json`
  （`sha256:b2eb6df8053c34e74a6bb40d2a5d0a1e876faf7192c901011910f751e120e259`）。
  `299` 个页面均有输出，audit 为 `295 pass / 4 warn / 0 fail`。Bridge 有 `0` 个
  unmatched crawler，但有 `20` 个 conflict sample。候选 bundle 共 `1269` 条记录、
  `357` 条仍 open（Item `116`、Projectile `241`），fresh evidence 关闭了 `11`
  个 candidate key；`applyAllowed=false` 仍明确保持。
- [x] 已完成只读 bridge conflict recheck。问题不是掉落或关系 identity 冲突，而是
  `Town Slimes` 共享页面展开后的成员记录仍携带整页 infobox ID，导致重复命中；现在
  `groupMember` 唯一名称优先于整页 auto ID。recheck 报告 `306` 个 crawler record、
  `0` 个 unmatched、`0` 个 conflict sample；bridge/crawler 聚焦测试 `41/41` 通过。
- [x] 四个 parser warning 已完成分类且不做 suppress：Cattiva/Foxparks 是带嵌入 NPC
  infobox 的 Item/召唤物页面，The Torch God 是 domain-separated 事件奖励页，Mimics
  是有 scoped loot 的合法 multi-infobox group page；不会把它们提升为普通 NPC 关系。
- [x] 已从修复后的 bridge 生成只读 owner-scope preview：
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/bridge-recheck/npc-relation-owner-scope-preview.json`；
  `1269` 条记录（loot `841`、
  shop `428`），`357` 条 open candidate（NPC-item `116`、NPC-projectile `241`），
  scope hash 为 `sha256:268049c1a7e63e49fa3a2f0ee45bcd201af75ee3d00aff56dd6bfba6c48b7de7`。
  `applyAllowed=false` 仍明确保持；这是不可变的授权前快照。后续精确 packet
  已在下文记录；数据库仍未写入。
- [x] 已尝试一次全量 NPC parity 只读重跑；约 4.5 分钟未产生 terminal report，已停止。
  单次回环 aggregate smoke 返回 `200`；此前完整的 `418/418` 报告仍是最新全量证据。
- [x] 用户已授权精确 scope
  `sha256:268049c1a7e63e49fa3a2f0ee45bcd201af75ee3d00aff56dd6bfba6c48b7de7`。
  已注册 governed operation `canonical-npc-external-relation-scope-apply`，绑定
  bundle hash `sha256:56463a70f0e68cf5f1b39db3e8f892274474b43a51b101ffc9610f932ad4981f`、
  preview hash `sha256:ef81ca4a970635c98ef839933679f15165806fb793f53005f93144c4147ddfbd`、
  当前 server fingerprint、九个 owner target，并将 `357` 个未解决候选保持为 quarantine-only。
  dry-run、request、packet、manifest、owner input 和 fingerprint 均已落在日期化报告目录。
- [ ] apply 仍 blocked：必须先注册并完成 affected-key 数据库 handler 与 readback 验证。
  当前未消费 permit、未写数据库；禁止全表 relation/local rebuild、`CenxsWings`、图片下载、
  direct SQL 以及所有非 Wiki lane。
- [ ] **2026-08-19 handler replay 阻断：** 单连接 affected-key writer 与
  payload scope 校验已实现，聚焦测试 `55/55` 通过；但冻结 bundle 的只读重放显示，
  通用 item-source processor 只能从预览 `841/428` 行得到 `654/427` 条 loot/shop
  relation，且有 `179` 条 fact 未 resolved。证据：
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-static-replay.json`。
  必须先冻结并授权明确的 accepted/quarantine 投影，不能绕过 taxonomy 或 dedupe，
  也不能生成或消费 permit。

## 2026-08-19 新鲜只读基线

- [x] 已确认 MySQL 在回环 `127.0.0.1:13306`，并用仅进程环境内的 32+ 字符随机
  auth secret 启动 canonical stack；`TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false`。
  backend health 为 `UP`，没有修改 secret/config 文件。
- [x] 新鲜 source/domain/closure 审计完成：`762` 个 active NPC、`0` 个 domain
  blocker、runtime parity `418/418` trusted-direct，relation/projection/local/API
  每层 `1542` 行、open loot audit `0`。replay 使用
  `--fast-local-api --max-rate-limit-retries=0`，全程没有 `429`。
- [x] Cross-DB 为 `9 pass / 1 warning`，唯一已知 warning 是 `6056` 条缺少
  relation/maint trace 的 local acquisition；relation health 为 warning-only 且无
  blocking check。新报告位于
  `reports/runtime/local-data-chain-closure/20260819/` 以及
  `reports/relation/relation-health-20260819.json`。
- [x] Projectile relation/image 与 NPC relation readiness 通过。Item image
  readiness 仍 blocked（现有 image-sync evidence 没有 `items` scope）；DB image
  lineage 只有 Boss `33/33` ready，其余六类仍有 projection/managed-image 缺口。
- [x] 原 parser 计数 scope 已替换为明确的 accepted/quarantine projection，并完成单独授权。
  governed apply 使用 decision identity `npc-external-relation-scope-20260819-07` 完成并
  readback：landing `1`、maint `1071`、relation facts/details `1071/1071`、loot/shop
  `655/408`、local loot/shop `655/408`；`198` 条 unresolved/ambiguous 保持 quarantine。
  结果文件：`reports/authorization/canonical/canonical-npc-external-relation-scope-apply.result.json`。
- [ ] apply 后整体计划仍为 active/blocked：旧 active generated lineage 与新 bundle 并存，
  runtime parity 报告 `200` 条 duplicate/polluted（relation `2197`、projection `1542`、
  local `1600`、API `1600`）。旧 lineage 和 local tuple 清理不在本次精确授权内，未执行。
  Cross-DB 仍为 `9 pass / 1 warning / 0 blocking`，relation health 为 warning-only。未执行
  crawler、外部请求、image download、direct SQL、staging、commit 或 cleanup。

- [x] 已基于真实 maint identity 冻结并应用新的 projection：
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json`。
  结果为 `1071` 条 source facts/details、`655` 条 loot、`408` 条 shop、`198` 条
  quarantine；proposal scope hash 为
  `sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39`。
  授权 scope hash 为
  `sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39`；post-apply
  runtime/closure 仍受旧 generated lineage blocker 影响。

## 任务 9：冻结旧 Lineage 修复预览（只读）

**文件：**
- 新建：`pipelines/audit/npc-stale-lineage-repair-preview.mjs`
- 新建：`pipelines/audit/npc-stale-lineage-repair-preview.test.mjs`
- 输出：`reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json`
- 更新：本计划、英文计划和 active closure devlog

- [x] **步骤 1：先写 RED 单测，覆盖精确替代、元数据漂移和没有 lineage 的 local 行。**
  pure builder 接收 active accepted 行、现有 relation 行、父 fact/detail、local tuple 和
  projection payload。只有旧 relation 的完整语义 tuple 等于 accepted 行，且父 fact
  没有其他 active child 时，才能进入 proposed；其他情况全部写入 `quarantine`。

```js
const preview = buildNpcStaleLineageRepairPreview({
  acceptedLoot: [acceptedLootRow],
  incumbentLoot: [exactGeneratedLootRow, metadataDriftLootRow],
  factsByKey,
  detailsByFactKey,
  localLoot: [matchingLocalTuple],
  projectionLoot: [],
});
assert.equal(preview.proposed.relationLoot.length, 1);
assert.equal(preview.quarantine.metadataDrift.length, 1);
assert.equal(preview.quarantine.projectionRequired.length, 1);
assert.equal(preview.local.loot.preserve.length, 1);
```

- [x] **步骤 2：实现前运行新测试文件。**

```bash
node --test pipelines/audit/npc-stale-lineage-repair-preview.test.mjs
```

预期：因 `buildNpcStaleLineageRepairPreview` 尚不存在而失败。

- [x] **步骤 3：实现 pure classifier，禁止 SQL 写入。** loot stable identity 与
  `npc-loot-runtime-parity-audit.mjs` 保持一致：NPC/item internal name、quantity text、
  chance text 和 `Normal mode row` 归一化。proposed retirement 必须比较全部持久化
  condition 字段。由于兼容表没有 relation key，精确匹配的 local tuple 只能保留，绝不
  推断旧 local owner 或把 local 行作为 disable 目标。

- [x] **步骤 4：增加只读 MySQL loader 与 fail-closed CLI。** 它只能读取三个本地库，
  只可写 JSON preview，并写死 `applyAllowed=false`、`databaseWrites=false`、
  `externalRequests=false`，拒绝 `--apply` 和未知写模式。报告必须保存 record key、
  source fact/detail key、完整 landing lineage、expected survivor key 和逐行 disposition。

```bash
node pipelines/audit/npc-stale-lineage-repair-preview.mjs \
  --write-report=true \
  --output=reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json
```

- [x] **步骤 5：验证后停止等待授权。** 运行 focused test、解析 JSON、运行
  `git diff --check`，并把 preview SHA-256 记录到双语计划和 devlog。不得创建
  manifest、authorization packet、permit、operation handler、数据库 apply、crawler、
  外部请求或 local tuple cleanup。用户仅能按审阅后的精确 relation/fact/detail scope
  单独授权。

**任务 9 证据（2026-08-19）：**

- 聚焦测试 `node --test pipelines/audit/npc-stale-lineage-repair-preview.test.mjs`：`4/4` 通过；`node --check` 通过；`git diff --check` 通过。
- 只读输出：`reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json`。
- 可退休 lineage 已严格锁定为 provider `terrapedia.generated`、landing hash `07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3`、landing source key `generated.npc_item_relations_bundle` 和 maint table `maint_item_sources`。inventory 为 `2135` facts、`2135` details、`1172` loot、`938` shop。
- 每行完整 lineage 保留 `landingSourceId`；当前所有精确旧 relation 行均指向 `12447`。该指针仅用于诊断，不作为授权 predicate。
- proposed scope 为 `513` loot relations、`408` shop relations、`921` source facts、`921` source details。local 兼容表仅 preserve（loot `655`、shop `446`）；`38` 组 local duplicate tuple 继续 quarantine。
- quarantine 数量：metadata drift `0`、parent-with-other-active-relation `84`、source-detail-incomplete `0`、independent-lineage `1153`、unmatched-incumbent `1423`、projection-required `7`、unmapped-local-tuple `0`、local-duplicate-tuple `38`。
- 报告 fail-closed：`applyAllowed=false`、`databaseWrites=false`、`externalRequests=false`。scope hash 为 `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`；文件 SHA-256 为 `5b8d66ab3ba91bdf06a2bfbae2dcdf7d04bdde89eef82f88e834d40f0330039a`。
- 未创建 manifest、packet、permit、handler，未执行 apply、crawler、外部请求、direct SQL、local tuple cleanup、staging、commit 或 discard。任何旧 lineage 操作都必须先取得新的精确授权。

**任务 9 授权执行与残余（2026-08-19）：**

- 新增受治理 operation `canonical-npc-stale-lineage-retirement`，绑定 execution manifest、精确 input bundle、packet 和一次性 dispatch permit。用户授权绑定 scope `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`。
- 事务已成功提交，decision 为 `canonical-npc-stale-lineage-retirement-20260819-admin-02`，packet hash 为 `sha256:efca6036bb4e55545bdd3388aca8a306c34595dee462ed3029369d8fc32edd0e`。affected/readback：`513` loot、`408` shop、`921` facts、`921` details；`activeTargets=0`。结果文件：`reports/authorization/canonical/canonical-npc-stale-lineage-retirement.result.json`，output hash `sha256:6ee2b679886a903549e22ff8d2635de994f9e172dfd735584ea12015bd301b0d`。
- 仅 loopback 且关闭限流重新跑 parity，无 429：`418` NPC、`362` trusted、`53` duplicate/polluted、`3` projection gap、`56` runtime blockers。closure smoke 仍仅被 runtime blockers 阻断；domain blockers `0`、coverage blockers `0`、open loot audits `0`，relation health 仅 warning。
- 操作后 cross-DB 为 `9 pass / 1 warning / 0 blocking`；warning 是 `6657` 条没有 relation/maint trace 的 local item-acquisition 行。精确 preview scope 已耗尽，但仍有 `1214` old generated facts/details、`659` old loot、`530` old shop active，因为这些属于 quarantine/ambiguous 或 parent-conflict，超出本次授权。未执行 broad cleanup 或 projection/local mutation。
- fast loopback stack 已停止并以普通 `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=true` 重启；运行时 secrets 未写入磁盘。Image origin 不可达，与本 lane 无关。

**任务 9 残余分类（2026-08-19，只读）：**

- 新增报告 `reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-runtime-residual-classification.json`，文件 SHA-256 为 `sha256:c87508e2ac789a78b3cde8fb9fab9f8695347667afddab13dae02fb648386038`。报告绑定 post-retirement parity JSON 和本地 `terria_v1_relation` 的 active `item_npc_loot_relations` / `projection_npcs` 读取，`readOnly=true`、`databaseWrites=false`、`externalRequests=false`。
- `53` 个 duplicate NPC 共 `136` 个重复 stable-identity group、`272` 条 active relation（`136` 条额外行）：`84` 组是 `terrapedia.generated + terraria.wiki.gg`，`52` 组是 `terraria.wiki.gg + wiki_gg`。前者是 accepted relation 与旧 generated 行的 parent-conflict，后者是独立 `wiki_gg` lineage；两类都保持 quarantine，不能从已消耗 scope 推断新的删除授权。
- `3` 个 projection gap（CursedSkull/Nazar、JungleSlime/SlimeStaff、ManEater/Vine）均有 accepted relation、local 和 API 行；projection 只有同 item 的裸概率文本，accepted relation 使用 `{{modes|...}}` 文本。它们是 projection text-identity mismatch，不是掉落缺失；当前没有绑定这些 NPC projection 行的 governed operation，因此保持 blocked。
- blocker relation 的只读 lineage inventory 为 `367` 行：accepted `215`、old generated `84`、`wiki_gg` format variant `68`，并且 `367/367` 行都能连接到 active `maint_item_sources`。canonical semantic 分桶仅用于审计（解包 `{{modes|a|b}}`）：accepted+legacy `84` 组、accepted+format-variant `59` 组、variant-only `9` 组、accepted-only `72` 组；不能将 format variant 当作旧 lineage。
- 只读校验通过：报告 JSON 读取、`3` 个 gap 均有 accepted lineage、`localApiGapCount=0`，并运行 `git diff --check`。未执行 projection rebuild、local sync、SQL 写入、授权包、permit、crawler、外部请求、staging、commit 或 discard。

**任务 10：冻结 parent-conflict 精确预览（只读）：**

- 新增 `reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-stale-lineage-parent-conflict-preview.json`；输出 SHA-256 为 `sha256:ca964ae6746553e8ae39a1cf6c973ae1649e92313d4e11f03b42dd81cf2d6134`，候选 scope 为 `sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001`。
- 当前读回确认旧 generated loot relation `84/84` active、source facts `84/84` active、source details `84/84` active，accepted survivor `84/84` active；旧父 fact 下共有 `361` 个 active child relation。范围不含 shop、local tuple、projection 或 `wiki_gg` variant。
- 报告 `applyAllowed=false`、`databaseWrites=false`、`externalRequests=false`。由于父 fact 不是单 child，不能安全复用既有 fact/detail retirement operation；未创建新的 write operation、packet、permit，也未执行任何写入。新的 mutation 必须先定义 relation-only owner operation，再按该 scope 单独授权。

**任务 10 执行与复核（2026-08-19）：**

- 新增并注册 relation-only governed operation `canonical-npc-stale-lineage-parent-conflict-retirement`。它唯一允许写入 `relation.item_npc_loot_relations.parent_conflict_old_generated`，明确禁止 facts/details、local、projection、`wiki_gg` variant、crawler 和外部请求。
- 用户授权 scope `sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001`。最终 decision 为 `canonical-npc-stale-lineage-parent-conflict-retirement-20260819-admin-03`，packet hash 为 `sha256:d7090f5fb13ffd3ab599f7270a1904ec265eb1568f3c9682a3c1a9fcaeff5041`；前两次契约不匹配在 SQL 前 fail-closed，未产生写入。
- governed transaction 已提交并读回 `relationLoot=84`、`activeTargets=0`。结果文件为 `reports/authorization/canonical/canonical-npc-stale-lineage-parent-conflict-retirement.result.json`，output hash 为 `sha256:1cde357d50e976f1e5250299cfc2e2959a65ca37cc45ab9b7d114be66ea0af4d`。84 条目标均为 `status=0, deleted=1`；accepted loot `655/655` active，projection NPC `762/762` active；facts/details/local/projection 未改写。
- 新鲜只读证据位于 `reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/`：loopback parity 无 429，`418` NPC（`377` trusted、`37` duplicate/polluted、`4` projection gap），stage rows `1600/1542/1600/1600`；domain 保留 6 个 `countParityOnly` blocker；closure 仍 blocked；relation health 为 warning（`0` blocking、`0` open loot audit）。
- backend 曾因旧 runtime secret 仅 30 字符启动失败；未修改配置或落盘 secret，临时 loopback 使用当前 shell 的 48-byte 随机 secret。最终普通栈 manifest 为 `httpRateLimitEnabled=true`；唯一一次 `429` 保留为运行态证据，fast rerun 无 `429`。
- 聚焦验证：parent-conflict/manifest/catalog `47/47`、authorized-operation suites `35/35`、`node --check` 与 `git diff --check` 通过。计划继续保持 `active/blocked`；未执行 crawler、外部请求、loot/projection/local apply、额外 SQL 写入、staging、commit、cleanup 或 discard。

## 任务 11：冻结 Projection 与 Local 残余协调预览（只读）

**目标：** 为剩余 runtime duplicate 生成一份精确、fail-closed 的预览；不得把没有
lineage 的 local/API compatibility 行误认为 relation 所有。

- [x] 编写 pure classifier 与测试，输入为 active accepted relation、
  `projection_npcs` 中引用 inactive relation 的 projection loot entry、local tuple 与
  API tuple。必须分别分类精确 accepted survivor replacement、no-survivor、ambiguous
  survivor、stale projection key 与 lineage-blind local/API tuple。
- [x] 增加只读 local MySQL loader，输出写入
  `reports/runtime/local-data-chain-closure/20260819/post-final/`。报告必须把每个候选
  绑定到 stable identity，并默认声明零 write target；拒绝 `--apply`。
- [x] 五条有单一 accepted survivor 的 active `wiki_gg` 行只能在 preview 逐条证明后
  作为 projection/local reconciliation candidate；DesertLamiaLight/MoonMask（无
  survivor）、IceMimic/SnowballCannon（ambiguous）及所有 lineage-blind tuple 必须保持
  quarantine。
- [x] 验证 focused tests、JSON parse、`git diff --check` 以及关闭限流的 fast
  loopback parity rerun；随后恢复普通限流。不得创建 write operation、packet、permit、
  crawler task、外部请求、direct SQL 或 broad rebuild。

**任务 11 基线（2026-08-19）：** 已完成四行 relation-only projection-gap `wiki_gg`
variant retirement，scope 为
`sha256:880fa2d9f9b14b3071400cfeac9af4de9e59757843481dbc0d65714c444ae4c8`，
relation loot/active target/active survivor readback 为 `4/0/4`。fresh runtime parity
仍为 `418` NPC、`377` trusted、`41` duplicate/polluted，stage 为
`1544/1542/1600/1600`。`59` 条 stale `wiki_gg` 和 `73` 条 stale generated
projection key 指向 inactive relation；local/API 行没有 lineage。independent-variant
rerun candidate 为零，`314` 条 no-survivor 保持 quarantine。Cross-DB 为
`9 pass / 1 warning / 0 blocking`（`6056` item acquisition trace warning）；relation
health 仅 warning。

**任务 11 结果（2026-08-19）：**

- residual preview 和 relation/projection/local 协调修复已在用户明确授权的精确
  scope `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`
  下完成。受治理结果为
  `reports/authorization/canonical/canonical-npc-projection-text-identity-residual-repair.result.json`；
  旧 relation `128/129` 与旧 local `81872/81873` 已退休，projection `179/83`
  已改为 accepted Nazar identity，accepted relation/local/source 行保留可读。未执行
  外部请求或 direct SQL。
- 修复后的新鲜 loopback parity 为 `418/418` trusted direct loot，
  `blockingCount=0`；relation、projection、local、API 四层均为 `1542` 行。报告：
  `reports/runtime/local-data-chain-closure/20260819/post-final/npc-loot-runtime-parity-after-residual-repair.json`。
- 最终 closure 报告为
  `reports/runtime/local-data-chain-closure/20260819/post-final/npc-loot-closure-final-after-normal-rate.json`，
  仍为 `blocked`：domain 报告尚有 `17` 个 `unclassifiedZero`，
  `releaseBlockingCount=18`，且 `evidenceHealth=source_coverage_unavailable`；这是独立
  于 runtime parity 的 domain evidence blocker。relation health 为 warning-only，
  `0` blocking、`0` open loot audit。
- fast 栈已停止，并用普通保护重启。最终 manifest
  `reports/local-start/run-manifest.json` 的 `backend.httpRateLimitEnabled=true`。
  普通 smoke 中 backend Item/category、admin root、admin proxy 均返回 HTTP `200`；
  managed-image 因配置的 image origin 不可达而继续 blocked。
- residual preview/repair 与 manifest/catalog/capability 聚焦套件分别通过 `9/9`、`63/63`；
  `node --check`、JSON 解析、`git diff --check` 通过。长期计划仍保持 `active`，因为
  item-source lineage、image readiness、domain evidence blocker 尚未闭合。
