# 本地验收边界修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在不访问外网、不改数据库的条件下，使本地 NPC loot runtime parity
审计遵守 API 限流，并使默认 source monitor 只检查 Wiki。

**架构：** parity 审计在 API client 边界注入等待函数，通过 CLI 参数控制
请求间隔和 429 重试。source monitor 的官方 feed 默认关闭，显式参数才打开。
本地 closure 继续只消费本地审计报告。

**技术栈：** Node.js ESM、node:test、Spring Boot 本地 API、MySQL 只读。

---

### 任务 1：Runtime parity 请求节流

**文件：**
- 修改：`pipelines/audit/npc-loot-runtime-parity-audit.mjs`
- 测试：`pipelines/audit/npc-loot-runtime-parity-audit.test.mjs`

- [ ] 写 RED 测试：三个 API target 使用注入的 `sleep`，断言默认仅在第二、
  第三次请求前等待 `1000ms`。
- [ ] 运行 `node --test pipelines/audit/npc-loot-runtime-parity-audit.test.mjs`，
  确认因尚未调用 `sleep` 失败。
- [ ] 增加 `requestIntervalMs`、`rateLimitRetryWaitMs`、
  `maxRateLimitRetries` 的 CLI/运行时默认值；在每次 API 请求后保持下一次
  请求的最小起始间隔。
- [ ] 写 RED 测试：模拟第一个 API response 为 429，断言同 URL 在
  `60000ms` 后重试且最终成功；模拟连续 429 超过上限，断言报告为
  `api_unavailable`。
- [ ] 实现仅对 HTTP 429 生效的等待与同一 target 重试；其它 HTTP 错误保持
  原有阻断语义。
- [ ] 重跑同一 Node 测试，预期全部通过。

### 任务 2：Wiki-only monitor 默认值

**文件：**
- 新增：`pipelines/monitor/source-update-monitor-options.mjs`
- 修改：`pipelines/monitor/check-source-updates.mjs`
- 测试：`pipelines/monitor/check-source-updates.test.mjs`

- [ ] 写 RED 测试，直接断言空选项解析为 `never`，显式 `always` 与 `never`
  分别保持原值。
- [ ] 运行 `node --test pipelines/monitor/check-source-updates.test.mjs`，
  确认新模块缺失导致失败。
- [ ] 提取并导出官方 feed 模式解析函数，默认返回 `never`；monitor 使用该
  函数，保留 `--official-check-mode=always`。
- [ ] 重跑 source monitor 测试，预期所有测试通过且不访问真实 Steam。

### 任务 3：本地验收与任务记录

**文件：**
- 修改：`docs/devlog/current.md`
- 修改：`docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`

- [ ] 运行两个聚焦 Node 测试文件；记录实际结果。
- [ ] 使用 `--write-report=false` 运行 runtime parity 与 closure smoke；确认
  命令只访问本地三库和 `localhost:18091`，不调用 source monitor。
- [ ] 更正 devlog 中“519 source blocker”的过时描述：最新 domain audit 已
  通过，closure 的数据 blocker 为零；未完成项仍包括图片 lineage 与受治理
  loot/relation apply。
- [ ] 运行 `git diff --check` 和目标术语扫描；将计划复选框更新为真实状态。

## 禁止项

- 不运行 crawler、source refresh、标准化、import、relation apply 或直接 SQL。
- 不关闭 API 限流、不重启服务、不变更数据库状态。
- 不将 Steam/官方论坛结果写入八域 source manifest 或 closure 门禁。
