# TerraPedia M8-R3 后端刷新超时与运行说明执行记录
日期：2026-04-22  
对应里程碑：`M8-R3`

---

## 1. 目标

在统一后端刷新入口已经具备：

- 计划输出
- 执行入口
- 步骤过滤
- 状态持久化
- `resume`

之后，再补齐长任务治理中的最小超时能力和标准运行口径。

---

## 2. 本批已落能力

### 2.1 action 级 `timeoutMs`

`backend-data-refresh-plan.mjs` 现在为每个 action 带出 `timeoutMs`：

- `wiki-core-refresh`
- `item-pages-refresh`
- `recipe-reference-sync`
- `item-detail-sync`
- `town-npc-fetch`
- `town-npc-import`

并支持全局覆盖：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=town-npc-fetch --timeout-ms=5000
```

### 2.2 超时结果进入报告

report 现在新增：

- `timedOutActions`
- `actions[].timedOut`

超时的 action 会被标记为：

- `status = failed`
- `timedOut = true`

### 2.3 标准运行口径

当前可用命令已经明确为：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply --resume=true
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=town-npc-fetch,town-npc-import
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=town-npc-fetch --timeout-ms=5000
```

---

## 3. 验证

已执行：

```powershell
node --test scripts/data/workflow/backend-data-refresh-plan.test.mjs
```

结果：

- `8` tests
- `8` pass

已执行：

```powershell
node --check scripts/data/workflow/run-backend-data-refresh.mjs
```

结果：

- PASS

已执行：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=town-npc-fetch --timeout-ms=5000
```

结果：

- 输出 action 带 `timeoutMs = 5000`

---

## 4. 当前仍未解决

虽然超时参数已经具备，但长任务治理仍未完全收口：

- 没有 heartbeat
- 没有中间日志快照
- 没有按 action 单独输出 report 文件
- 没有失败自动分流到问题文档

这些属于后续运维增强项，不阻塞当前继续推进主干域后端时效链。
