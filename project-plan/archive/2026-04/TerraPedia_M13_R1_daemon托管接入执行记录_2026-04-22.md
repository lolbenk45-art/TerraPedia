# TerraPedia M13-R1 daemon 托管接入执行记录
日期：2026-04-22  
对应里程碑：`M13-R1`

---

## 1. 本批目标

把后端刷新 daemon 从“只能手动启动”推进到“可以由 Windows Task Scheduler 持续托管”。

---

## 2. 本批改动

新增：

- `scripts/ops/run-backend-refresh-daemon-host.ps1`
- `scripts/ops/register-backend-refresh-daemon-task.ps1`
- `scripts/ops/unregister-backend-refresh-daemon-task.ps1`

当前能力：

- 支持 `ONSTART / ONLOGON`
- 支持透传 `Mode / Steps / TimeoutMs`
- 持续托管入口直接调用 `run-backend-data-refresh-daemon.mjs`
- 支持 `-Preview` 只预览系统任务命令

---

## 3. 默认入口

托管 wrapper：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\run-backend-refresh-daemon-host.ps1
```

注册托管任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-daemon-task.ps1
```

卸载托管任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\unregister-backend-refresh-daemon-task.ps1
```
