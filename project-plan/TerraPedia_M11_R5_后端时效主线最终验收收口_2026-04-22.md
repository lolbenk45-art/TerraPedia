# TerraPedia M11-R5 后端时效主线最终验收收口
日期：2026-04-22  
对应里程碑：`M11-R5`

---

## 1. 本批目标

把当前后端数据时效主线的默认执行方式、调度方式、可观测文件位置和剩余问题统一收口，不再散落在多个执行记录里。

---

## 2. 当前默认入口

统一执行入口：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs
```

常驻调度入口：

```powershell
node scripts/data/workflow/run-backend-data-refresh-daemon.mjs
```

Windows 任务计划单轮入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\run-backend-refresh-scheduled.ps1
```

Windows 注册入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-scheduled-task.ps1
```

---

## 3. 当前默认运行口径

- 本地后端默认端口：`18088`
- 本地前台默认端口：`5174`
- 本地管理端默认端口：`3001`
- 本地数据库：`terria_v1_local`

当前后端文档口径已对齐到：

- `http://localhost:18088/api`
- `http://localhost:18088/api/swagger-ui.html`

---

## 4. 当前可观测文件

主 report：

```text
reports/backend-data-refresh-YYYY-MM-DD.json
reports/backend-refresh/history/*.json
```

scheduler latest：

```text
reports/backend-refresh/backend-refresh-scheduler.latest.json
```

action runtime：

```text
reports/backend-refresh/history/<report-name>.runtime/<action-id>.snapshot.json
reports/backend-refresh/history/<report-name>.runtime/<action-id>.heartbeat.json
```

---

## 5. 最终验收

已执行：

```powershell
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan
node scripts/data/workflow/run-backend-data-refresh-daemon.mjs --once=true --mode=plan --steps=support-sync
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-scheduled-task.ps1 -Preview
```

补充验证：

```powershell
node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs scripts/data/workflow/backend-data-refresh-plan.test.mjs
node --check scripts/data/workflow/backend-refresh-runtime-state.mjs
node --check scripts/data/workflow/run-backend-data-refresh.mjs
node --check scripts/data/workflow/run-backend-data-refresh-daemon.mjs
```

结果：

- 主入口 `plan` 模式正常
- daemon 单轮 `plan` 模式正常
- Windows Task Scheduler 预览命令正常
- runtime / plan 相关测试全部通过

---

## 6. 本轮完成边界

截至当前，这条后端主线已经完成：

- 基础实体域并轨
- 增强源域并轨
- 核心关系域并轨
- 第二层成熟域并轨
- 统一刷新入口
- `resume / timeout / steps`
- 调度 daemon
- Windows 任务计划接入
- action heartbeat
- action snapshot
- 运行口径统一到 `18088`

---

## 7. 剩余未解问题

### R1. daemon 级 heartbeat 仍是 latest state，而不是更细粒度周期心跳

现状：

- 当前有 scheduler state
- 当前有 action heartbeat

未做：

- 更高频 daemon 级运行心跳

### R2. 长链 apply 仍不适合作为短超时默认验收

现状：

- 当前默认验收仍以 `plan / test / check / preview` 为主

结论：

- 长链 apply 应作为单独运维执行，而不是每次开发收口都强跑

### R3. legacy Java 兼容层仍保留 `8888`

现状：

- 当前默认运行口径已切到 `18088`
- 但 Java 中与 `legacy preflight / cleaner` 直接相关的兼容逻辑仍保留 `8888`

结论：

- 这不是当前默认口径问题
- 后续若彻底移除 legacy 兼容层，再单独处理

---

## 8. 结论

本轮“后端按时抓取、更新、标准化、稳定入库”的主线，到这里可以视为阶段性收口完成。

下一阶段如果继续推进，优先级应是：

1. daemon 细粒度 heartbeat
2. action 中间摘要增强
3. 真正的生产化部署/托管
