# TerraPedia M8-R2 后端刷新状态持久化执行记录
日期：2026-04-22  
对应里程碑：`M8-R2`

---

## 1. 目标

把 `M8-R1` 新增的统一后端刷新入口，从“能输出计划和执行”推进到“可记录状态、可恢复执行”。

---

## 2. 本批已落能力

### 2.1 `running` 状态落盘

`run-backend-data-refresh.mjs` 在每个 action 执行前会先写入报告：

- `status = running`
- `durationMs = null`

这样长任务即使被中断，也能从报告中看到最后卡在哪一步。

### 2.2 `completed / failed / pending / running` 汇总

`backend-data-refresh-plan.mjs` 的 report 输出现在包含：

- `totalActions`
- `completedActions`
- `failedActions`
- `runningActions`
- `pendingActions`
- `actions[]`

### 2.3 `--resume=true`

统一入口支持读取已有报告：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply --resume=true
```

恢复逻辑：

- 已经 `completed` 的 action 会跳过
- `failed / running / pending` 会重新进入执行队列

### 2.4 `--steps=...`

统一入口继续支持只跑指定步骤：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=town-npc-fetch,town-npc-import
```

这用于短链路验证和局部恢复。

---

## 3. 验证

已执行：

```powershell
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
```

结果：

- `6` tests
- `6` pass

已执行：

```powershell
node --check scripts/data/workflow/run-backend-data-refresh.mjs
```

结果：

- PASS

已执行：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=town-npc-fetch,town-npc-import
```

结果：

- 正确输出 `town-npc-fetch` 与 `town-npc-import` 两个 actions

---

## 4. 未解决项

真实长跑 `apply` 仍不适合作为短时 smoke：

- `town-npc-fetch` 单步仍可能超过 120s
- 后续需要继续补 action timeout / heartbeat / snapshot report

该问题已经记录到：

- `project-plan/TerraPedia_后端数据时效问题汇总_2026-04-22.md`

---

## 5. 下一步

进入 `M8-R3`：

- 补 action timeout 参数
- 补更清晰的问题归档输出
- 补运行说明，明确 plan / apply / resume 的标准命令
