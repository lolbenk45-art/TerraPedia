# 本地验收边界修复设计

## 目标

让八域完整链的本地 runtime/closure 验收只依赖本地三库与本地 API，
并在保留 API 公共读取限流的前提下完整运行 NPC loot parity 审计。

## 问题

`npc-loot-runtime-parity-audit` 对每个目标 NPC 顺序请求本地公开聚合
接口，但没有节流。`await fetch` 只保证顺序，不保证请求间隔；本地接口
快速返回时会在同一 60 秒固定窗口内超过 public-read 的 120 次限制并收到
429。该审计不需要 Wiki 数据。

项目级 `check-source-updates` 同时检查 Wiki、Steam 和官方论坛。它属于
上游新鲜度监控，不是本地 closure 的输入。默认官方 feed 检查导致八域
运行记录出现无关的 Steam 超时。

## 决策

### Runtime parity

- 保持服务端 public-read 限流 `120 次/60 秒` 不变。
- 审计新增 `requestIntervalMs`，默认 `1000`，仅约束本审计发往
  `api/public/npcs/{id}/aggregate?include=loot` 的请求起始间隔。
- 审计新增 `rateLimitRetryWaitMs`，默认 `60000`，以及
  `maxRateLimitRetries`，默认 `2`。HTTP 429 时不丢弃结果、不切换来源，
  等待后重试当前 NPC；超过次数才生成 `api_unavailable` 阻断报告。
- 这三个参数仅影响只读审计，可由 CLI 显式覆盖；不改数据库、不改变
  公开 API 契约、不关闭服务端安全限流。

### Source monitor

- `check-source-updates` 的默认 `officialCheckMode` 从 `always` 改为
  `never`。默认运行只探测 Wiki source fingerprints。
- `--official-check-mode=always` 保留给显式的版本资讯监控。官方 feed
  的状态继续只作为资讯信号，不能成为八域 closure 或数据 apply 的门槛。
- 本地 closure 继续只读取 audit/relation 报告；不调用 source monitor。

## 边界

本任务不执行 Wiki 请求、crawler、标准化、导入、relation apply、Boss 或
non-boss loot apply、数据库写入、服务重启、L1/L2 策略调整。新鲜上游数据
需要独立的受治理 source refresh 任务；它不是本地已有数据的验收前置。

## 验收

1. 三个模拟 NPC API 请求的审计在默认间隔下记录两次 1000ms 等待。
2. 模拟一次 429 后，审计等待 60000ms 并重试同一 URL；超过重试上限才
   返回 `api_unavailable`。
3. monitor 选项的默认值为 `never`，显式 `always` 仍可用。
4. 聚焦 Node 测试通过；真实本地 parity 审计不再因自身突发请求得到 429。
5. closure smoke 仍是纯本地报告读取；不会调用 Wiki 或官方 feed。

## 风险

本地其他客户端仍共享 public-read 限流。默认每秒一次会预留一半窗口容量，
429 重试用于吸收偶发共享流量；测试和运行报告必须保留实际阻断而不能将其
误报为数据不一致。
