# Buff Manual Automation Test Window Design

## Goal

让 Buff 自动化在 Wiki 长时间没有真实版本变化时仍可重复测试：管理员手动开启一个隔离、短时的测试窗口，由真实 scheduler 自然 tick 驱动 fixture；测试结果覆盖 scheduler 控制面和 Buff 完整链路，但不写正式 `terria_v1_*` 数据库、不使用正式 Redis DB15，并且不改变真实 Wiki source fingerprint。

## Scope

本设计包含两个可独立运行的测试层：

1. **Scheduler window test**：在 fixture-enabled 的隔离后端上，手动开启一次窗口，等待 `@Scheduled` 自然 tick，验证 claim、dispatch、heartbeat、terminal state、自动关闭和最终回读。
2. **Buff chain test**：复用现有 Buff T1 fixture 和 `automation-test-profile`，在一次 run-derived 的 `t1` 三数据库和专用 Redis logical DB 中验证 landing、maint、relation、projection 和 API/readback 结果。

正式 Buff runtime `18105/Redis DB15` 保持 `enabled=false`；Armor DB14 和历史 DB16 不属于测试目标。测试结果只能证明测试链路，不得转化为生产 scheduler authorization 或无人值守验收结论。

## Non-goals

- 不伪造 `Template:GetBuffInfo` 的生产 fingerprint，不改 `data/generated/wiki-source-manifest.latest.json`。
- 不在正式 `terria_v1_local`、`terria_v1_maint`、`terria_v1_relation` 或 Redis DB15 上执行测试写入。
- 不复用已消费的 scheduler packet/decision，不调用 production manual sweep 作为自然 tick 替代。
- 不让测试模式自动给正式 scheduler 授权，也不放宽正式 H8、Owner、epoch、fence 或 expiry 门禁。

## User Flow

测试入口是一个本地命令：

```bash
bash ./platform/local/run-buff-automation-test-window.sh \
  --fixture-profile=t1 \
  --window-minutes=5
```

入口执行以下顺序：

1. 为本次 run 生成唯一 `runId`，解析并固定 fixture、代码 bundle、Redis logical DB 和三库 manifest。
2. 检查正式 runtime 没有 live attempts、claims 或 fences，并确认测试目标不是 DB14/DB15/DB16。
3. 通过隔离测试后端的认证 API 手动写入 `enabled=true`、`mode=fixture-changed-only` 和固定 fixture canary；禁止调用 `/v2/automation/sweep`。
4. 等待后端 `@Scheduled` tick，通过 `/admin/crawler-monitor/overview` 和测试 progress 文件确认自然 dispatch。
5. 等待 fixture attempt 到达 terminal state，或在 `window-minutes` 到期时先执行认证 disable，再记录超时失败。
6. 独立回读 scheduler、Redis、attempt artifact、T1 三库 counts 和 Buff relation/projection exact set。
7. 无论成功、失败还是超时，都通过认证 API 恢复 `enabled=false`；恢复失败时命令退出非零并保留 owner-only evidence。

测试入口不得接收任意命令、任意数据库名、任意 Redis DB 或任意 source path。fixture、profile、数据库前缀和 Redis namespace 必须由现有注册表及 `automation-test-profile` 校验。

## Runtime Contract

测试窗口状态使用独立 artifact，不覆盖 production `automation-config.json`。artifact 至少包含：

- `schemaVersion`, `runId`, `profile`, `fixtureId`, `fixtureSha256`
- `startedAt`, `expiresAt`, `disabledAt`, `status`
- backend URL、测试 Redis logical DB、测试 epoch、三库名称和 server fingerprint
- enable/disable API response、自然 tick 时间、attempt/queue ID、progress/report paths
- terminal result、landing/maint/relation/projection readback 和 failure reason

窗口限制：

- 仅允许 `t1`，默认 5 分钟，最大 15 分钟。
- 一次只允许一个窗口；已有 live attempt、claim、fence 或未回收 lock 时 fail closed。
- fixture source identity 使用 run-derived hash，只在 test namespace 有效。
- 到期自动 disable；disable 后仍需确认 live attempts、claims 和 fences 清零。

## Components

- `platform/local/run-buff-automation-test-window.sh`: 本地入口、参数校验、窗口 lifecycle、终态恢复。
- `pipelines/automation/buff-automation-test-window.mjs`: 生成 manifest、校验 fixture/profile/DB/Redis 隔离、写 owner-only evidence、解析 API/readback。
- `pipelines/automation/buff-automation-test-window.test.mjs`: 覆盖参数、路径、DB/Redis 禁止列表、expiry、disable-on-failure、artifact hash 和自然 tick 结果解析。
- `services/catalog-api` fixture-only control path: 仅在 fixture-enabled 测试 profile 接受 `mode=fixture-changed-only`，产生已注册的 fixture source identity；production profile 拒绝该 mode。
- `pipelines/buff/buff-canonical-t1-acceptance.mjs`: 继续负责隔离三库 Buff chain 验证，不修改正式库。

## Failure Handling

- preflight、fixture hash、server fingerprint、Redis reservation、profile 或 namespace 不匹配：开启前失败，不写 scheduler state。
- enable 成功但自然 tick 未出现：到期后 disable，保留 blocked/timeout evidence，不能改用 manual sweep 补偿。
- attempt 非零退出、heartbeat stale、reconciler unhealthy 或 readback 不一致：立即 disable；保留原始 artifact，不重试同一 runId。
- disable 或 fence cleanup 无法确认：测试状态为 `blocked`，命令非零退出；后续恢复必须使用新的 owner action，不能删除 Redis 或直接 SQL 清理。

## Validation

Unit/contract validation:

```bash
node --test pipelines/automation/buff-automation-test-window.test.mjs
node --test pipelines/automation/automation-test-profile.test.mjs
node --test pipelines/buff/buff-canonical-t1-acceptance.test.mjs
```

Runtime validation uses an isolated fixture-enabled backend and test profile only. It must show a natural scheduler tick, terminal fixture attempt, automatic disable, zero live test work, exact T1 chain readback, and no formal database/Redis writes. Production Buff acceptance remains a separate gate requiring a real source fingerprint delta and fresh scheduler authorization.

## Open Boundary

This design deliberately separates “manual test window” from production authorization. The implementation must not add a hidden production bypass or make `enabled=true` persistent after the bounded window.
