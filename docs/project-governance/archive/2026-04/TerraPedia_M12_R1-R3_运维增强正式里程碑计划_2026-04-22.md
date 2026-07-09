# TerraPedia M12-R1-R3 运维增强正式里程碑计划

> 执行方式：按本计划连续执行，不再逐项确认。里程碑完成一批提交一批。

**目标：** 把当前后端刷新链从“可调度、可观测基础可用”推进到“daemon 可持续心跳、运行摘要更完整、运维口径更稳”。

**架构：** 继续以 `run-backend-data-refresh.mjs` 作为动作执行核心，`run-backend-data-refresh-daemon.mjs` 作为调度层。`M12` 只增强运维可观测与运行摘要，不扩展任何新域。

**技术栈：** Node.js 脚本、PowerShell 运维脚本、`local-stack.config.json`、`project-plan/` 运维文档。

---

## 1. 当前完成状态

已完成：

- 统一后端刷新入口
- 域并轨
- action heartbeat / snapshot
- daemon 调度
- Windows 任务计划接入
- 默认运行口径切到 `18088`
- 最终验收收口

当前明确剩余：

1. daemon 级细粒度 heartbeat
2. action / cycle 摘要增强
3. 运维增强最终收口

---

## 2. 剩余总量

剩余 `3` 批：

1. `M12-R1` daemon 级 heartbeat
2. `M12-R2` action / cycle 摘要增强
3. `M12-R3` 运维增强收口

---

## 3. M12-R1：daemon 级 heartbeat

**目标**

让 daemon 在等待、运行、锁冲突、完成这几个阶段，都能持续写心跳文件，而不是只有 latest state。

**目标文件**

- 修改：`scripts/data/workflow/backend-refresh-schedule-config.mjs`
- 修改：`scripts/data/workflow/backend-refresh-schedule-config.test.mjs`
- 新增：`scripts/data/workflow/backend-refresh-daemon-state.mjs`
- 新增：`scripts/data/workflow/backend-refresh-daemon-state.test.mjs`
- 修改：`scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- 修改：`scripts/dev/config/local-stack.config.example.json`
- 修改：`scripts/dev/config/README.md`
- 新增：`project-plan/TerraPedia_M12_R1_daemon心跳增强执行记录_2026-04-22.md`

**完成标准**

- 配置层新增 `heartbeatMs` 与 `heartbeatFile`
- daemon 等待中会持续写 heartbeat
- daemon 执行子进程期间会持续写 heartbeat
- heartbeat 中包含：
  - `status`
  - `pid`
  - `generatedAt`
  - `activeChildPid`
  - `lastOutputPath`

**最小验证**

- `node --test scripts/data/workflow/backend-refresh-schedule-config.test.mjs scripts/data/workflow/backend-refresh-daemon-state.test.mjs`
- `node --check scripts/data/workflow/backend-refresh-daemon-state.mjs`
- `node --check scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- `node scripts/data/workflow/run-backend-data-refresh-daemon.mjs --once=true --mode=plan --steps=support-sync`

**提交边界**

- 单独提交 `feat: add daemon heartbeat tracking`

---

## 4. M12-R2：action / cycle 摘要增强

**目标**

在 heartbeat 和最终 report 之外，再补一层更适合运维查看的摘要文件。

**目标文件**

- 新增：`scripts/data/workflow/backend-refresh-summary.mjs`
- 新增：`scripts/data/workflow/backend-refresh-summary.test.mjs`
- 修改：`scripts/data/workflow/run-backend-data-refresh.mjs`
- 修改：`scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- 新增：`project-plan/TerraPedia_M12_R2_运行摘要增强执行记录_2026-04-22.md`

**完成标准**

- 单轮 cycle 结束后生成摘要文件
- 摘要包含：
  - total/completed/failed/pending
  - lastActionId
  - totalDurationMs
  - timedOutActions
  - outputPath

**最小验证**

- `node --test scripts/data/workflow/backend-refresh-summary.test.mjs`
- `node --check scripts/data/workflow/backend-refresh-summary.mjs`
- `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan`
- `node scripts/data/workflow/run-backend-data-refresh-daemon.mjs --once=true --mode=plan --steps=support-sync`

**提交边界**

- 单独提交 `feat: add backend refresh summaries`

---

## 5. M12-R3：运维增强收口

**目标**

把 `M12` 的新增观测点和默认查看方式补进文档，并更新剩余问题优先级。

**目标文件**

- 修改：`project-plan/TerraPedia_M11_R5_后端时效主线最终验收收口_2026-04-22.md`
- 修改：`project-plan/TerraPedia_后端数据时效问题汇总_2026-04-22.md`
- 新增：`project-plan/TerraPedia_M12_R3_运维增强收口_2026-04-22.md`

**完成标准**

- 文档中新增 daemon heartbeat 文件位置
- 文档中新增 summary 文件位置
- 剩余问题从“缺心跳”升级为“需进一步生产化”

**最小验证**

- `node scripts/data/workflow/run-backend-data-refresh-daemon.mjs --once=true --mode=plan --steps=support-sync`
- `git status --short`
- `git diff --cached --stat`

**提交边界**

- 单独提交 `docs: update refresh ops observability`

---

## 6. 默认执行顺序

1. `M12-R1`
2. `M12-R2`
3. `M12-R3`

当前默认直接从 `M12-R1` 开始执行。
