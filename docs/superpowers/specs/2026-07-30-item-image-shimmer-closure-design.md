# Item Image 与 Shimmer Closure 设计

**日期：** 2026-07-30

**分支：** `design/crawler-auto-ingestion-readiness`

**父计划：** `docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`

**状态：** 待用户书面复核

---

## 1. 目标

本设计关闭完整质量门禁中最后两个非绿色域面板，同时保持现有
fail-close、来源权威、精确授权和共享服务生命周期边界：

1. 为全部 6,131 个标准化物品建立可验证的图片来源，完成 managed
   image、maint、relation 和 local 血缘，不从 local 数据库反向伪造来源；
2. 从同一份新鲜 Shimmer raw snapshot 生成五个 importable shard 和一个
   绑定全部哈希的 manifest，不混用 2026-05 shard 与 2026-07 raw；
3. 让 `items/imageReadiness` 从 blocked 变为 pass，让
   `support.shimmer/blockingGate` 从 warning 变为 pass；
4. 最终要求 domain 为 `45 pass / 0 warning / 0 blocked`，完整
   `bash ./scripts/dev/quality-gate.sh` 退出 0；
5. 在最终关门前刷新 NPC freshness、admin/public API parity、cross-DB、
   relation 和运行残留证据，继续只读复用共享 `18191/16380`。

本设计不会降低 `missingSource=0`、`candidates=uploaded+alreadyManaged` 或
任何 domain gate 语义。无法证明来源时，流水线必须停住，而不是用现有
local 行、启发式最高分、空报告或放宽阈值制造绿色结果。

---

## 2. 已确认基线

### 2.1 门禁与运行状态

- 完整门禁已从头执行：data-workflow 和 automation 通过，domain 在
  `43/1/1` 正确退出 1；唯一 blocker 是 item image，唯一 warning 是
  Shimmer。
- cross-DB quick 为 10 pass；full 为 8 pass / 2 warning。两个 warning
  是一条 relation loot 无 local 输出，以及 4,316 条 legacy acquisition
  无完整 maint/relation trace，不属于本设计的写入范围。
- relation health 为 21 pass / 6 info / 0 blocked / 1 warning；287 条未解析
  NPC audit 继续是 warning-only。
- NPC readiness 私有报告为 `0600`、`T1_VERIFIED`、65/65；admin/public
  sample `-65` 与 local snapshot
  `sha256:58545f6c...db37` 一致。
- 共享 backend `18191` 与 Redis `16380` 仅供只读复用。本任务不得启动、
  停止、重启或接管它们。

### 2.2 Item image 事实

| 指标 | 当前值 | 解释 |
| --- | ---: | --- |
| 标准化物品 identity | 6,131 | 全量目标集合 |
| 标准化已有 image source | 2,119 | `items.standardized.json` 已有 source fields |
| 标准化缺 image source | 4,012 | 当前 domain blocker 的直接输入 |
| local image coverage | 6,131 | 仅作比较证据，不是来源权威 |
| maint/relation coverage | 2,906 | 已有 canonical lineage |
| local-only | 3,225 | local 有、maint/relation 无 |
| candidate audit | 702 | 695 group exact + 7 non-group exact |
| candidate 与 local-only 交集 | 637 | 其余 65 已有 canonical lineage |
| raw 与现有 local title 一致 | 613 | 可独立证明，不因 local 值本身而成立 |
| raw 与现有 local title 冲突 | 24 | raw 仍是权威，冲突必须显式展示 |
| 未由当前 raw 规则证明的 local-only | 2,612 | 必须继续 fail-close |
| 仍隔离的 group pages | 3,310 | 需要结构化成员证据或受控网络核验 |

现有 `item-image-source-candidate-audit.mjs` 是只读 candidate 生成器；它不
批准写入。现有 `sync-standardized-item-images-to-maint.mjs` 会构造
`landingSourceId: 0`，现有 `sync-item-page-images-to-maint.mjs` 使用启发式
图片评分并同样写弱 lineage。二者都不能原样进入正式 closure apply。

### 2.3 Shimmer 事实

- 目标工作树没有 `data/generated/wiki-shimmer.latest.json`。
- 主工作树保留一份 2026-07 raw，SHA-256 为
  `8bc003e4...d53`，revision id 为 `252716`，HTML 长度为 `642133`。
- 目标工作树只有 2026-05 生成的 context、item-transform 和 manifest；
  decraft、entity、NPC shard 缺失。旧 manifest 声明五类输出，但不绑定
  raw/shard 哈希，因此不能证明这些文件来自同一代。
- `fetch-wiki-shimmer-page.mjs` 已具备稳定 action ID、首请求前进度、
  heartbeat 和 terminal state。
- `transform-wiki-shimmer-to-importable.mjs` 会进行分批 langlink 网络请求，
  但没有进度契约；它还默认读取 live local DB，并在 DB 异常时静默回退到
  file-only lookup，输出不可复现。
- 现有 Shimmer import request 没有 `dataBundleSha256`，不能授权新 generation
  的正式导入，必须作废并在 coherent bundle 产生后重建。

---

## 3. 方案选择

本设计采用已批准的方案 A：raw-first、content-addressed、完整 coverage 后再
apply。它需要补 producer contract 和重新生成证据，但能保持 source-of-truth、
可复现性和现有 fail-close 语义。

以下替代方案明确拒绝：

- 从 local 6,131 条现有图片行反抄标准化数据。它执行更快，但 2,612 条
  local-only row 没有独立 raw 证明，24 条还与 raw candidate 冲突；反抄会把
  downstream projection 伪装成 upstream source。
- 只提升当前 702 candidates，或把 `missingSource>0` 降为 warning。它能减少
  blocker 数量，但不能满足完整 coverage，且会让后续阶段把部分成功误报为
  closure。

---

## 4. 总体架构

Item image 与 Shimmer 是两个独立 producer lane。它们可以独立开发和验证，
但正式写操作必须串行，每次只消费一个冻结 bundle。共同的 closure
coordinator 只读取两条 lane 的最终证据，并负责最后的全门禁与运行残留核验。

```text
Item raw pages
  -> structured evidence audit
  -> bounded wiki verification (only unresolved identities)
  -> immutable source-promotion bundle
  -> atomic standardized apply
  -> exact managed-image sync
  -> landing/maint -> relation -> local
  -> image/domain/cross-DB verification

Shimmer wiki page + langlinks
  -> run-scoped staging generation
  -> raw + five importable shards
  -> hash-bound manifest + atomic current pointer
  -> exact authorized import
  -> Shimmer/domain verification

Both green
  -> NPC/API freshness readback
  -> runtime residue readback
  -> full quality gate
  -> source-flip/L1 follow-up checkpoint
```

两条 lane 都使用 preview -> frozen bundle -> exact authorization -> apply ->
post-verify。任何 preview、source fetch 或本地解析都不能被解释为 apply 授权。

---

## 5. Item Image 来源闭环

### 5.1 来源优先级

图片来源按以下顺序判定：

1. 标准化文件中已有且通过 schema、URL 和 identity 校验的 source fields；
2. raw item page 中与 requested identity 绑定的非 group infobox evidence；
3. raw group page 中与成员 identity 绑定的结构化 row/cell evidence；
4. 对仍未解析 identity 执行的有界 Wiki file verification evidence；
5. unresolved，保持 blocked。

local、maint 和 relation 当前行只用于检测 agreement、conflict、已存在
lineage 和预期 diff。它们永远不能排在 raw/Wiki evidence 之前，也不能被复制
回标准化文件作为新来源。

### 5.2 Group page 结构化证据

扩展 `parse-item-raw-pages.mjs` 和 candidate audit，使 group page 不再只看
页面级 infobox 图片。解析器必须在 group page 内建立成员级 evidence：

- 以 `itemInternalName`、英文 item name、requested page title 和页面内成员
  anchor target 的规范化等价作为成员 identity；
- 只接受与该成员位于同一 table row、list item 或明确 item block 内的图片；
- 记录 DOM evidence kind、row/block ordinal、anchor title、file title、原始
  URL、page id、page revision timestamp、raw source file 和 raw file SHA-256；
- 同一 identity 必须得到唯一 source file；0 个或多个候选都进入 quarantine；
- 页面级 banner、placed/demo、map/icon 装饰、跨 row 图片和仅靠 substring
  评分命中的图片不得晋级；
- redirect/group page 的 sell、description 和其他字段继续隔离，本设计只提升
  被成员级结构证明的 image evidence。

现有 702 条 candidate 要重新通过新 schema。613 条与 local title 一致、24
条冲突以及 65 条已有 lineage 都要分别计数，不能合并成一个“已验证”数字。

### 5.3 有界 Wiki 核验操作

本地结构化解析后仍 unresolved 的 identity 才能进入网络核验。新增 monitor
注册动作：

- `actionId`: `item-image-source-verification`
- owner domain: `items`
- 入口：backend-refresh child action，不允许直接无监控长跑
- progress：使用该 attempt 的 `childStatusPath`，并遵守
  `TERRAPEDIA_CRAWLER_PROGRESS_PATH`
- scope：冻结的 unresolved identity 列表、固定 batch size、请求上限和
  request gate；不得扩展为全站 crawler

进度文件必须在第一条网络请求前写 `running`，在每批请求期间更新
`lastHeartbeatAt`，并以 `completed` 或 `failed` 终止。payload 至少包含
`actionId`、`status`、`generatedAt`、`lastHeartbeatAt`、`childStatusPath`、
`phase`、`message`、`current` 和 `total`，并补充 batch、overall、report 和
output 字段。

核验只接受 Wiki API 返回的精确 page/revision/file identity。网络失败、redirect
环、缺 revision、多个 file、内容类型不支持、identity 不一致或响应超出冻结
scope 时，该 identity 保持 unresolved。操作完成不代表来源完整；只有
`unresolvedCount=0` 才能生成可 apply 的 promotion bundle。

### 5.4 Source-promotion bundle

producer 输出不可变 `item-image-source-promotion.bundle.json`。bundle 至少绑定：

- schema version、generation ID、producer code SHA-256；
- `items.standardized.json` before SHA-256 和 6,131 identity-set hash；
- `item_pages.standardized.json` SHA-256；
- candidate report SHA-256、网络核验 evidence SHA-256（如有）；
- 每个 raw file 的相对 source identity、SHA-256、page id、revision timestamp；
- 每个 promoted row 的 item id/internal name/name、evidence kind、source page、
  source file title、original URL、width/height/content type；
- 与 local/maint/relation 的 comparison 状态，不把 comparison 值作为 source；
- existing、promoted、conflict、duplicate、quarantine 和 unresolved counts；
- bundle canonical payload SHA-256。

可 apply bundle 的硬条件是：identity 总数恰好 6,131、每个 identity 恰好一条
有效来源、`unresolved=0`、`ambiguous=0`、`duplicate=0`、输入 hash 未变化。
不满足时只输出 review report，不生成 authorization request。

### 5.5 标准化文件原子更新

`canonical-item-image-source-promotion` 只消费 exact bundle：

- apply 前重算 bundle、标准化文件、identity set 和所有 referenced evidence
  hash；
- 默认只补齐空 source fields；已有标准化来源若与 bundle 冲突则整次拒绝，
  除非未来单独设计 replacement operation；
- 写临时文件、完整 parse/schema/count/hash 校验后以 rename 原子替换；
- 任一 row 失败时不替换原文件；
- result 绑定 before/after SHA-256、精确 key set 和字段级 diff；
- 该文件写操作需要单独的一次性 authorization，candidate review 或 crawler
  authorization 均不能替代。

更新字段限定为 `imageFileTitle`、source `imageUrl`、`imageWidth`、
`imageHeight`、`imageContentType`。排序、非图片字段和 6,131 identity set 不得
变化。

### 5.6 Managed image 与三层 lineage

标准化来源完整后，按顺序执行：

1. `canonical-image-sync` 的 items-only dry-run，必须显示 total 6,131、
   `missingSource=0` 和 exact upload/already-managed key sets；
2. 以单独 authorization 执行 image sync；partial upload 或无法解析 managed
   URL 时 terminal result 为 failed，不得发布 completed report；
3. 将 promotion bundle 作为真实 landing input，取得非零
   `landingSourceId`，再写 `maint_item_images`；
4. maint row 的 `original_url` 来自 frozen source evidence，`cached_url` 来自
   exact managed result，不能把 managed URL 同时伪装成 original URL；
5. 通过现有 governed maint -> relation processor 生成
   `relation_item_images`；
6. 在完整 relation preview、owner scope、snapshot 和 unsafe-delete guard 通过
   后同步 local `item_images` 与 `items.image`。

`sync-standardized-item-images-to-maint.mjs` 必须改为消费真实 landing/bundle
lineage；`sync-item-page-images-to-maint.mjs` 的 heuristic scoring 路径不能参与
本次正式 apply。可保留其只读诊断用途，但 domain evidence 不接受其输出。

### 5.7 Image post-verify 与回滚

post-verify 必须证明：

- 标准化 source coverage、managed coverage、maint、relation、local 都是
  6,131 个 distinct item identity；
- source title、original URL、managed cached URL、landing identity 在各层可
  追溯；
- `run-image-sync` report 为 applied，`missingSource=0`，且
  `candidates=uploaded+alreadyManaged`；
- 24 条既有 local conflict 按 raw 权威结果收敛，不能被静默保留或反向提升；
- image source lineage、domain item image panel、cross-DB 和 API sample 均无
  新 blocker。

文件 apply 通过 frozen before bytes 回滚；DB apply 使用 owned-scope snapshot 和
事务/分阶段 marker。MinIO 新对象记录在 result 中；失败时不发布标准化 after
hash，无法安全删除的孤立对象作为显式 cleanup evidence 处理，不能假称完整
自动回滚。

---

## 6. Shimmer 单代闭环

### 6.1 一个 action 覆盖完整 generation

现有稳定 `domain-source-shimmer` action 保持不变，但其正式入口改为完整
extraction pipeline，而不是仅执行 raw fetch。pipeline 是 canonical progress
和 terminal state 的唯一 owner，按以下 phase 报告：

1. `preflight`
2. `fetch_revision`
3. `fetch_sections`
4. `fetch_html`
5. `resolve_langlinks`
6. `transform`
7. `verify_bundle`
8. `publish`

第一条 raw 或 langlink 请求前必须已经写出 monitor-visible `running`；长时间
网络和 transform loop 由 `createCrawlerProgressHeartbeat` 持续更新。只有 raw、
五 shard、manifest 和 current pointer 全部验证并发布后才写 `completed`。
任一阶段异常写 `failed`，保留上一代 current pointer。

直接 transform 路径不得在无 progress owner 时发起网络请求。实现应将 fetch
和 transform 拆为可注入的函数，由 pipeline 统一提供 progress callback；测试
使用冻结响应，不访问真实网络。

### 6.2 可复现输入

transform 不再默认读取 live local DB，也不得在 DB 异常时静默切换来源。正式
generation 的解析输入只有：

- 本次 action 抓取的 raw page；
- exact `items.standardized.json` 与 `npcs.standardized.json` hashes；
- 本次 action 抓取并冻结的 normalized langlink resolution map；
- versioned title overrides 和 producer code hash。

如需要 DB 只读数据，必须先导出并绑定独立 lookup snapshot；本次 closure 不
需要该扩展。相同输入与 code 必须得到相同五 shard canonical payload hashes。

### 6.3 Content-addressed generation

所有文件先写入 run-scoped staging directory。验证通过后，将目录发布为：

`data/generated/shimmer/generations/<generationId>/`

目录内包含：

- `wiki-shimmer.raw.json`
- `wiki-shimmer-context.importable.json`
- `wiki-shimmer-item-transforms.importable.json`
- `wiki-shimmer-decraft-rules.importable.json`
- `wiki-shimmer-entity-transforms.importable.json`
- `wiki-shimmer-npc-transforms.importable.json`
- `wiki-shimmer-title-resolution.evidence.json`
- `wiki-shimmer-manifest.json`

`generationId` 从 canonical input descriptor hash 派生。固定 `latest` 文件不再是
import authority；pipeline 最后以 temp+rename 原子更新
`data/generated/shimmer/wiki-shimmer-current-generation.json`。旧 2026-05 文件
可作为历史证据保留，但 importer 和 readiness 不得再从彼此独立的 latest
路径拼装 bundle。

### 6.4 Manifest 与 data bundle hash

manifest 至少包含：

- schema version、generation ID、generated/fetched timestamps；
- page title/id/revision id/revision timestamp；
- raw bytes SHA-256、HTML SHA-256/length；
- standardized item/NPC input SHA-256；
- normalized langlink evidence SHA-256；
- 五 shard 的相对路径、entity、record count 和 SHA-256；
- table-role sequence/version、解析 warning、unresolved/ambiguous entries；
- producer code SHA-256；
- 对上述非递归 canonical descriptor 计算的 `dataBundleSha256`。

manifest 自身 SHA-256 由 authorization request 另行绑定，避免自引用。缺 raw、
缺任一 shard、hash 不匹配、generation ID 不一致、table-role 结构缺失或跨代
文件都必须 fail-close。

unresolved title 必须完整列出且不能静默丢行。只要 unresolved 会破坏稳定 logical
key、必需 FK 或 import row identity，import preview 就 blocked；可由现有 schema
安全保存的 typed unresolved evidence 可以保留，但必须进入 count 和 post-verify。

### 6.5 Import authorization 与 apply

`import-wiki-shimmer-to-db.mjs` 改为只接受
`--bundle-manifest=<content-addressed manifest>`：

- 读取 manifest 指定的 raw/shards，不再按固定路径猜文件；
- 重算所有 hash 和 `dataBundleSha256`；
- preview 冻结目标 DB fingerprint、provider-owned scope、每表 before/after
  counts、logical key sets、snapshot 和 rollback point；
- 新 `canonical-shimmer-import` request 同时绑定 manifest SHA-256、
  `dataBundleSha256`、preview diff 和 target fingerprint；
- 当前缺 `dataBundleSha256` 的 request 永久失效，不补字段、不复用 identity；
- apply 只消费一次性 packet，禁止重新 fetch、重新 transform 或读取 current
  pointer；
- broad provider replace 只能作用于 manifest 声明的 `wiki_zh` owned scope，
  任一表 post-verify 失败则事务回滚并写 failed result。

正式 import 是独立 DB write checkpoint，`domain-source-shimmer` 完成不授权它。

### 6.6 Shimmer post-verify

必须证明 raw、五 shard、manifest、request、packet、result 均绑定同一
`generationId/dataBundleSha256`；五张业务表和 context/snapshot 表的 row counts
与 manifest/preview 一致；没有遗漏 shard、跨代输入、未报告 drop 或 provider
scope 外变更。随后刷新 Shimmer domain report，要求 blocking gate 为 pass。

---

## 7. 错误处理与安全边界

以下情况统一 fail-close：

- 输入、code、target fingerprint 或 bundle hash 在 preview 后变化；
- item identity、page revision、file identity 不唯一；
- raw/page/shard/manifest 缺失、malformed、stale 或跨 generation；
- crawler 无首请求前进度、heartbeat 或 terminal state；
- promotion 后 item identity/count 或非图片字段变化；
- landing id 为 0、original/cached URL 语义混淆或 lineage 断层；
- image sync、Shimmer import 或 post-verify 部分成功；
- authorization identity 已消费、过期、缺 Owner 字段或与 exact bundle 不同；
- 需要启动、停止或重启共享 `18191/16380` 才能继续。

失败报告必须保留精确 phase、reason code、processed key set、未处理 key set、
输入/输出 hash 和可执行的 next step。失败不得被后续 stage 记作 pass。

---

## 8. 测试设计

### 8.1 Item image

- parser fixtures 覆盖 group row 唯一匹配、跨 row 图片、0/多候选、redirect、
  placed/demo 和 24 条 conflict 语义；
- candidate/promotion tests 证明 local 值不能成为 source，raw/hash/revision 变化
  会拒绝 bundle；
- crawler progress tests 覆盖 default/explicit child path、首请求前 progress、
  heartbeat、completed/failed 和请求 scope 上限；
- atomic apply tests 覆盖 before-hash mismatch、partial row failure、非图片字段
  不变和原文件保留；
- maint tests 禁止 `landingSourceId: 0`，并分别断言 original source URL 与
  managed cached URL；
- relation/local tests 覆盖 owned scope、unsafe delete guard、snapshot、rollback
  和 6,131 identity parity；
- domain tests 继续要求 `missingSource=0` 与
  `candidates=uploaded+alreadyManaged`，不增加 exemption。

### 8.2 Shimmer

- pipeline tests 证明 raw fetch 前和 langlink batch 前已有 progress，等待期间有
  heartbeat，任何 child failure 产生 parent failed；
- deterministic transform tests 使用 frozen raw/langlink/standardized fixtures，
  两次输出 canonical hashes 相同；
- bundle tests 覆盖五 shard 完整性、单字节篡改、缺 shard、May/July 混代、
  pointer 原子发布和失败时旧 pointer 保留；
- import tests 要求 manifest/data bundle/target/diff exact equality，拒绝现有
  无 `dataBundleSha256` request；
- provider-scope transaction tests 覆盖 preview、apply、post-verify 和 rollback；
- domain tests 只接受真实 completed import report，不接受仅有 raw 或 manifest。

### 8.3 集成与最终门禁

实现计划必须先跑 focused unit/contract tests，再跑 image/Shimmer dry-run 与
read-only audits，最后运行：

- cross-DB quick/full；
- relation health；
- domain report generation，期望 `45/0/0`；
- NPC readiness freshness 和 admin/public API parity；
- shared listener/process、isolated DB/account、transaction、Redis DB 13/14、
  reservation、task process、progress `.tmp` 和 worktree listener 残留核验；
- `bash ./scripts/dev/quality-gate.sh`，期望完整退出 0；
- `git diff --check` 与目标事实一致性扫描。

不得把预期 fail-close exit 1 描述成完整门禁通过。

---

## 9. 文档与项目事实

实现和运行完成后，统一更新：

- 父 closure plan 的 Task 10、Task 11 和后续依赖 checkbox；
- `docs/devlog/current.md` 与活动 closure entry；
- `docs/project-management/current-status.md`；
- `docs/project-management/risk-register.md`；
- 仅在 durable source ownership 或默认 workflow 真正变化时更新
  `docs/project-governance/00_CURRENT_SPEC.md`。

所有文档只记录真实结果、hash、warning/blocker 和剩余授权边界，不预写成功。

---

## 10. 明确排除

- 从 local DB 反向生成标准化 image source；
- 继续使用 heuristic best-score 图片作为正式来源；
- 降低 image/Shimmer/domain gate 或添加临时 exemption；
- 用旧 Shimmer shard、空文件或手写 report 补齐 generation；
- 未经单次 exact authorization 执行 crawler、文件 data apply、MinIO sync、
  maint/relation/local apply 或 Shimmer import；
- 修改共享 backend/Redis 生命周期；
- 在本设计内执行 source-contract flip、第二次 L1、L2 或 scheduler activation；
- 修复既有 4,316 legacy acquisition、287 NPC audit 或独立 relation-loot
  warning；这些保持显式 residual evidence。

---

## 11. 完成定义

本 closure 只有同时满足以下条件才完成：

1. 6,131 个 item identity 全部具有 raw/Wiki-backed source，0 unresolved；
2. 标准化、managed、maint、relation、local image identity 和 lineage 全量一致；
3. image sync report 满足 `missingSource=0` 和 exact completion equation；
4. Shimmer current pointer 指向一个 raw + 五 shard + manifest 完整、hash 一致的
   content-addressed generation；
5. Shimmer import result 与该 exact data bundle 和 target fingerprint 一致；
6. domain 为 `45 pass / 0 warning / 0 blocked`；
7. NPC readiness/API parity 仍新鲜，cross-DB/relation 没有新增 blocker；
8. 所有 task-owned runtime residue 为零，共享 `18191/16380` 未发生生命周期
   变更；
9. 完整质量门禁退出 0，文档和 devlog 反映同一组事实；
10. source flip、L1/L2 和 scheduler 仍停在各自后续 exact authorization
    checkpoint，未因 closure 自动获批。
