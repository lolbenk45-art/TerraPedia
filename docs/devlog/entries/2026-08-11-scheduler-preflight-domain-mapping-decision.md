# 就绪契约决策备忘:Scheduler preflight 的域映射缺口

- 日期:2026-08-11
- 分支:`design/crawler-auto-ingestion-readiness`
- 性质:**只读调查 + 给 owner 的决策备忘**。不改代码、不改就绪契约,只出方案。
- 关联:Task 5(AWAITING_OWNER 请求)当前造不出来的**结构性真因**;`[[project_crawler-v2-scheduler-activation-review]]`

---

## 1. 一句话结论

Scheduler 正式启用 preflight 之所以 fail-closed,**不是数据不新鲜**(那两道门已单独处理),而是**就绪契约的域集和验收证据的域集用了两套不兼容的 key**:preflight 对活队列提议的 **14 个域 / 25 个操作**逐一要求"域验收 = pass",但验收 registry 只登记了 **11 个域**,且其中 5 个还带 `support.` 前缀 + 单数形——两边 join 只对上 **6 个域 / 11 个操作**,另外 **8 个域 / 14 个操作**永远拿不到证据(`evidence:null`),恒 blocked,证据再新也没用。

这是**就绪契约设计缺口**,须 owner 决策"自动摄取集到底该包含哪些域、证据怎么映射",**不是数据修复能跨、也不是消费 permit 能跨**的。

---

## 2. 两个域集从哪来(已在代码里核实)

### 2.1 preflight 域集 = 活 V2 队列 `domainStates`

`CrawlerV2SchedulerActivationPreflightServiceImpl.domainReadiness()`
(`back/.../service/impl/CrawlerV2SchedulerActivationPreflightServiceImpl.java:112`):

```
for (DomainStateDTO state : overview.getDomainStates())
    for (OperationDTO op : state.operations())
        accepted = acceptanceByDomain.get(state.domain());   // ← join key = state.domain()
        panel    = firstPanel(accepted);                      // 只取 panels[0]
        readiness.readinessStatus = isEligible(accepted, panel, sourceHash) ? "eligible" : "blocked";
```

`state.domain()` 来自 `CrawlerQueueV2ApplicationService.domainRows()`
(`.../crawlerv2/CrawlerQueueV2ApplicationService.java:706`):

```
for (CrawlerMonitorActionDefinition action : actionRegistry.all())
    domains.putIfAbsent(action.domain(), idleDomainRow(action.domain(), startAllowed));
```

→ **队列的 `domainStates` key,就是 `CrawlerMonitorActionRegistry.defaultActions()` 里每个 action 的 `domain()` 去重集**。每个域再按 `operationRows(domain)` 展开出该域全部操作。preflight 因此**逐操作**发一行 readiness(25 行)。

### 2.2 验收域集 = `domain-acceptance-registry.json`

`DomainAcceptanceServiceImpl` 读 `scripts/data/workflow/domain-acceptance-registry.json` 的 `domains[].domainId`,join key 是 `DomainDTO.getDomainId()`
(`CrawlerV2SchedulerActivationPreflightServiceImpl.java:117-118`)。

---

## 3. 精确映射表(代码核实,2026-08-11)

队列 **14 域 / 25 操作**;registry **11 域**。按 `acceptanceByDomain.get(state.domain())` 逐域 join:

| 队列域 (`action.domain()`) | 操作数 | registry 有无同名 `domainId` | join 结果 |
|---|---|---|---|
| `items` | 4 | ✅ `items` | **eligible** |
| `npcs` | 2 | ✅ `npcs` | **eligible** |
| `projectiles` | 2 | ✅ `projectiles` | **eligible** |
| `buffs` | 1 | ✅ `buffs` | **eligible** |
| `armor_sets` | 1 | ✅ `armor_sets` | **eligible** |
| `bosses` | 1 | ✅ `bosses` | **eligible** |
| `recipes` | 2 | ❌ registry 是 `support.recipe` | blocked(key 不匹配) |
| `shimmer` | 1 | ❌ registry 是 `support.shimmer` | blocked(key 不匹配) |
| `item_groups` | 2 | ❌ registry 是 `support.item_group`(单数) | blocked(key 不匹配) |
| `town_npc_maintenance` | 1 | ❌ registry 是 `support.town_npc_maintenance` | blocked(key 不匹配) |
| `biomes` | 2 | ❌ registry 根本没有 | blocked(缺条目) |
| `npc_loot` | 2 | ❌ registry 根本没有 | blocked(缺条目) |
| `boss_loot` | 2 | ❌ registry 根本没有 | blocked(缺条目) |
| `npc_crawler_facts` | 2 | ❌ registry 根本没有 | blocked(缺条目) |

- **join OK**:6 域 / **11 操作**
- **join FAIL**:8 域 / **14 操作**(4 域是命名不匹配,4 域是 registry 完全没有)
- **registry 孤儿**(有 domainId 但没有任何队列域指向):`support.recipe`、`support.shimmer`、`support.category`、`support.item_group`、`support.town_npc_maintenance`——即 registry 用 `support.` 前缀登记的正是队列不带前缀的那几个。`support.category` 队列里连域都没有。

---

## 4. 关键 reframe:preflight 门比 scheduler 实际动作**宽得多**

这是决策最重要的一条,之前的分析没点透:

**Scheduler 启用后实际只自动派发 5 个域。** 见 `CrawlerMonitorServiceImpl.isAutoEligibleRule()`(`:2692`):

```
Set.of("items","npcs","projectiles","armor_sets","buffs").contains(rule.domain())
```

changed-only sweep(`:4478-4506`)只对 `wikiDomain() && isAutoEligibleRule() && source.changed` 的规则派发,其余全部 `skipped: "domain is outside v1 changed-only auto dispatch coverage"`。

对照第 3 节:

- scheduler 真正会自动跑的 5 域(items/npcs/projectiles/armor_sets/buffs)**全部已 join-OK、已 eligible**。
- `bosses` join-OK 但**不在**自动派发集(只能手动)。
- 那 14 个 blocked 操作里,**没有一个**是 scheduler 会自动派发的;它们全是手动/预览/apply 类操作(recipe apply、biome sync、npc_loot apply……),其中不少是 `destructive` 或写库。

**含义**:preflight 现在的语义是"活队列登记的**每一个**操作都得域验收通过才放行 scheduler",但 scheduler 启用后**根本不会碰**那 14 个操作。于是 preflight 用一堆"scheduler 永远不自动触发的操作"把自己挡死了。这既可能是**有意的严格闸**(启用自动化前要求整个域面板体系全绿),也可能是**契约过宽的设计疏漏**。**哪种,只有 owner 能定。**

---

## 5. 给 owner 的三个方案

### 方案 A — 收窄 preflight 域集到"真·自动摄取集"(改就绪契约语义)

把 preflight 的域 readiness 限定到 scheduler **实际会自动派发**的集合(当前 = `isAutoEligibleRule` 的 5 域,或其 changed-only 默认操作),不再对手动/apply/预览操作要求域验收。

- 优点:门与实际自动化行为对齐;5 域现已全 eligible → **preflight 立即可过,Task 5 请求能造出来**。语义诚实(只为"要自动跑的东西"背书)。
- 缺点:是**就绪契约的实质收窄**,要 owner 明确接受"启用自动化 ≠ 全域验收绿"。需配套决定 `isAutoEligibleRule` 与 preflight 域集的**单一事实源**(现在散在两处)。
- 落点:preflight service 的域迭代改为按 auto-eligible 过滤;或让 `domainStates`/action 定义带 `autoDispatch` 标志,两处共用。

### 方案 B — 补齐 registry 别名/条目,让 14 域全 join 上(改证据契约)

给 registry 加 8 个映射:4 个命名对齐(`recipes`↔`support.recipe`、`shimmer`↔`support.shimmer`、`item_groups`↔`support.item_group`、`town_npc_maintenance`↔`support.town_npc_maintenance`,可用 alias 或直接改 `state.domain()` join 逻辑),4 个新建(`biomes`、`npc_loot`、`boss_loot`、`npc_crawler_facts`)。

- 优点:preflight 语义不变,仍"全域验收";证据体系覆盖所有登记操作。
- 缺点:**工作量大且是真活儿**——每个新域要定义 panelSet、写证据生成器、并让它们真能算出 pass。`npc_loot`/`boss_loot`/`npc_crawler_facts` 的面板要读库(`requiresDatabase`),`biomes` 要源证据。这不是改个名,是**给 4 个域补齐整条验收证据链**。而且其中 apply/destructive 操作要不要用"域验收 pass"来门控自动化,本身也存疑(它们不会被自动派发)。
- 命名不匹配的 4 个:决定统一到哪套命名(带不带 `support.` 前缀、单复数)——两套 key 各有既存消费者(见第 6 节风险),不能随手改一边。

### 方案 C — A + B 分层(推荐讨论起点)

1. **先**按方案 A 把 preflight 门收窄到自动摄取集,解锁 Task 5(附 owner 明示"本次启用只覆盖 items/npcs/projectiles/armor_sets/buffs 的 changed-only 自动派发")。
2. **再**把方案 B 作为独立的、非门控的后续工作项,逐域补齐验收证据,未来要扩自动摄取集时再纳入门。

- 优点:把"解锁自动化"与"补全验收覆盖"解耦——前者小而可控,后者大而渐进。preflight 始终只为它真放行的东西背书。
- 缺点:要 owner 接受 preflight 语义从"全域"转"自动集",并明确记录这次启用的覆盖边界。

---

## 6. 决策前必须注意的风险 / 未决点

- **命名不能随手改**:`state.domain()`(不带前缀)是 `CrawlerMonitorActionRegistry` 里 action 的 `domain()`,被派发、锁、恢复、心跳、覆盖域计算等**大量**代码用作 key(`CrawlerMonitorServiceImpl` 里几十处 `rule.domain()`)。`support.xxx` 是验收 registry 单独的 domainId 命名。**改任何一边的字符串都会波及另一套消费者**,方案 B 的"命名对齐"必须走 alias/映射,不能就地重命名。
- **`firstPanel` 只取 panels[0]**:即便 join 上,preflight 也只看每域**第一个**面板(`CrawlerV2SchedulerActivationPreflightServiceImpl.java:156`)。product 域 panels[0] = `sourceReadiness`;support 域 panels[0] = `sourceReadiness`。**域整体 status=pass 仍要求该域所有面板 non-blocking**(`aggregateDomain`),但 preflight 的 `evidencePath`/`sourceHash`/freshness 只反映首面板。方案 B 补域时要注意这个"域级 pass 判定"与"首面板取证"的错位。
- **`support.category` 是纯孤儿**:registry 有它,队列**没有**对应 action 域,当前对 preflight 无影响,但说明两套 key 是各自独立演化的,不是一次性拆分出来的。
- **apply/destructive 操作要不要进门**:`recipe-reference-apply`、`biome-sync`、`npc_loot-apply`、`boss_loot-apply`、`item-group-canonical-apply`、`npc-crawler-facts-apply` 都是 `destructive`/写库操作,且都不被 scheduler 自动派发。让它们的"域验收 pass"成为启用 scheduler 的前置门,语义上是否成立,须 owner 判。
- **门① town_npc T2 仍独立存在**:即便解决映射,`support.town_npc_maintenance` 的 b1 面板还卡在 npcs 源合同 117h 过期(唯一 producer 是消费 permit 的 t2 cutover)。这是另一道 owner 门,不被本备忘覆盖。

---

## 7. 我没有做的事(边界声明)

- 未改任何代码、未改 registry、未改就绪契约。
- 未生成/消费任何 preflight / proposal / request / packet / permit。
- 未启用 scheduler。彩排足迹(45 域面板、reresolve 报告、item-group 报告、DB 34 行修复)按用户指示**全部留作证据**,未提交、未回滚。
- 本文件是唯一新增产物,纯文档。
