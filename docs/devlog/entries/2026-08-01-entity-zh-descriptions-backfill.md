# 2026-08-01 · 实体中文描述落库，并堵住会把它冲掉的回流路径

## 做了什么

三件事，顺序是被依赖关系逼出来的：先修文本清洗，再落库，最后堵回流。

- **修 `。。`**（`c20c8721`）。落库前必须做完，否则脏文本进库还得再洗一遍。
- **落库**（无代码改动，仅数据）。`boss_groups.notes` 33 行、`biomes.description` 47 行，全部由英文替换为中文 wiki 原文。分 5 批 `--limit=10 --apply=true`，0 跳过。
- **让中文能自己活下去**（`77d93eef`）。抓取脚本新增 `notesZh`，入库脚本改为优先用它，并拒绝用纯英文覆盖行内已有的中文。

## `。。` 的根因不是清洗规则写错了

源站自己就脏。`世界吞噬怪` 的段落原文是：

```html
…个体节。<sup class="reference">[1]</sup>。当任何身体体节被击杀时…
```

引用标记**两侧各有一个句号**。`cleanWikiText` 剥掉 `<sup>` 后剩 `。 。`，再被既有的 `\s+([，。…]) → $1` 规则压成 `。。`。所以清洗链每一步都是对的，缺的是最后一步收尾。

修法是折叠**连续且相同**的中文标点。限定「相同」是刻意的：`？！` 这类合法连用、以及「草草木木」这种叠字都不能碰——后者已写成守卫测试，改坏会红。

## 真正的风险不是显示英文，是下一次同步把中文冲掉

交接记的是「后端不起时前端吃兜底 JSON，所以离线看到英文」。核对下来 `front-nuxt/` 对 `data/generated/wiki-bosses.latest.json` **一处引用都没有**，吃它的是入库脚本 `import-wiki-bosses-to-db.mjs`。

而 `upsertBossGroup` 是无条件 `notes = ?` 写英文 intro 的。也就是说：**下一次 boss 同步会把刚落库的 33 行中文全部覆盖回英文**。这比展示层显示英文严重得多，也是本次真正要堵的洞。

`boss_groups` 没有 `notes_zh` 列，回填等于把 `notes` 这一列本身变成了面向中文的字段。所以入库侧要两层：

1. 有 `notesZh` 就用它；
2. 只拿到英文时，如果行内已经是中文，**保留原值**。

第 2 层是关键——它让保护不依赖于「抓取一定成功」。哪怕某个 boss 的中文页缺 intro、`notesZh` 是 null，那一行的中文也不会被冲掉。

## 提取逻辑上移到共享 lib

`extractFirstChineseParagraph` / `extractSectionParagraphByAnchor` 从回填脚本搬进 `scripts/data/lib/wiki-page-utils.mjs`，抓取脚本和回填脚本共用同一套清洗（`。。` 修复因此对两边同时生效）。

搬迁的正确性不靠人眼：回填脚本改为从 lib 导入并原样重导出，**它那 10 条既有测试一个字没改、全绿**，这就是搬迁忠实的证据。

## 坑

- **`--limit=N` 是按 scope 各自生效的**，不是总数。`--limit=10` 一批实际写 20 行（10 boss + 10 biome）。
- **分批靠「写入即出列」自然收敛**：中文写回同一列后，该行不再满足「含拉丁字母且不含汉字」，下批查询自动跳过。但**被 skip 的行不会出列**，会卡在 `ORDER BY` 前部被反复重取。所以驱动脚本必须做停滞检测（本次 `remaining` 不下降即停），否则是死循环。这次 0 跳过没触发，机制仍要留着。
- **`containsChinese` 曾在回填脚本里本地重名**。改成从 lib 导入后没删本地那份会直接语法错（重复声明），不是静默问题，但改的时候容易漏。
- **zh 页抓取失败不能让整条记录变 `error`**。很多 boss 本来就没有中文页，`notesZh` 为 null 是正常状态，不是抓取失败——让它冒泡会污染 resume 状态和 crawler monitor 的失败计数。

## 验证

- 回填脚本 10/10、抓取 4/4、入库 6/6。
- 全量 `scripts/**/*.test.mjs`：1984 例，37 失败。**取基线对比过**——`git stash` 后同一套跑出同样的 37 个失败，失败名集合逐条 diff 完全一致（只差耗时）。这 37 例是既有基线（依赖未启动的后端 / 本地栈 / relation 视图），非本次引入。
- 库内实测：boss 33/33、biome 47/47 为中文，残留英文 0，`。。` 0，句号前空格 0，空 `name_zh` 0。
- 线上实测：`世界吞噬怪` / `史莱姆王` / `石巨人` 三页走共享提取器，输出干净无双句号。
- 落库前已备份两表到仓库外 `~/terrapedia-backups/zh-backfill-pre-apply-2026-08-01.sql`；另外每批的 `reports/sync/*.json` 逐行记录 before/after，回滚可重建。

## 重新生成快照，并被它逼出两个缺陷

`data/generated/wiki-bosses.latest.json` 是**被跟踪文件**（`.gitignore` 第 137 行 `!` 反选），起初按「独立决定」留下未动。后续经确认执行了重新生成（`846027f4`），**结果暴露了两个 mock 测试不可能发现的缺陷**（`60c14fb1`）。

### 缺陷一：四根天界柱拿不到任何中文

首轮生成 33/33 成功，但 `Solar / Nebula / Vortex / Stardust Pillar` 的 `titleZh` 与 `notesZh` 全是 null。

这是全站唯一一处「英文四个页面、中文一个页面」：中文站把四柱合并进 `天界柱`，因此**四个英文页都没有 zh langlink**，常规 langlink 查询必然空手而归。回填脚本早就知道（它有一份私有的 `CELESTIAL_PILLAR_NAME_ZH`），抓取脚本不知道——同一份知识存在两处而只有一处有。

建模上分开两个字段才对：`日耀柱` 实测是指向 `天界柱#日耀柱` 的**真实重定向**，所以它继续做可点击的 `titleZh`，而 `pageTitleZh` 记真正被解析的 `天界柱`。

### 缺陷二（更严重）：那些 null 正对着数据库

`upsertBossGroup` 的 `name_zh = ?` 同样是无条件写。也就是说，拿这份快照入库会把回填刚写进去的**四个中文名抹成 NULL**。

这和 `notes` 那个洞是同一个形状，但**发生在我上一轮没守到的列上**——当时只守了 `notes`。修法一致：缺失永不覆盖。

顺带把四柱映射抽成共享模块 `scripts/data/lib/celestial-pillar-zh.mjs`，回填的私有副本删除，两边读同一份，杜绝漂移。

### 重生成的实际 diff 比预估小得多

按字段统计：`notesZh` 新增 33、`titleZh`/`pageTitleZh`/`sourceUrlZh` 各 4（四柱）、`revisionId`/`revisionTimestamp` 各 20（5 月至今上游正常编辑）。**英文 `notes` 与 `imageUrl` 一字未变。**

四柱的 `notesZh` 与库中现存文本完全一致，将来入库对这几行是 no-op，不产生 churn。

复跑验证：33/33 status ok、零 null `titleZh`/`notesZh`、0 个 `。。`、0 条 `notesZh` 不含汉字。

### 顺手补的 .gitignore

这次运行创建了 `data/generated/resume/`（爬虫检查点）。仓库里**没有任何 resume 状态被跟踪**，但也没有对应忽略规则——只是这个 checkout 之前从没跑过 boss 抓取所以没暴露。已补 `data/generated/resume/`。

## 全库中文覆盖率实测（留给后续爬虫优化）

本次范围内已齐，但那只是全库一小部分。活表逐列实测（`*_backup_*` 历史表已排除）：

**已 100%**：`biomes.description`/`name_zh` 47、`boss_groups.notes`/`name_zh` 33（本次）、`world_contexts.description` 37、`crafting_stations.name_zh` 73、`item_groups.name_zh` 34、`condition_terms.name_zh` 7。

**真正的空缺**：

| 字段 | 空缺 | 有英文源可翻 |
| --- | --- | --- |
| `npcs.behavior_notes` | **723 / 762**（覆盖率 5%） | **没有，英文也是空的** |
| `projectiles.name_zh` | 105 | — |
| `buffs.name_zh` / `tooltip_zh` | 各 48 | — |
| `items.name_zh` | 20 | — |
| `npcs.name_zh` | 4 | — |

`npcs.behavior_notes` 是最大的洞，且**与本次不是同一类问题**：本次是「有英文、换成中文」，它是中英文皆空——没有东西可翻，只能新抓中文 wiki 的 NPC 页。属于爬虫侧工作，回填脚本调参数解决不了。

### 坑一：判据会误报，别照着「英文残留」盲修

全库「含拉丁字母且不含汉字」只命中 **9 条**，逐条点名：`R.E.K. 3000`、`r/Terraria`、`r/Terraria 2023`、`UFO`、`Hoardagron`、`Spiffo`、`piu piu`。

抽查中文 wiki：`R.E.K. 3000` 的**中文页标题就是** `R.E.K. 3000`；`Spiffo` 的中文页是「毛绒Spiffo」，同样保留拉丁。**这些是中文站本身就不译的专有名词，不是待补项。** 驱动本次回填的那条判据（`isEnglishOnlyText`）会把它们全部标成候选——后续若对 name 类字段跑同样的判据，必须先过一遍白名单，否则会把正确的专有名词「翻译」坏。（`UFO`/`Hoardagron` 未查实，存疑。）

### 坑二：看着 6145 空，其实字段没被使用

`items.description_zh` 空 6145/6159、`items.tooltip_zh` 空 6153/6159，但英文 `items.description` 只有 **8** 条非空（那 8 条的中文都有），英文 `items.tooltip` **0** 条非空。**这两个字段本身基本未使用，不是缺口。** 这也解释了脚本的审计指标 `items_description_en_visible_missing_zh` 为何一直报 0——它只统计「英文可见但中文缺失」，是正确的口径。评估覆盖率时别直接数 NULL。

## 没做的事

- **`npcs.behavior_notes` 不在本次射程内。** 交接表里那 762 行（39 中文 / 723 空）不属于这个脚本覆盖的四个 scope。
- `items` 与 `world_contexts` 无需处理：审计计数均为 0。
- **没有把新快照导入数据库。** 入库是独立动作；真要跑，两层保护（`reconcileBossNotes` / `reconcileBossNameZh`）已经就位。
