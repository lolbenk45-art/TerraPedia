# TerraPedia M13-R3 生产化托管收口
日期：2026-04-22  
对应里程碑：`M13-R3`

---

## 1. 本批目标

把 daemon 托管和 watchdog 的口径补成统一运维说明，明确“常驻托管”和“单轮计划任务”的区别。

---

## 2. 推荐托管方式

推荐优先顺序：

1. Windows Task Scheduler 托管 daemon
2. 周期单轮任务计划
3. 手动命令触发

原因：

- daemon 托管更适合持续运行与 heartbeat/watchdog 联动
- 单轮任务计划更适合简单周期补跑
- 手动命令只适合排障或临时运维

---

## 3. 当前关键入口

daemon 托管：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-daemon-task.ps1 -Preview
```

单轮周期任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-scheduled-task.ps1 -Preview
```

watchdog 检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\check-backend-refresh-daemon-heartbeat.ps1
```

watchdog 恢复：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\recover-backend-refresh-daemon.ps1 -Preview
```

---

## 4. 区别说明

daemon 托管：

- 常驻进程
- 有 daemon heartbeat
- 更适合 watchdog

单轮周期任务：

- 每次只跑一轮
- 不承担常驻心跳职责
- 更适合低复杂度定时同步
