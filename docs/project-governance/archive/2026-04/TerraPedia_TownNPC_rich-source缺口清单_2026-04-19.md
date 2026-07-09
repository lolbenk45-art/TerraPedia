# TerraPedia Town NPC Rich Source 缺口清单

日期：2026-04-19  
执行分支：`feature/npc-domain-m1-m2`  
归档参考：`archive/wiki-crawler-v1-99cafd2`

---

## 1. 这份清单解决什么问题

这份文档用于冻结 `Town NPC rich source` 当前还没有闭环的缺口，避免后续把两类问题混在一起：

1. 主线当前没有提升 crawler 产物，因此 `alreadyCrawled = 0`
2. 即使参考 `wiki-crawler-v1` 的已跑结果，仍然存在一组真正没有被当前“按单页标题抓取”策略覆盖的 Town NPC

这两类问题不是一回事。

---

## 2. 当前事实

### 2.1 主线当前事实

在 `feature/npc-domain-m1-m2` 上执行：

```powershell
node data/wiki-crawler/src/cli.mjs coverage-audit --domain=npc --source-standardized-dir=data/standardized --crawler-output-root=data/wiki-crawler
```

得到 `p0_town` 摘要：

- `townTotal = 39`
- `townResolved = 29`
- `townMissing = 10`
- `townAlreadyCrawled = 0`

说明：

- 主线已经有了可执行的 crawler 工具链
- 主线没有引入任何已生成的 crawler fanout 产物，所以 `alreadyCrawled = 0` 是预期结果
- 当前真正需要冻结的仍然是那 `10` 个 `missing` Town NPC

### 2.2 归档分支参考事实

从归档 tag `archive/wiki-crawler-v1-99cafd2` 读取历史 `coverage-audit.latest.json`，`p0_town` 摘要为：

- `townTotal = 39`
- `townResolved = 29`
- `townMissing = 10`
- `townAlreadyCrawled = 29`

说明：

- 被解析成功的 `29` 个 Town NPC 页面，在旧分支里已经跑通过一轮 rich-source 产物
- 当前真正未解决的集合，与主线重跑结果一致，仍然是 `10` 个

---

## 3. 冻结缺口名单

当前 `p0_town` unresolved 集合：

- `Cat`
- `Dog`
- `Clumsy Slime`
- `Cool Slime`
- `Diva Slime`
- `Elder Slime`
- `Mystic Slime`
- `Nerdy Slime`
- `Squire Slime`
- `Surly Slime`

---

## 4. 缺口归因

### 4.1 命名不一致

这类不是“wiki 没有内容”，而是当前 `pageTitle -> wiki page title` 映射不正确。

| 标准化名称 | 当前请求标题 | wiki 搜索结果 | 归因 |
| --- | --- | --- | --- |
| Cat | `Cat` | `Town Cat` | 页面命名不一致，应改为别名映射 |
| Dog | `Dog` | `Town Dog` | 页面命名不一致，应改为别名映射 |

### 4.2 不应按单独实体页抓取

这类不是“页面缺失”，而是当前抓取策略错把聚合页下的子成员当成独立 wiki 页面。

| 标准化名称 | 当前请求标题 | wiki 搜索结果 | 归因 |
| --- | --- | --- | --- |
| Clumsy Slime | `Clumsy Slime` | `Town Slimes` | 应挂到聚合页，不应单独按标题抓取 |
| Cool Slime | `Cool Slime` | `Town Slimes` | 应挂到聚合页，不应单独按标题抓取 |
| Diva Slime | `Diva Slime` | `Town Slimes` | 应挂到聚合页，不应单独按标题抓取 |
| Elder Slime | `Elder Slime` | `Town Slimes` | 应挂到聚合页，不应单独按标题抓取 |
| Mystic Slime | `Mystic Slime` | `Town Slimes` | 应挂到聚合页，不应单独按标题抓取 |
| Nerdy Slime | `Nerdy Slime` | `Town Slimes` | 应挂到聚合页，不应单独按标题抓取 |
| Squire Slime | `Squire Slime` | `Town Slimes` | 应挂到聚合页，不应单独按标题抓取 |
| Surly Slime | `Surly Slime` | `Town Slimes` | 应挂到聚合页，不应单独按标题抓取 |

### 4.3 当前没有发现的类型

- 当前这批 `10` 个缺口里，没有证据表明它们是“wiki 完全不存在”
- 当前这批 `10` 个缺口里，也没有证据表明它们应继续作为 `eligibleBatch` 进入下一轮单页批抓

---

## 5. 对后端适配的影响

### 5.1 会阻断什么

如果后端或导入链路坚持以下假设，这 `10` 个缺口会直接阻断适配：

- 一个 Town NPC 必须对应一个同名独立 wiki 页面
- `entityId` 可以直接映射到单一 `pageTitle`
- rich-source 只允许“单实体单页”的抓取模式

### 5.2 不会阻断什么

如果 crawler / bridge / backend 改成以下口径，这 `10` 个缺口不构成实质阻断：

- 支持 `alias title` 映射
- 支持 `group page` 到多实体的拆分映射
- Town NPC backend 只消费冻结后的结构化字段，而不是直接绑定原始 page title

结论：

**这 10 个缺口阻断的是“当前 page-title 抓取策略”，不是 Town NPC backend 本身。**

---

## 6. 冻结后的下一步

下一步不应该继续盲抓这 `10` 个标题，而应该拆成两条修正线：

1. `Cat` / `Dog`
   - 在 coverage / live-source 层支持 `Town Cat`、`Town Dog` 这种 alias title 映射
2. `Town Slimes` 子集
   - 在 domain / parser / bridge 层支持“一个聚合页拆成多个 Town Slime 实体”

在这两条修正完成前：

- 不要把这 `10` 个对象继续当作普通 `missing page` 处理
- 不要把它们塞进下一轮 `eligibleBatch`
- 不要让后端直接围绕这 `10` 个标题写死映射逻辑
