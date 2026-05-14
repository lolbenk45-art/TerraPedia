# TerraPedia M13-R1-R3 生产化托管增强计划

> 执行方式：按本计划连续执行，不再逐项确认。里程碑完成一批提交一批。

**目标：** 把当前后端刷新链从“可调度运行”推进到“可持续托管、可被 watchdog 检查、可用文档直接接管”。

**架构：** 继续保留现有单轮任务计划脚本用于周期触发，同时新增 daemon 托管入口，适配 Windows Task Scheduler 的 `ONSTART / ONLOGON` 模式。watchdog 读取 daemon heartbeat 进行健康检查，不直接耦合业务域逻辑。

**技术栈：** PowerShell 运维脚本、Node.js daemon/heartbeat 文件、`project-plan/` 运维文档。

---

## 1. 剩余总量

剩余 `3` 批：

1. `M13-R1` Windows daemon 托管入口
2. `M13-R2` watchdog 检查与恢复入口
3. `M13-R3` 生产化托管收口

---

## 2. M13-R1：Windows daemon 托管入口

**目标**

让后端刷新 daemon 可以通过 Windows Task Scheduler 按 `ONSTART` 或 `ONLOGON` 方式持续托管，而不是只支持单轮周期任务。

**目标文件**

- 新增：`scripts/ops/run-backend-refresh-daemon-host.ps1`
- 新增：`scripts/ops/register-backend-refresh-daemon-task.ps1`
- 新增：`scripts/ops/unregister-backend-refresh-daemon-task.ps1`
- 新增：`project-plan/TerraPedia_M13_R1_daemon托管接入执行记录_2026-04-22.md`

**完成标准**

- 可预览 daemon 托管注册命令
- 支持 `ONSTART / ONLOGON`
- 支持透传 `Mode / Steps / TimeoutMs`
- 托管入口实际调用 `run-backend-data-refresh-daemon.mjs`

**最小验证**

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\run-backend-refresh-daemon-host.ps1 -Mode plan -Steps support-sync`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-daemon-task.ps1 -Preview`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\unregister-backend-refresh-daemon-task.ps1 -Preview`

**提交边界**

- 单独提交 `feat: add daemon hosting task scripts`

---

## 3. M13-R2：watchdog 检查与恢复入口

**目标**

给 heartbeat 文件补一层 watchdog 脚本，提供“检查是否过期”和“必要时重新触发 daemon 托管”的运维入口。

**目标文件**

- 新增：`scripts/ops/check-backend-refresh-daemon-heartbeat.ps1`
- 新增：`scripts/ops/recover-backend-refresh-daemon.ps1`
- 新增：`project-plan/TerraPedia_M13_R2_watchdog接入执行记录_2026-04-22.md`

**完成标准**

- watchdog 可读取 `backend-refresh-daemon.heartbeat.json`
- 支持 `staleMinutes` 判定
- 支持 `-Preview` 恢复命令

**最小验证**

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\check-backend-refresh-daemon-heartbeat.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\recover-backend-refresh-daemon.ps1 -Preview`

**提交边界**

- 单独提交 `feat: add daemon watchdog scripts`

---

## 4. M13-R3：生产化托管收口

**目标**

把 daemon 托管和 watchdog 的最终口径补进运维文档，形成“如何持续托管 + 如何排障恢复”的单一入口。

**目标文件**

- 修改：`project-plan/TerraPedia_M11_R5_后端时效主线最终验收收口_2026-04-22.md`
- 新增：`project-plan/TerraPedia_M13_R3_生产化托管收口_2026-04-22.md`

**完成标准**

- 明确推荐托管方式
- 明确 watchdog 使用方式
- 明确单轮计划任务与常驻 daemon 的区别

**最小验证**

- `git status --short`
- `git diff --cached --stat`
- 预览相关脚本命令全部可运行

**提交边界**

- 单独提交 `docs: document daemon hosting workflow`

---

## 5. 默认执行顺序

1. `M13-R1`
2. `M13-R2`
3. `M13-R3`

当前默认直接从 `M13-R1` 开始执行。
