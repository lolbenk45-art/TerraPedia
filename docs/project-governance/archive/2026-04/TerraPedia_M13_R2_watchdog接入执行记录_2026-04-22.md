# TerraPedia M13-R2 watchdog 接入执行记录
日期：2026-04-22  
对应里程碑：`M13-R2`

---

## 1. 本批目标

给 daemon heartbeat 增加一层 watchdog 检查与恢复入口，方便运维快速判断 daemon 是否卡住。

---

## 2. 本批改动

新增：

- `scripts/ops/check-backend-refresh-daemon-heartbeat.ps1`
- `scripts/ops/recover-backend-refresh-daemon.ps1`

当前能力：

- 可读取 `backend-refresh-daemon.heartbeat.json`
- 可按 `StaleMinutes` 判断是否过期
- 可预览恢复命令

---

## 3. 默认入口

检查 heartbeat：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\check-backend-refresh-daemon-heartbeat.ps1
```

预览恢复命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\recover-backend-refresh-daemon.ps1 -Preview
```
