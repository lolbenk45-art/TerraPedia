# TerraPedia M12-R2 运行摘要增强执行记录
日期：2026-04-22  
对应里程碑：`M12-R2`

---

## 1. 本批目标

补一层更适合运维查看的 cycle 摘要，而不是只看完整 report 或 latest state。

---

## 2. 本批改动

新增：

- `scripts/data/workflow/backend-refresh-summary.mjs`
- `scripts/data/workflow/backend-refresh-summary.test.mjs`

修改：

- `scripts/data/workflow/run-backend-data-refresh.mjs`
- `scripts/data/workflow/run-backend-data-refresh-daemon.mjs`

当前能力：

- 主 runner 会在最终 report 旁边写 `.summary.json`
- daemon 会把 `lastSummaryPath` 写回 latest state
- summary 当前包含：
  - `totalActions`
  - `completedActions`
  - `failedActions`
  - `runningActions`
  - `pendingActions`
  - `timedOutActions`
  - `lastActionId`
  - `totalDurationMs`
  - `outputPath`

---

## 3. 摘要文件位置

```text
reports/backend-refresh/history/<report-name>.summary.json
```

---

## 4. 验证

已执行：

```powershell
node --test scripts/data/workflow/backend-refresh-summary.test.mjs
node --check scripts/data/workflow/backend-refresh-summary.mjs
node --check scripts/data/workflow/run-backend-data-refresh.mjs
node --check scripts/data/workflow/run-backend-data-refresh-daemon.mjs
```

结果：

- `2` tests
- `2` pass
- summary helper / runner / daemon 语法检查通过
