# 多 worktree 本地栈并行 — 设计

日期:2026-06-20
状态:已批准设计,待实施计划

## 背景与问题

开发者常并行(4+)使用多个 git worktree,同时查看不同分支的页面。当前本地栈启动脚本
(`scripts/dev/start-local-stack.sh`)假设单栈、固定端口,导致:

1. **端口共用,静默复用旧进程**:脚本只用 `tcp_check` 判断端口占用,占用即复用,不校验占用进程
   属于哪个 worktree。结果"看起来启动成功",实际连到的是另一个 worktree 的旧服务。
2. **Redis 子进程生命周期不稳**:Redis 在 `start-local-stack.sh:312` 用 `nohup ... &` 单独启动,
   **绕过了** `start_background` 助手(该助手在 `:107` 用 `nohup setsid`)。在当前执行环境里 Redis
   会随脚本退出被回收,后端访问 Redis 失败返回 500。
3. **跨 worktree 误操作风险**:stop 脚本已有"不杀别 worktree 进程"的保护(正确),但 start 侧缺少
   对称的归属判断。
4. **Node 版本无约束**:Nuxt 依赖已不适配 Node 18,需明确要求 Node 22。

## 目标

让多个 worktree 的本地栈能并行运行、互不干扰,开发者可同时查看不同分支的页面;同时修复 Redis
生命周期与 Node 版本约束问题。

## 非目标

- 不改 MySQL 隔离策略(见下"数据层决策")。
- 不纳入 minio / flaresolverr(本地配置 `enabled: false`,未使用)。
- 不做无关重构。

## 数据层决策

- **MySQL:共享单库,不改。** 所有 worktree 连同一个 `terria_v1_local`。涉及 DDL/数据破坏时,
  靠回档备份兜底(开发者现有工作方式)。
- **Redis:一个共享进程,每 worktree 一个 DB index。** 后端(Spring + Redisson)已把库号做成
  环境变量 `TERRAPEDIA_REDIS_DATABASE`(`application.yml:32`),故无需改代码,只需启动脚本为不同
  worktree 传不同库号。
  - Redisson 内部 pub/sub 频道是服务级全局、不分库,跨库锁通知会产生**一次空唤醒**(等待者重查
    自己库内的锁 key 仍持有,继续等),非数据错乱,本地开发可忽略。

## 架构

引入"每 worktree 一个 **slot**(整数)"的概念,由 slot 确定性地推导出该 worktree 的应用端口偏移
与 Redis 库号。共享基础设施(Redis 进程、MySQL)只起/用一份。

### 1. slot 分配(中央注册表)

- 注册表文件:`~/.terrapedia/local-stack-slots.json`,内容为 `{ "<worktree 顶层绝对路径>": <slot 整数> }`。
- 启动时流程:
  1. 用 `git rev-parse --show-toplevel` 取当前 worktree 顶层路径。
  2. 查注册表;命中则用既有 slot。
  3. 未命中则分配**最小可用非负整数**,写回注册表。
  4. 读改写需加文件锁(如 `flock`),避免两个 worktree 同时首启时竞争同一 slot。
- **slot 0 = 现状基准端口**,保证第一个/主 worktree 行为完全不变。

### 2. 端口与库号推导

基准端口间距均 >1000,slot 偏移(数十量级)不会跨服务相撞:

| 服务 | 基准端口 | 推导 |
|---|---|---|
| backend | 18188 | 18188 + slot |
| front | 15174 | 15174 + slot |
| admin (data-query-app) | 13001 | 13001 + slot |
| Redis | 16380(共享,端口不变) | DB index = slot |
| MySQL | 13306(共享,不变) | 不变 |

- **Redis 库号上限**:共享 Redis 启动时带 `--databases 64`,使 slot 0–63 均可用;slot ≥ 64 才报错。

### 3. 共享 vs 独立的启动逻辑

- **共享 Redis**:第一个起栈的 worktree 启动它(经 `start_background`,带 setsid);其余 worktree
  `tcp_check` 发现已运行即直接连接,仅用各自 DB index。现有"occupied 即复用"逻辑天然适配共享场景。
- **独立应用端口(backend/front/admin)**:每 slot 端口唯一,正常不会跨 worktree 撞。新增**归属
  守卫**——本 slot 的应用端口被占时,检查占用进程 cwd:
  - cwd = 本 worktree → 复用(正常重启场景)。
  - cwd = 其他 worktree 或未知 → **报错**(slot 错配或残留进程),不再静默复用。

### 4. 既有 bug 修复

- **Redis 生命周期**:将 Redis 启动从 `start-local-stack.sh:312` 的独立 `nohup ... &` 改为经
  `start_background`,统一带 setsid 与 pid/日志登记。
- **Node 版本约束**:新增仓库根 `.nvmrc`(内容 `22`),并在 start 脚本 preflight 检测 Node 主版本,
  低于 22 时报清晰错误并中止。

### 5. stop 脚本

- 保留现有"不杀别 worktree 进程"的保护。配 slot 后,默认按本 worktree 的 slot 端口停应用,天然
  只停本 worktree。
- **共享 Redis 防误杀**:默认 `stop` 不停共享 Redis(避免停 A 栈连带干掉 B/C/D 仍在用的 Redis);
  新增 `--stop-shared` 标志才显式停共享 Redis。

## 数据流

```
worktree X 起栈
  └─ 解析 slot(注册表) = s
       ├─ 应用端口 = 基准 + s  → backend/front/admin 各自起在独立端口
       ├─ Redis:若 16380 未运行则首启(共享,--databases 64);连接时 SELECT 库号 s
       └─ MySQL:连共享 13306 / terria_v1_local(不变)
```

## 错误处理

- slot 注册表读写竞争 → 文件锁串行化。
- 应用端口被其他 worktree 占用 → 报错并提示(可能 slot 错配/残留),不静默复用。
- slot ≥ 64 → 报错(超出共享 Redis 库容量)。
- Node 主版本 < 22 → preflight 报错中止。
- Redis 启动失败 → 沿用现有 `wait_port` 失败报错路径。

## 测试

- **单元**:把 slot 分配器抽为纯函数,扩入 `scripts/dev/local-stack.test.mjs`,覆盖:
  - 空注册表 → 首个 worktree 得 slot 0。
  - 已有 {A:0} → B 得 1;再 C 得 2。
  - 中间释放(如删 slot 1)→ 下一个新 worktree 复用最小可用 1。
  - 同一 worktree 复查 → 得既有 slot(幂等)。
- **手动**:从两个 worktree 各起栈,确认:
  - 应用端口互不相同且各自可访问。
  - 两栈连同一个 Redis(16380),使用不同 DB index。
  - 两栈共读同一 MySQL。
  - 从其中一个 worktree `stop`(不带 `--stop-shared`)不影响另一栈与共享 Redis。

## 受影响文件(预估)

- `scripts/dev/start-local-stack.sh`:slot 解析、端口/库号推导、Redis 经 start_background、归属守卫、
  Node preflight。
- `scripts/dev/stop-local-stack.sh`:`--stop-shared` 标志、按 slot 停应用。
- `scripts/dev/lib/*.sh`:可能新增 slot 解析/注册表读写辅助。
- `scripts/dev/local-stack.test.mjs`:slot 分配器单测。
- 仓库根 `.nvmrc`:新增,内容 `22`。
