# Crawler Monitor Operation Semantics Design

日期：2026-07-16

状态：已由用户回填问卷并授权执行

来源：`docs/superpowers/specs/2026-07-15-crawler-monitor-operation-semantics-questionnaire.md`

## 1. Goal

把当前统一显示为“开始爬/已完成”的 12 个注册域改造成真实、可审计的数据采集与同步操作中心，使管理员在执行前后都能区分检查更新、强制抓取、数据处理、差异预览、正式写库、运行暂停和失败续传。

## 2. Approved Requirement Resolution

用户确认：问卷空白答案采用“建议”列；显式覆盖如下：

- `Q12 = B`：`npc_loot` 和 `boss_loot` 增加独立正式写库操作。
- `Q20 = A`：只要求暂停当前正在运行的单个任务，不增加排队暂停或全队列暂停。
- `Q24 = A`：当前数据级断点只保留 Buff、Boss、Town NPC maintenance；能力模型必须可扩展，后续域及正式入库链可以增加断点能力。

因此其余批准项为：同页分组；页面名“数据采集与同步”；模块检查与页面抓取分开；Items/NPC/Projectiles 同时提供检查和强制抓取；Recipe/Biome/Loot 拆预览与正式写入；当前状态与上次结果分开；每个 attempt 保留真实计划；单域暂停能力始终可见；失败按钮按业务动作命名；所有任务显示执行摘要；强制抓取和数据库写入必须二次确认；缺少真实数据时明确显示脚本未提供。

## 3. Current Problem

当前 V2 运行治理已经提供队列、attempt、心跳、日志、暂停、终止、retry 和 cleanup，但产品层存在四个结构性问题：

1. 动作注册表只有每域一个默认 action，不能表达检查/强制、预览/写入等多操作。
2. `domainStates` 只给出当前运行状态，没有可执行操作目录、风险或读写范围。
3. 前端用最近终态 attempt 覆盖当前 idle 状态，导致“当前已完成 + 可以开始”的混合表达。
4. 进度只有 `current/total`，不能稳定表达计划、实际、跳过、失败、结果类型和断点回退。

## 4. Architecture

```text
immutable operation registry
  -> domain operation catalog in V2 overview
  -> admin preflight summary and confirmation
  -> one exact domain + operationId start request
  -> V2 queue/attempt with stable actionId
  -> registered command variant
  -> attempt-scoped progress + plan/result summary
  -> current domain state + separate latest result/history
```

V2 Redis 继续是 live lifecycle 的唯一权威；attempt 目录继续是不可变执行证据。业务操作含义由后端注册目录拥有，浏览器不发送命令文本，也不自行推断数据库风险或计划数字。

## 5. Domain Operation Catalog

注册表从“每域一个动作”升级为“12 个稳定域 + 多个白名单操作”。`actionId` 继续作为队列和历史稳定身份；新增 `operationId` 作为管理员选择的业务操作身份。历史 action 继续可解析，不迁移或重写已有 Redis/manifest。

| 域 | operationId | actionId | 类型 | 管理员文案 | 确认 |
| --- | --- | --- | --- | --- | --- |
| items | `check` | `wiki-items-refresh` | 检查同步 | 检查物品模块更新 | 普通确认页 |
| items | `force` | `wiki-items-force-refresh` | 强制抓取 | 强制重抓物品模块 | 二次确认 |
| npcs | `check` | `wiki-npcs-refresh` | 检查同步 | 检查 NPC 模块更新 | 普通确认页 |
| npcs | `force` | `wiki-npcs-force-refresh` | 强制抓取 | 强制重抓 NPC 模块 | 二次确认 |
| projectiles | `check` | `wiki-projectiles-refresh` | 检查同步 | 检查射弹模块更新 | 普通确认页 |
| projectiles | `force` | `wiki-projectiles-force-refresh` | 强制抓取 | 强制重抓射弹模块 | 二次确认 |
| buffs | `fresh` | `buff-page-immunity-refresh` | 页面抓取 | 重新抓取 Buff 数据 | 普通确认页 |
| armor_sets | `fresh` | `domain-source-armor-sets` | 单模块抓取 | 重新抓取盔甲套装模块 | 普通确认页，标记短任务 |
| recipes | `preview` | `recipe-reference-sync` | 数据处理预览 | 预览配方关系差异 | 普通确认页 |
| recipes | `apply` | `recipe-reference-apply` | 数据库写入 | 正式同步配方关系 | 二次确认 |
| biomes | `preview` | `biome-preview` | 数据处理预览 | 预览群系同步 | 普通确认页 |
| biomes | `apply` | `biome-sync` | 数据库写入 | 抓取并正式写入群系 | 二次确认 |
| bosses | `fresh` | `domain-source-bosses` | 页面抓取 | 重新抓取 Boss 页面 | 普通确认页 |
| town_npc_maintenance | `fresh` | `domain-source-town-npc-maintenance` | 页面抓取 | 重新抓取 Town NPC 页面 | 普通确认页 |
| shimmer | `fresh` | `domain-source-shimmer` | 单页面抓取 | 重新抓取 Shimmer 页面 | 普通确认页，标记短任务 |
| npc_loot | `preview` | `npc-loot-backfill` | 数据回填预览 | 预览普通 NPC 掉落差异 | 普通确认页 |
| npc_loot | `apply` | `npc-loot-apply` | 数据库写入 | 正式写入普通 NPC 掉落 | 二次确认 |
| boss_loot | `preview` | `boss-loot-backfill` | 数据回填预览 | 预览 Boss 掉落差异 | 普通确认页 |
| boss_loot | `apply` | `boss-loot-apply` | 数据库写入 | 正式写入 Boss 掉落 | 二次确认 |

`npcs` 继续表示 NPC 信息模块；逐页 NPC 维护抓取由独立的 `town_npc_maintenance` 域表达，不新增一个含义重复的 NPC 页面爬虫。

## 6. Operation Metadata Contract

每个可见操作必须由后端提供：

- `operationId`、`actionId`、`labelZh`
- `category`：`check_sync`、`direct_crawl`、`data_process`、`backfill`
- `mode`：`check`、`force`、`fresh`、`preview`、`apply`
- `descriptionZh`
- `networkAccess` 和 `sourceLocator`
- `fileWriteSummary`
- `databaseAccess`：`none`、`read`、`write`
- `estimatedRequests`、`estimatedRecords`；未知为 `null`
- `shortTask`
- `pauseSupported`、`resumeSupported`、`resumeStatePath`
- `confirmationLevel`：`summary` 或 `destructive`
- `defaultOperation`

前端只能显示这些后端事实。任何 `null` 预计量显示“脚本未提供”，不得使用上次任务或前端估算冒充本次计划。

## 7. Start API

保留独立接口：

```http
POST /admin/crawler-monitor/domains/{domain}/start
```

请求改为：

```json
{
  "operationId": "force",
  "resumeMode": "fresh",
  "confirmed": true
}
```

规则：

- 后端以 `domain + operationId` 解析白名单 action；不信任浏览器 command/actionId。
- 单操作域可省略 `operationId`，后端使用唯一/default operation，兼容现有调用。
- 多操作域缺少 `operationId` 时返回 400，不静默选择高风险操作。
- `confirmationLevel=destructive` 且 `confirmed != true` 时返回 400，确保直接调用接口也不能绕过确认意图。
- 初次 start 的 resumable crawler 仍使用 `fresh`；只有失败 retry 才使用 `auto`。
- 同一 domain 继续使用域 lease，不能同时运行两个 operation。

## 8. Workflow Variants

### 8.1 Check And Force

`run-wiki-sync.mjs` 增加模块级 `--force=true`：

- `check`：保留 revision/local snapshot 判断，无变化生成 0-action 计划。
- `force`：对请求的 module entity 强制生成 fetch action，reason=`manual_force`，仍保留低压请求、进度和原子输出。

Backend refresh plan 新增三个稳定 force actionId，命令只改变受控 `--force=true` 参数。

### 8.2 Preview And Apply

- Recipe preview 保留 `recipe-reference-sync` 的非 apply 行为；apply 使用 `--apply=true`。
- Biome preview 使用 `--apply=false`；现有 `biome-sync` 继续表示正式 apply。
- Loot preview 保留 `--dry-run=true`；apply 使用 `--dry-run=false`。
- 所有数据库 apply 仍经过现有导入脚本的事务/幂等规则；本任务不直接改业务表结构。

Crawler source脚本只写 raw/generated/progress/report。数据库写入继续由 pipeline/import lane 拥有，不把 DB 写入塞进 direct crawler。

## 9. Plan And Result Contract

每个 attempt 的计划分两层：

### 9.1 Preflight Plan Snapshot

生成 attempt identity 后，由 V2 enqueue 流程在返回 start 响应前把操作目录中的计划和影响范围写入 attempt 目录固定的 `operation-plan.json`，并在 overview 的 attempt/domain operation DTO 返回。这样不改变 Redis schema，也不扩张现有 manifest 构造契约；历史显示的是当次计划，不受未来注册表修改影响。若 queue 已创建但计划证据写入失败，start 必须返回现有的 state-store unavailable 错误，且 reconciler 仍负责让该 attempt 收敛，不能伪报成功。cleanup 按现有 attempt 目录所有权一起清理该文件。

### 9.2 Runtime Result Summary

进度 JSON 增加可选字段：

```json
{
  "plannedCount": 33,
  "actualCount": 20,
  "skippedCount": 0,
  "failedCount": 0,
  "estimatedRequests": 33,
  "estimatedRecords": null,
  "resultKind": "fetched",
  "resumeOutcome": "fresh"
}
```

`resultKind` 值：

- `no_change`
- `fetched`
- `generated`
- `preview_completed`
- `database_applied`
- `cancelled`
- `failed`

`resumeOutcome` 值：

- `fresh`
- `resumed`
- `checkpoint_invalid_fresh`
- `not_supported`

所有脚本至少提供 work-unit 级计划/实际/跳过/失败数。记录级预计量只有脚本真正知道时才返回；不知道时保持 `null`。旧 attempt 或旧脚本没有摘要时显示“脚本未提供”。

## 10. Retry, Resume And Pause Wording

- 当前 running：`暂停任务`；paused：`恢复运行`。这是同一 attempt、同一进程。
- 失败且 `resumeSupported=true`：`从断点继续爬取`。
- 检查操作失败：`重新检查`。
- 无断点抓取失败：`重新抓取`。
- preview/apply/本地处理失败：`重新执行`。
- “重新排队”只用于技术状态说明，不作为主按钮。
- checkpoint 无效时自动 fresh，但结果必须返回 `checkpoint_invalid_fresh` 并显示“断点无效，已从头重新执行”。
- cancelled attempt 可以直接创建新 attempt，不要求先 cleanup。

当前只为 Buff、Boss、Town NPC maintenance 注册数据级 resume。UI 不硬编码域名，只读取 `resumeSupported`，以便未来扩展。

## 11. Admin Information Architecture

页面标题改为“数据采集与同步”。同一页面分四组：

1. 检查同步
2. 直接抓取
3. 数据处理与入库
4. 数据回填与差异检查

域卡片和表格必须分别显示：

- 当前状态：idle/queued/running/paused 等，仅来自 `domainState`。
- 上次结果：来自同 epoch 最新 terminal attempt。
- 当前计划/进度：只来自当前 attempt。
- 上次计划/结果：只来自对应历史 attempt。

多操作域卡片显示 default operation 和“更多操作”；详情抽屉列出完整操作目录。所有操作先打开执行摘要：访问来源、预计请求/记录、文件输出、数据库读写、暂停/断点能力。强制抓取和数据库写入使用 danger 提示和二次确认。

暂停能力始终可见：idle/queued 时按钮禁用并解释“任务运行后可暂停”；running 时启用；短任务同时显示“短任务，可能在刷新前完成”。不增加队列暂停和全局暂停。

状态不得只靠颜色表达；按钮具有 disabled 属性、原因文本、键盘焦点和至少 44px 可点击高度。卡片正文使用 `min-width: 0`、换行和 `overflow-wrap: anywhere`，长名称、状态和 ID 不得撑破容器。

## 12. Compatibility And Safety

- 现有 queueId、attemptId、actionId、epoch、fence 和 stateVersion 不变。
- 已存在的 terminal history 继续可读；新增字段允许缺失。
- 现有单操作 start 请求继续兼容；多操作域必须显式 operationId。
- 不迁移、重写或清理现有 Redis/attempt evidence。
- 实施与自动化验证只使用 fixture、临时目录、mock/isolated DB 连接和离线计划；不启动真实 Wiki crawler，不执行正式数据库 apply。
- 真正的强制抓取、preview/apply 运行验收必须由用户另行选择具体域并授权。

## 13. Validation

### Backend

- 注册表覆盖 12 域、19 个可见操作、默认项和兼容历史 action。
- start API 验证 operationId、destructive confirmation、单操作兼容和多操作拒绝。
- overview 返回操作目录、独立 current state、attempt plan/result summary。
- retry 文案和 resume capability 不硬编码域名。

### Workflow

- `run-wiki-sync` 测试证明 check 无变化为 no-change，force 必定生成受控 action。
- backend plan 测试证明 Recipe/Biome/Loot preview/apply 使用不同 actionId 和参数。
- progress contract 测试证明开始前、运行中和终态都携带真实计数及结果类型。
- 所有测试使用临时目录或 fake runner，不访问 Wiki/共享 DB。

### Admin

- 纯模型测试覆盖四组、当前/上次分离、0/0 文案、retry 文案、暂停禁用原因和缺失计划提示。
- 页面契约测试覆盖 operationId start、所有摘要、destructive confirmation 和无假数据 fallback。
- 组件测试覆盖长文案不溢出、状态文字、disabled/aria 和键盘可操作性。

### Final Acceptance

- 聚焦 backend、workflow、admin 测试和 typecheck 全绿。
- `git diff --check` 通过。
- 重启本地栈后先做只读 overview/page 验收。
- 真实强制抓取或正式写库不属于自动门禁，只有用户明确选择后才运行。
