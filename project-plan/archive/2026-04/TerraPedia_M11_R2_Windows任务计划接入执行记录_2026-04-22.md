# TerraPedia M11-R2 Windows 任务计划接入执行记录
日期：2026-04-22  
对应里程碑：`M11-R2`

---

## 1. 本批目标

把后端刷新调度从“可手动启动 daemon”推进到“可由 Windows Task Scheduler 定时触发单轮执行”。

---

## 2. 本批改动

新增：

- `scripts/ops/run-backend-refresh-scheduled.ps1`
- `scripts/ops/register-backend-refresh-scheduled-task.ps1`
- `scripts/ops/unregister-backend-refresh-scheduled-task.ps1`

当前设计：

- 任务计划程序每次只触发一轮 `--once=true`
- 实际刷新逻辑仍走 `run-backend-data-refresh-daemon.mjs`
- 调度参数优先从 `local-stack.config.json -> dataRefresh` 读取
- 支持 `Mode / Steps / TimeoutMs` 透传
- 支持 `-Preview` 预览 `schtasks` 命令，不直接写系统任务

---

## 3. 默认注册入口

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-scheduled-task.ps1
```

预览不落任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-scheduled-task.ps1 -Preview
```

移除任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\unregister-backend-refresh-scheduled-task.ps1
```

---

## 4. 验证

已执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\run-backend-refresh-scheduled.ps1 -Mode plan -Steps support-sync
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-scheduled-task.ps1 -Preview
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\unregister-backend-refresh-scheduled-task.ps1 -Preview
```

结果：

- wrapper 可触发单轮 `plan` 模式并输出 `support-sync` 计划
- 注册脚本可预览 `schtasks /Create` 命令
- 卸载脚本可预览 `schtasks /Delete` 命令

---

## 5. 当前意义

到这一步，后端刷新主线已经同时具备：

- 手动执行入口
- 常驻 daemon 调度入口
- Windows Task Scheduler 单轮触发入口

这样后续如果要正式按时抓取，默认可以直接选择：

1. 本地常驻 daemon
2. Windows 任务计划程序
