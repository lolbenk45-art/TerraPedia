# 2026-07-17 Crawler V2 进程身份指纹 — 根治漂移误判 + 进程级审计

承接同日 heartbeat-race 条目的 Residual 项(WSL2 startInstant 漂移)。做了两件事:
一次系统性进程级审计,和针对审计头号根因的修复(修复C)。

## 审计结论(全路径 A–F,证据见审计任务)

单一根因贯穿最严重的一组缺陷:`findExact` 把「身份不可判定
(START_TIME_MISMATCH)」与「确认消亡(NOT_FOUND)」合并处理。WSL2 btime
漂移(实测 ~67s,后端重启/休眠后暴露)下,活着的自家进程被判 MISMATCH,
6 处调用把它当「终止已确认」:

- A1 `handleLeaseRenewalFailure` → FAILED + releaseOwnership → 僵尸 + 双跑
- A2 `cancel` → 虚假 CANCELLED,PAUSED 态则永久冻结僵尸
- A3 `reapOverdueProcess` → 不杀不隔离,reconciler 照常 TIMED_OUT + 释放域
- A4 `terminateRecorded` → 上一代孤儿被判已终止,新 epoch 无隔离
- A5/A6 `terminateStoppedLaunch`/`terminateFailedLaunch` → 冻结僵尸泄漏
- C1 重启恢复: RUNNING adopt 失败 → STALLED → TIMED_OUT + 僵尸 + retry 双跑

次级(非漂移,记入 backlog,未修): C3 被收养 attempt 因 exitCode 不可得
必然记 FAILED(应改用 progress.json 终态判定); D3/D4 watch 回调失败静默丢
终态 / representative 任选致误杀; E1 group-fallback 无身份校验; F1 隔离
TTL 仅 2 分钟且到期不复查进程存活 → 兜底缺口。

## 修复C: 漂移容错的精确进程身份(本次落地)

核心思路: 给进程身份加**第二重指纹**——launch 时已注入的
`TERRAPEDIA_CRAWLER_ATTEMPT_ID` 环境变量,启动后不可变、每 attempt 唯一,
且 /proc/<pid>/environ 对同 uid 可读。当 startInstant 不符时用它裁决,而不
再笼统判 MISMATCH。

Launcher(`ProcessBuilderCrawlerAttemptLauncher`):
- `ProcessIdentity` 增加 `attemptId` 字段(保留 2-arg 兼容构造,V1 cutover
  路径无指纹继续走严格语义)。`ManagedProcess.attemptId()` 默认 null。
- `findExact` startInstant 不符时调 `verifyFingerprint`:
  - MATCHES(environ 里 attempt id 相同)→ 当作找到,正常签发控制权
  - FOREIGN(可读且不同)→ pid 已被无关进程复用 → 返回 NOT_FOUND(我们的
    进程确实不在),**且不对该 pid 发任何信号**
  - UNKNOWN(environ 不可读/竞态)→ 保持原 START_TIME_MISMATCH,fail-closed
    不冒险
- group-fallback(根 pid 已退、组内有活成员)`selectRepresentative`: 有指纹
  要求时必须至少一名活成员 environ 带对 attempt id 才认领;全部可读且无一
  匹配 → NOT_FOUND(拒绝误控复用了该 pgid 的无关 setsid 进程,堵 E1);全部
  不可读 → 保守取首个(维持旧行为)。
- environ 解析: 读裸字节按 NUL 分割,精确匹配 `KEY=` 前缀,注入测试用
  `ProcEnvironSource` seam。

Supervisor: 把 attempt id 贯穿到所有 findExact 构造点——`terminateRecorded`
(recorded + manifest 两路)、`resolveExactProcess`(重启恢复,漂移最痛点)、
`terminateStoppedLaunch`、`terminateFailedLaunch`。这样修复在后端重启后真正
生效,而不只在同 JVM 内。

**未改上层 MISMATCH 分支语义**: 修复C 把「活着的自家进程」从 MISMATCH 里
救出来后,残留的 MISMATCH 基本只剩 environ 不可读的极少数,上层保守分支
(confirmed/unconfirmed)风险已大幅收敛。A1–A4 的分支重写(MISMATCH →
unconfirmed+quarantine)和 F1 隔离续期留作后续,当前修复已切断主发生路径。

## 验证

- Launcher 19 项(+3 新: 漂移+指纹匹配可控 / 漂移+异己指纹判 NOT_FOUND 且
  不误伤 / 根 pid 退出后指纹存活成员仍可找回)。
- Supervisor 87 / Reconciler 37 / Recovery 31 / Cutover 8 全绿。
- `*Crawler*` 全量 616 通过(10 skip 为环境假设)。整个 back 模块 compile 通过。

## Backlog(审计发现,未修)

C3 收养 exitCode / D3 回调静默丢终态 / D4 representative 误杀 / F1 隔离到期
不复查续期。均记录在此,下一轮进程健壮性迭代处理。
