# Relation Warning Policy

状态：NPC / Item source / shop / loot 主链的 relation health 分级准入规则。

## 适用范围

本规则只覆盖当前 A/B 主链：

- `maint_item_sources`
- `item_source_facts`
- `item_npc_shop_relations`
- `item_npc_loot_relations`
- `item_npc_relation_audits`
- `projection_items`
- `projection_npcs`
- `projection_projectiles`
- local compat 输出：`item_acquisition_sources`、`npc_loot_entries`、`npc_shop_entries`、`npc_shop_conditions`

不覆盖 Any Item Group、recipe/shimmer group、图片同步 apply、crawler apply。Any Item Group 的 `blockedGroupReferences > 0` 仍按 X 档处理，不能按 consumer 类型降级。

## 判定入口

机器入口：

```powershell
node scripts/data/relation/relation-health-report.mjs --write-report=false
node scripts/data/relation/relation-health-report.mjs --print-checklist=true
```

代码入口：

- `scripts/data/relation/relation-health-report.mjs`
- `scripts/data/relation/relation-health-report.test.mjs`

长期报告入口：

- `reports/relation/relation-health-2026-04-30.json`
- `reports/relation/relation-health-2026-04-30.md`

## 分级规则

| 级别 | 触发条件 | 自动维护影响 | 公开消费影响 |
| --- | --- | --- | --- |
| blocking | `summary.blockingCount > 0`，或任一 check 为 `fail` / `error` | 阻断 maint/relation/projection/local compat apply | 阻断依赖该链的新公开功能和扩面 |
| warning | `summary.warningCount > 0`，且 `blockingCount = 0` | 不阻断已 resolved/promoted/accepted 数据的只读消费；apply 前必须记录并展示 warning | 不阻断既有已解析数据消费；新公开功能必须展示 warning 和样本 |
| pass | `blockingCount = 0` 且 `warningCount = 0` | 可进入下一段 dry-run 或人工批准后的 apply | 可作为 A2 发布态输入 |
| info | check 为 `info` | 只用于观察规模和构成 | 不单独决定准入 |

## Blocking Checks

以下类型必须阻断 apply 和新公开扩面：

- maint 与 relation key parity 不一致。
- relation fact 无法追溯到 maint source。
- shop/loot relation orphan。
- shop/loot relation 缺 item 或 NPC resolution。
- projection JSON 不是有效非空数组。
- local compat 输出为空。
- SQL 执行错误或期望字段不是数值。

这些 check 对应 `relation-health-report.mjs` 中的 `zero`、`nonzero`、`delta_zero` 和 error 评估。

## Warning Checks

`unresolved_item_npc_relation_audits > 0` 固定归入 warning：

- 它表示仍有 unresolved / ambiguous / polluted / rejected audit issue。
- 它不阻断已经 `resolved` / `promoted` / `accepted` 的 shop/loot 数据消费。
- 它必须进入管理端验收面、runbook 和后续人工治理列表。
- 新公开功能不得隐藏该 warning，也不得用 warning 样本推导未解析关系。

## Apply 前规则

任何写入型动作之前必须满足：

1. 没有其他 DB apply、crawler apply、image sync apply、recipe apply 正在写相同目标。
2. 已运行 source/landing 只读审计或复用最新可信报告。
3. 已完成对应 dry-run 并人工 review 输出。
4. `relation-health-report` 无 blocking。
5. warning 已登记，且不会被当作已解析事实发布。
6. 每一个 apply 命令前都需要人工批准。

## 禁止项

- 禁止用 relation warning 绕过 Any Item Group blocked gate。
- 禁止在 `blockingCount > 0` 时运行 maint/relation/projection/local compat apply。
- 禁止把 unresolved audit row 当作已解析关系公开。
- 禁止多个 agent 并行运行写同一 DB/table/scope 的 apply。
- 禁止在没有 dry-run 或报告证据时补写 local/public 表。
