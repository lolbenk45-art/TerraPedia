# TerraPedia M11-R3-R5 后端剩余收口正式执行计划

> 执行方式：按本计划直接内联执行，不再拆成零碎确认。步骤使用里程碑批次推进，完成一批就提交一批。

**目标：** 把当前后端数据时效主线从“已能定时跑”推进到“可观测、口径统一、可验收收口”。

**架构：** 继续以 `run-backend-data-refresh.mjs` 作为统一执行核心，以 `run-backend-data-refresh-daemon.mjs` 和 Windows Task Scheduler 作为调度层。剩余工作只围绕观测面、口径面和验收面收口，不再扩展新业务域。

**技术栈：** Node.js 脚本、PowerShell 运维脚本、本地 `local-stack.config.json` 配置、`project-plan/` 里程碑文档。

---

## 1. 当前完成状态

已完成：

- `M8` 统一后端刷新入口、状态持久化、超时控制
- `M9` 主干域持续同步闭环
- `M10` 成熟域并轨、运维说明、问题归档
- `M11-R1` 常驻调度 daemon
- `M11-R2` Windows Task Scheduler 接入

当前后端主线已经具备：

- 统一入口
- 步骤筛选
- `resume=true`
- 超时控制
- scheduler 状态文件
- Windows 定时触发入口

---

## 2. 剩余总量

剩余 `3` 批：

1. `M11-R3` 可观测性收口
2. `M11-R4` 旧端口与运行口径清理
3. `M11-R5` 最终验收与问题归档收口

这 `3` 批完成后，当前“后端按时抓取、更新、标准化、稳定入库”的主线可以视为本轮收口完成。

---

## 3. M11-R3：可观测性收口

**目标**

补齐当前明确缺失的：

- heartbeat
- action 中间快照
- 更清晰的运行中状态落盘

**目标文件**

- 修改：`scripts/data/workflow/run-backend-data-refresh.mjs`
- 修改：`scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- 新增：`scripts/data/workflow/backend-refresh-runtime-state.mjs`
- 新增：`scripts/data/workflow/backend-refresh-runtime-state.test.mjs`
- 修改：`project-plan/TerraPedia_后端数据时效问题汇总_2026-04-22.md`
- 新增：`project-plan/TerraPedia_M11_R3_后端可观测性收口执行记录_2026-04-22.md`

**落地结果**

- action 运行前写入独立 snapshot
- action 运行中写 heartbeat
- action 完成后写完成态 snapshot
- daemon latest state 与 action report 口径保持一致

**最小验证**

- `node --test scripts/data/workflow/backend-refresh-runtime-state.test.mjs`
- `node --check scripts/data/workflow/backend-refresh-runtime-state.mjs`
- `node --check scripts/data/workflow/run-backend-data-refresh.mjs`
- `node --check scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=support-sync`

**提交边界**

- 单独提交 `feat: add backend refresh heartbeat snapshots`

---

## 4. M11-R4：旧端口与运行口径清理

**目标**

把当前仍残留的旧 `8888` 默认口径清理到只剩“兼容历史测试”的必要保留，不再让运行文档和默认脚本继续输出旧口径。

**目标文件**

- 修改：`scripts/dev/start-local-stack.ps1`
- 修改：`scripts/dev/stop-local-stack.ps1`
- 修改：`scripts/dev/benchmark-read-api.ps1`
- 修改：`back/README.md`
- 修改：`back/API_CRUD_DOC.md`
- 新增：`project-plan/TerraPedia_M11_R4_后端运行口径清理执行记录_2026-04-22.md`

**边界说明**

- 保留后端 Java 中与“legacy preflight / cleaner”语义直接相关的 `8888` 测试与实现
- 只清理“当前默认运行口径”层，不改历史兼容逻辑

**最小验证**

- `node --check` 覆盖受影响 Node 脚本
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-scheduled-task.ps1 -Preview`
- 文档口径检查：`rg -n "localhost:8888|8888/api" back scripts/dev project-plan/TerraPedia_M10_R3_后端运行说明与问题归档_2026-04-22.md`

**提交边界**

- 单独提交 `fix: align backend local runtime defaults`

---

## 5. M11-R5：最终验收与问题归档收口

**目标**

把本轮后端主线最后收成一份验收结果，而不是继续散落在多个执行记录里。

**目标文件**

- 修改：`project-plan/TerraPedia_后端数据时效问题汇总_2026-04-22.md`
- 修改：`project-plan/TerraPedia_M10_R3_后端运行说明与问题归档_2026-04-22.md`
- 新增：`project-plan/TerraPedia_M11_R5_后端时效主线最终验收收口_2026-04-22.md`

**收口内容**

- 当前默认执行入口
- 当前默认调度入口
- 当前观测文件位置
- 剩余未解问题清单
- 本轮完成边界与下一阶段建议

**最小验证**

- `git status --short`
- `git diff --cached --stat`
- `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan`
- `node scripts/data/workflow/run-backend-data-refresh-daemon.mjs --once=true --mode=plan --steps=support-sync`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ops\register-backend-refresh-scheduled-task.ps1 -Preview`

**提交边界**

- 单独提交 `docs: close backend refresh milestone`

---

## 6. 默认执行顺序

严格按以下顺序执行：

1. `M11-R3`
2. `M11-R4`
3. `M11-R5`

不插入前台任务，不扩展新域，不切换到新的产品方向。

---

## 7. 风险与假设

**关键假设**

- 本轮仍以“后端时效链”作为唯一主线
- 长链 `apply` 不作为短时默认验收标准
- 现有用户目标是“稳定定时抓取 + 更新 + 标准化 + 入库”，不是现在做公开 API/前台展示

**主要风险**

- `spawnSync` 模式下 heartbeat 需要改为子进程可轮询方案
- 旧 `8888` 在部分 legacy preflight 逻辑中是有意兼容，不可误删
- Windows 任务计划脚本只做 `Preview` 验证，不应直接污染系统任务环境

---

## 8. 结论

当前不是“还有很多没做”，而是只剩 `3` 批后端收口：

- `M11-R3` 可观测性
- `M11-R4` 口径清理
- `M11-R5` 最终验收

从现在开始，默认直接进入 `M11-R3` 执行。
