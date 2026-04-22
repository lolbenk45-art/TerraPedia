# TerraPedia M12-R1 daemon 心跳增强执行记录
日期：2026-04-22  
对应里程碑：`M12-R1`

---

## 1. 本批目标

把 daemon 从“只有 latest state”推进到“具备独立 heartbeat 文件，并在等待/运行/完成阶段持续更新”。

---

## 2. 本批改动

新增：

- `scripts/data/workflow/backend-refresh-daemon-state.mjs`
- `scripts/data/workflow/backend-refresh-daemon-state.test.mjs`

修改：

- `scripts/data/workflow/backend-refresh-schedule-config.mjs`
- `scripts/data/workflow/backend-refresh-schedule-config.test.mjs`
- `scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- `scripts/dev/config/local-stack.config.example.json`
- `scripts/dev/config/README.md`

当前能力：

- 支持 `heartbeatSeconds`
- 支持 `heartbeatFile`
- daemon 在 `booting / startup_wait / sleeping / running / completed / failed / skipped_locked` 阶段都会写 heartbeat
- daemon heartbeat 包含：
  - `pid`
  - `activeChildPid`
  - `status`
  - `generatedAt`
  - `lastOutputPath`
  - `lastActionId`

---

## 3. 新增观测文件

```text
reports/backend-refresh/backend-refresh-daemon.heartbeat.json
```

---

## 4. 验证

已执行：

```powershell
node --test scripts/data/workflow/backend-refresh-schedule-config.test.mjs scripts/data/workflow/backend-refresh-daemon-state.test.mjs
node --check scripts/data/workflow/backend-refresh-daemon-state.mjs
node --check scripts/data/workflow/backend-refresh-schedule-config.mjs
node --check scripts/data/workflow/run-backend-data-refresh-daemon.mjs
node scripts/data/workflow/run-backend-data-refresh-daemon.mjs --once=true --mode=plan --steps=support-sync
```

结果：

- `6` tests
- `6` pass
- daemon heartbeat 文件已生成
- scheduler latest state 已带出 `heartbeatFile / heartbeatMs`
