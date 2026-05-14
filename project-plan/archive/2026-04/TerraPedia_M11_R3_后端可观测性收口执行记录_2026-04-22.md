# TerraPedia M11-R3 后端可观测性收口执行记录
日期：2026-04-22  
对应里程碑：`M11-R3`

---

## 1. 本批目标

把后端统一刷新主线从“有最终 report”推进到“运行中也有 heartbeat 与 action 快照”。

---

## 2. 本批改动

新增：

- `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- `scripts/data/workflow/backend-refresh-runtime-state.test.mjs`

修改：

- `scripts/data/workflow/run-backend-data-refresh.mjs`
- `scripts/data/workflow/backend-data-refresh-plan.mjs`

当前能力：

- 每个 action 都会生成独立 runtime 路径
- 每个 action 都会生成 `.snapshot.json`
- 每个 action 在运行时持续刷新 `.heartbeat.json`
- 最终 report 会带出 `heartbeatPath / snapshotPath / updatedAt`

---

## 3. 当前运行态产物

对于任意一次 report：

```text
reports/backend-refresh/history/<report-name>.json
```

其对应 action 运行态目录为：

```text
reports/backend-refresh/history/<report-name>.runtime/
```

每个 action 会生成：

- `<action-id>.snapshot.json`
- `<action-id>.heartbeat.json`

---

## 4. 验证

已执行：

```powershell
node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs
node --check scripts/data/workflow/backend-refresh-runtime-state.mjs
node --check scripts/data/workflow/run-backend-data-refresh.mjs
node --check scripts/data/workflow/run-backend-data-refresh-daemon.mjs
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=support-sync
```

结果：

- `12` tests
- `12` pass
- runtime helper / runner / daemon 语法检查通过
- `plan` 模式输出仍正常

---

## 5. 当前意义

到这一步，`M10-R3` 中记录的：

- 缺少 heartbeat
- 缺少 action 中间快照

已补成最小可用版本。

后续剩余方向收敛到：

- `M11-R4` 旧端口与运行口径清理
- `M11-R5` 最终验收收口
