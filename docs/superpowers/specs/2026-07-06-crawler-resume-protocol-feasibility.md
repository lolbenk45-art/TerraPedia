# 断点续传协议 · 可行性分析

- 日期：2026-07-06
- 分支：`feat/crawler-resume-protocol`（基线 main `3302b4c`）
- 结论：**方案架构成立、可行**；但有 1 个被低估的核心成本 + 5 处必须补的管道。**建议 town_npc_maintenance 先做 PoC，buffs 次之**。

---

## 一、方案对照真实代码的判定（逐条）

### ✅ 成立且锚点已具备的部分

| 方案主张 | 代码事实 | 判定 |
|---|---|---|
| 用稳定 actionId 归属续传状态 | actionId 是每域**编译期常量**（buffs→`buff-page-immunity-refresh`，town_npc→`domain-source-town-npc-maintenance`），不带时间戳；一次运行的唯一身份是另一个 `dispatchId` | ✅ 锚点天然存在 |
| 统一 CLI 注入 `--resume-mode/--resume-state/--progress-path` | 派发在 Java `buildLaunchRequest`：取 `rule.command()` 数组 + 替换 `<reportPath>` + 注入环境变量 `TERRAPEDIA_CRAWLER_ACTION_ID/PROGRESS_PATH`。`--progress-path` 对 direct 脚本已存在 | ✅ 注入点干净，低风险 |
| 独立 resume state 文件、不拿 progress.current 当断点 | 进度契约（`.codex/skills/terrapedia-crawler-progress-contract`）**确实没有** completedKeys/lastKey/checkpoint 字段；progress 是易变计数 | ✅ 这条判断正确且重要 |
| resume state 用 key/index + inputFingerprint 校验 | seeds 来源 `npc-standardized-map.json` 是**生成物**（会重算），buffs 来自 wiki 模板（`revisionTimestamp` 可取）——输入确实可能变，fingerprint 必要 | ✅ 必须做，判断正确 |
| 只有结果安全落盘后才 markCompleted | 原子写 `writeJsonFile`（tmp+rename）**已现成**可复用 | ✅ 工具就绪 |
| 分批"继续 vs 接着爬 vs 重新爬 vs 强制释放" | 概念正确，且与现有语义能对上（见下方缺口） | ✅ 方向对 |

### ⚠️ 被低估的**核心成本**：两个目标脚本目前都是"最后一次性写"

这是全案最关键的一点：

- **town_npc**：`crawlRecords` 把结果全攒在内存 `records[]`，**整个循环跑完才 `writeJsonAtomic` 一次**；progressCallback 只写进度计数，不写数据。
- **buffs**：per-buff immunity facts 只进内存 `factsByBuffId` Map，**所有 buff 抓完才一次性写**。

**后果**：中断后进度文件说"30/50"，但**没有任何一条已抓记录落盘**。这意味着——

> 只加一个 resume-state 库、调用 `shouldSkip/markCompleted`，**续传省不下任何网络抓取**（重启后结果都没了，只能重头抓）；更危险的是，若 `markCompleted(key)` 在结果真正持久化之前就写了，重启后会 `shouldSkip` 掉那些**结果从未保存**的条目 → **数据丢失**。

所以方案里"保证只有结果安全落盘后才标记 completed"这句**意图完全正确**，但它隐含了一个方案正文没点破的必做改造：**每个目标脚本的结果 I/O 必须重构成逐项增量持久化**（抓一条→落一条→再 markCompleted）。这不是"脚本按类型接入适配"的轻量活，而是改写核心写盘逻辑。**通用库无法替脚本保证这点**，只能提供顺序约定。

### ⚠️ 必须补的 5 处管道

1. **域规则要在两处声明并贯通到前端**：规则在 **JS**（`wiki-monitor-domain-rules.mjs`）**和 Java**（`WIKI_MONITOR_RULES` record）**并行定义、须同步**。`resumeSupported/resumeMode/resumeStatePath/restartBehavior` 要两处都加，且经 DTO 暴露到 overview，前端才读得到。

2. **控制 DTO 无续传字段**：`CrawlerMonitorDispatchRequestDTO = {domain, domains, queueMode, actionId, controlAction, queueId}`，没有 `mode/resumeFrom/offset/message`。"接着爬 / 重新爬(强制从头)"需要新增可选字段。

3. **"继续" vs "接着爬" 前后端都没区分**：目前只有一个 `resume` = 对**活着的、被 SIGSTOP 暂停**的进程发 **SIGCONT**（判据 `status==='paused'`）。死进程续爬：**无 controlAction、无 `canContinueCrawl` 判据、DTO 无字段**。需新增一条控制动作（死进程时以 `--resume-mode=resume` 重新 spawn）。

4. **"重新爬"目前只等于 retry(failed)**：`retry` 仅对 `status==='failed'` 重发一个全新 dispatch，且**不传 offset**，是否从头取决于脚本默认。要一个明确"忽略旧 state、from scratch"的路径（`--resume-mode=fresh`）。

5. **锁与续传的交互**：`maxConcurrent=1` + `CREATE_NEW` 原子锁 + stale(阈值+pid 死)回收。"接着爬"重新 spawn = 新进程新 dispatchId 要抢锁；若死进程的 stale 锁还在，需在续传流程里先释放 stale 锁（或要求先强制释放）。方案把"强制释放≠续传"分开是对的，但续传流程本身要处理"死进程占着锁"。

---

## 二、方案里已有的"半成品"可复用（避免造第三套轮子）

代码里**已存在两套脚本级续传**，新通用库应**泛化/收编**它们，而非并列第三套：

- **items 批次**：`run-item-page-crawl-batches.mjs` 的 `--resume-from-progress` + `resolveResumeOffset({progress})`（读 `batchOffset+batchLimit+status` 算续爬 offset）——这是 `resumeMode: index` 的现成实现。
- **buffs 批次**：`refresh-buff-page-evidence-batch.mjs` 的 `resumeSelectedRecords` 依赖进度里自定义 `lastBuffId` 从该 id 之后 slice——这是 `resumeMode: keyed_items` 的雏形（但字段名 buff 专用）。

若不收编，会同时存在 `batchOffset`(items) / `lastBuffId`(buffs) / 新 resume-state 三套并存，维护割裂。

---

## 三、resumeMode 与脚本的匹配（真实结构）

| 域 | 循环结构 | 建议 resumeMode | 增量落盘改造量 |
|---|---|---|---|
| **town_npc_maintenance** | `for index` over `seeds`（stable `gameId`），39 条 | `keyed_items`（key=gameId） | 中：把 records 改逐条落盘 + 读 state skip |
| **buffs** | 三阶段：module(单取)→expand(批25)→**immunity(per buff.id 网络循环)** | `phase_keyed`（immunity 阶段 keyed_items，key=buff.id） | 较高：只有 immunity 阶段 keyed，且 facts 现全在内存 Map |

**优先级修正建议**：方案把 buffs、town_npc 并列第一批。但——
- **town_npc 结构最简**（单层 keyed 循环、已有 `--limit`/`--progress-path`/env fixture），**适合先做 PoC**验证整套协议。
- **buffs 续传收益更大**（immunity 是慢阶段、数百个渲染页），但 `phase_keyed` 更复杂。**建议 town_npc 打通协议后，buffs 第二个接入**。

---

## 四、总体可行性结论

- **可行性：成立。** 稳定 actionId、每域 progressPath、已注入的环境变量、原子写、已有续传范式、干净的 CLI 注入点——五层锚点都在，没有硬阻断。
- **真实成本重心不在"通用库"，而在"每个脚本的结果 I/O 增量化改造"**：方案正文把它轻描淡写为"脚本按类型接入适配"，实际是改写核心写盘 + 严格保证"落盘先于 markCompleted"的顺序。**这是工作量与风险的大头**。
- **必须补的管道**：JS+Java 规则双声明同步、DTO 加模式字段、新增"接着爬"控制动作 + 前端判据、"重新爬 fresh"路径、续传与 stale 锁的交互。都是中等量、无阻断。
- **强烈同意方案两点**：① 独立 resume state（不拿 progress.current 当断点）；② key + inputFingerprint 校验（seeds 是生成物会变，fingerprint 非可选）。

### 建议的落地顺序
1. 先建 `scripts/data/lib/crawler-resume-state.mjs`（读写/校验 fingerprint/`shouldSkip`/`markCompleted`/`buildResumeProgressFields`），并**收编 `resolveResumeOffset` 语义**。
2. **town_npc 做端到端 PoC**：脚本结果改逐条增量落盘 → 接 resume-state → CLI `--resume-mode` → 规则加 `resumeSupported/Mode` → DTO/控制动作/前端判据打通"接着爬"。
3. town_npc 全链路验证（中断→接着爬 只抓剩余；fresh 忽略旧 state；fingerprint 变则拒绝 resume）后，**buffs 接入 phase_keyed**。
4. items/npcs 等 backendRefresh 域另作评估（爬取循环在 Java 后端，不在 mjs，续传接入点不同）。
5. bosses/armor_sets/biomes/shimmer：`resumeSupported:false` + `restartBehavior:fresh`，只标重跑。

### 主要风险
- **R1（最高）**：脚本未做增量落盘就上 markCompleted → 续传假性生效 + 潜在数据丢失。**必须先落盘后 markCompleted，并有测试覆盖"中断后 resume 不重抓已落盘项、且不漏抓未落盘项"。**
- **R2**：JS/Java 规则双写不同步 → 前端显示能续传但派发不带参数（或反之）。
- **R3**：backendRefresh 域的爬取在 Java 侧，方案默认的"mjs 脚本接入"不适用，需单独设计。
- **R4**：续传重 spawn 与 stale 锁回收竞态。
