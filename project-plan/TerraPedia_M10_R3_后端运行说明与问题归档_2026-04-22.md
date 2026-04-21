# TerraPedia M10-R3 后端运行说明与问题归档
日期：2026-04-22  
对应里程碑：`M10-R3`

---

## 1. 本批目标

把 `M8-M10` 已完成的后端数据时效主线收口成一份当前可执行的 runbook，并沉淀当前仍未解决的问题，避免后续继续依赖对话记忆推进。

---

## 2. 当前统一入口

统一入口：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs
```

当前默认编排共 `10` 个 action，执行顺序为：

1. `wiki-core-refresh`
2. `item-pages-refresh`
3. `recipe-reference-sync`
4. `item-detail-sync`
5. `boss-sync`
6. `biome-sync`
7. `town-npc-sync`
8. `independent-entity-sync`
9. `shimmer-sync`
10. `support-sync`

其中：

- `wiki-core-refresh` 负责基础主域抓取与标准化前置
- `item-pages-refresh` 负责 Item Pages 主链补充
- `support-sync` 负责 `Images / ZH Enrichment / Categories`

---

## 3. 默认运行命令

查看完整计划：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan
```

执行整条主线：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply
```

基于现有报告续跑未完成步骤：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply --resume=true
```

只看单个子链：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=support-sync
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=town-npc-sync
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync,shimmer-sync
```

统一覆盖超时：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --timeout-ms=5000
```

默认报告输出位置：

```text
reports/backend-data-refresh-YYYY-MM-DD.json
```

---

## 4. 当前最小验收

已执行：

```powershell
node --check scripts/data/workflow/run-backend-data-refresh.mjs
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=support-sync
```

结果：

- `run-backend-data-refresh.mjs` 语法检查通过
- `plan` 模式当前返回 `10` 个 action
- `support-sync` 子链可被单独筛出并输出单 action 计划

补充参考验证：

```powershell
node --test scripts/data/pipeline/support-sync-args.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs
```

结果：

- `11` tests
- `11` pass

---

## 5. 当前已收口能力

截至 `M10-R3`，统一后端刷新入口已经覆盖：

- `Items / Item Pages / Recipes / Item Relations`
- `Town NPC`
- `Boss / Boss Loot`
- `Biomes`
- `Buffs / Projectiles / Armor Sets`
- `Shimmer`
- `Images / ZH Enrichment / Categories`

这意味着本轮里程碑定义中的“基础实体域 + 增强源域 + 核心关系域 + 第二层成熟域”已经全部并入同一后端编排主线。

---

## 6. 当前未解决问题归档

### P1. 统一刷新入口仍缺少 heartbeat 与 action 中间快照

现状：

- 当前报告会记录 `running / completed / failed / pending`
- 当前支持 `resume=true`
- 当前支持 `timeoutMs` 与 `timedOut`

剩余缺口：

- 没有 heartbeat
- 没有 action 级中间产物快照

结论：

- 不阻塞当前统一入口持续使用
- 属于后续运维增强项

### P2. 真正的 apply smoke 不适合短超时验收

现状：

- 真实抓取链路本身是长任务
- `apply` 冒烟更容易被抓取时长误伤，而不是暴露真实编排错误

结论：

- 当前标准验收仍以 `unit test + node --check + plan mode` 为主
- 长链 apply 应按单独运维执行处理，不纳入短超时默认验收

### P3. `biome-sync` 仍依赖通用 standardized importer

现状：

- `run-biome-sync-pipeline.mjs` 的 import 仍走 `import-standardized-to-db.mjs`

结论：

- 当前不阻塞主线运行
- 若后续要做更细粒度治理，应拆出独立 biome importer

### P4. 历史文档仍残留旧端口 `8888`

现状：

- 当前脚本默认入口已切到本地配置解析，默认后端端口为 `18088`
- 历史文档中仍有旧端口描述

涉及文件：

- `back/README.md`
- `back/API_CRUD_DOC.md`

结论：

- 不阻塞运行
- 需要后续补一次文档对齐

### P5. 历史 tracked 生成文件仍需避免重新混入代码提交

目标文件：

```text
data/generated/recipe-material-reference.json
```

当前原则：

- 后端刷新主线改为写入 `reports/backend-refresh/recipe-material-reference.latest.json`
- 若历史 tracked 快照再次变动，不应默认混入功能提交

---

## 7. 结论

`M10-R3` 的结果不是新增一个新域，而是把当前后端数据时效主线的默认运行方式、验收方式和剩余问题收成统一口径。

到这一点为止，这条主线已经具备：

- 统一入口
- 可筛步骤执行
- 可续跑
- 可统一超时
- 可输出固定报告
- 可按成熟域分段运维

后续若继续推进，优先方向应是：

1. 调度化运行
2. heartbeat / 中间快照
3. 文档口径清理
