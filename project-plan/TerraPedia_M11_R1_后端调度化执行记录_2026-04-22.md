# TerraPedia M11-R1 后端调度化执行记录
日期：2026-04-22  
对应里程碑：`M11-R1`

---

## 1. 本批目标

在既有统一后端刷新入口之上，补齐“按时执行”的最小闭环，让后端主线可以从手动触发进入持续调度运行。

---

## 2. 本批范围

- 调度配置解析
- 调度命令拼装
- 锁文件防重入
- scheduler 状态快照
- 本地配置模板补齐

本批不做：

- Windows 任务计划注册脚本
- 服务化托管
- heartbeat 细粒度落盘

---

## 3. 计划中的落地入口

新增 daemon 入口：

```powershell
node scripts/data/workflow/run-backend-data-refresh-daemon.mjs
```

当前设计：

- 默认从 `scripts/dev/config/local-stack.config.json` 读取 `dataRefresh`
- 支持 `--once=true` 做单轮手动执行
- 支持锁文件避免重入
- 每轮执行仍复用 `run-backend-data-refresh.mjs`
- 每轮输出独立时间戳报告
- scheduler 维护 latest 状态文件

---

## 4. 已完成改动

新增：

- `scripts/data/workflow/backend-refresh-schedule-config.mjs`
- `scripts/data/workflow/backend-refresh-schedule-config.test.mjs`
- `scripts/data/workflow/run-backend-data-refresh-daemon.mjs`

补充：

- `scripts/dev/config/local-stack.config.example.json`
- `scripts/dev/config/README.md`

当前能力：

- 从 `local-stack.config.json` 的 `dataRefresh` 读取调度参数
- 支持 `intervalMinutes / startupDelaySeconds / staleLockMinutes`
- 支持 `resume / mode / timeoutMs / steps`
- 支持 `reportDir / lockFile / stateFile`
- 支持 `--once=true` 单轮执行
- 支持 stale lock 清理

---

## 5. 验证

已执行：

```powershell
node --test scripts/data/workflow/backend-refresh-schedule-config.test.mjs
node --check scripts/data/workflow/backend-refresh-schedule-config.mjs
node --check scripts/data/workflow/run-backend-data-refresh-daemon.mjs
node scripts/data/workflow/run-backend-data-refresh-daemon.mjs --once=true --mode=plan --steps=support-sync
```

结果：

- `4` tests
- `4` pass
- daemon 语法检查通过
- `--once + --mode=plan` 可单轮执行，不触发真实抓取
- `reports/backend-refresh/backend-refresh-scheduler.latest.json` 已生成状态快照

---

## 6. 当前意义

这一步把“手动执行统一入口”推进成了“可持续定时执行的入口”。

当前还没做的，是把这个 daemon 再接到：

- Windows Task Scheduler
- 服务托管
- 更细粒度 heartbeat
