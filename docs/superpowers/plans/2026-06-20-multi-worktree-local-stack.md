# 多 worktree 本地栈并行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让多个 git worktree 的本地栈能并行运行、互不干扰,开发者可同时查看不同分支的页面;同时修复 Redis 生命周期与 Node 版本约束问题。

**Architecture:** 给每个 worktree 分配一个 slot(整数,存于中央注册表 `~/.terrapedia/local-stack-slots.json`)。slot 确定性地推导出 backend/front/admin 端口偏移与 Redis DB index。Redis、MySQL 为共享单实例;Redis 用一个进程、各 worktree 用不同 DB index。

**Tech Stack:** Bash 脚本(`scripts/dev/*.sh` + `scripts/dev/lib/*.sh`),Node.js(纯函数 slot 分配器 + ESM 单测,`node:test`),Spring Boot 后端(已通过 env 读取 Redis 库号/数据库连接,无需改动)。

参考设计:`docs/superpowers/specs/2026-06-20-multi-worktree-local-stack-design.md`

---

## File Structure

- `scripts/dev/lib/slot-allocator.mjs`(新建):纯函数 `assignSlot(registry, worktreePath)` + CLI 包装(带文件锁、原子写注册表)。单一职责:slot 分配与持久化。
- `scripts/dev/slot-allocator.test.mjs`(新建):slot 分配器纯函数单测。
- `scripts/dev/start-local-stack.sh`(改):slot 解析 + 端口/库号偏移;Redis 经 `start_background` 启动并带 `--databases 64`;Node 22 preflight;应用端口归属守卫。
- `scripts/dev/stop-local-stack.sh`(改):新增 `--stop-shared` 标志,默认不停共享 Redis。
- `scripts/dev/local-stack.test.mjs`(改):为上述脚本改动补 source-grep 断言。
- `scripts/dev/quality-gate.sh` / `scripts/dev/quality-gate-ci.sh`(改):注册新单测文件。
- `.nvmrc`(新建,仓库根):内容 `22`。

> 现有约定:`local-stack.test.mjs` 是对脚本源码做正则断言的"source-grep"测试;slot 分配器逻辑抽成纯 JS 函数做真正的单元测试。沿用此约定。

---

## Task 1: slot 分配器(纯函数 + CLI)

**Files:**
- Create: `scripts/dev/lib/slot-allocator.mjs`
- Test: `scripts/dev/slot-allocator.test.mjs`

- [ ] **Step 1: 写失败测试**

创建 `scripts/dev/slot-allocator.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSlot } from './lib/slot-allocator.mjs';

test('assigns slot 0 for first worktree in empty registry', () => {
  const { slot, registry } = assignSlot({}, '/wt/a');
  assert.equal(slot, 0);
  assert.deepEqual(registry, { '/wt/a': 0 });
});

test('assigns next incremental slot for a new worktree', () => {
  const { slot, registry } = assignSlot({ '/wt/a': 0 }, '/wt/b');
  assert.equal(slot, 1);
  assert.deepEqual(registry, { '/wt/a': 0, '/wt/b': 1 });
});

test('returns existing slot for a known worktree (idempotent)', () => {
  const { slot, registry } = assignSlot({ '/wt/a': 0, '/wt/b': 1 }, '/wt/a');
  assert.equal(slot, 0);
  assert.deepEqual(registry, { '/wt/a': 0, '/wt/b': 1 });
});

test('reuses the smallest freed slot', () => {
  const { slot } = assignSlot({ '/wt/a': 0, '/wt/c': 2 }, '/wt/d');
  assert.equal(slot, 1);
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test scripts/dev/slot-allocator.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/dev/lib/slot-allocator.mjs'`

- [ ] **Step 3: 实现最小代码**

创建 `scripts/dev/lib/slot-allocator.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function assignSlot(registry, worktreePath) {
  if (Object.prototype.hasOwnProperty.call(registry, worktreePath)) {
    return { slot: registry[worktreePath], registry };
  }
  const used = new Set(Object.values(registry));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return { slot, registry: { ...registry, [worktreePath]: slot } };
}

function readRegistry(registryPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLock(registryPath, fn) {
  const lockPath = `${registryPath}.lock`;
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const deadline = Date.now() + 5000;
  let fd;
  for (;;) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() > deadline) {
        throw new Error(`Timed out acquiring slot registry lock: ${lockPath}`);
      }
      sleepSync(50);
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}

function main() {
  const [registryPath, worktreePath] = process.argv.slice(2);
  if (!registryPath || !worktreePath) {
    process.stderr.write('usage: slot-allocator.mjs <registryPath> <worktreePath>\n');
    process.exit(2);
  }
  const slot = withLock(registryPath, () => {
    const registry = readRegistry(registryPath);
    const { slot, registry: next } = assignSlot(registry, worktreePath);
    const tmp = `${registryPath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(tmp, registryPath);
    return slot;
  });
  process.stdout.write(String(slot));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `node --test scripts/dev/slot-allocator.test.mjs`
Expected: PASS(4 tests)

- [ ] **Step 5: 验证 CLI 端到端**

Run:
```bash
tmp="$(mktemp -d)"; \
a="$(node scripts/dev/lib/slot-allocator.mjs "$tmp/slots.json" /wt/a)"; \
b="$(node scripts/dev/lib/slot-allocator.mjs "$tmp/slots.json" /wt/b)"; \
a2="$(node scripts/dev/lib/slot-allocator.mjs "$tmp/slots.json" /wt/a)"; \
echo "a=$a b=$b a2=$a2"; cat "$tmp/slots.json"; rm -rf "$tmp"
```
Expected: `a=0 b=1 a2=0`,且 JSON 含 `/wt/a: 0` 与 `/wt/b: 1`

- [ ] **Step 6: Commit**

```bash
git add scripts/dev/lib/slot-allocator.mjs scripts/dev/slot-allocator.test.mjs
git commit -m "feat(dev): add per-worktree slot allocator"
```

---

## Task 2: 把 slot 分配器单测纳入质量门禁

**Files:**
- Modify: `scripts/dev/quality-gate.sh:46`
- Modify: `scripts/dev/quality-gate-ci.sh:38`
- Test: `scripts/dev/local-stack.test.mjs`(追加断言)

- [ ] **Step 1: 写失败测试**

在 `scripts/dev/local-stack.test.mjs` 末尾追加:

```js
test('slot allocator tests are included in local and ci gates', () => {
  const localGate = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const ciGate = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  assert.match(localGate, /scripts\/dev\/slot-allocator\.test\.mjs/);
  assert.match(ciGate, /scripts\/dev\/slot-allocator\.test\.mjs/);
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: FAIL — 新断言找不到 `scripts/dev/slot-allocator.test.mjs`

- [ ] **Step 3: 注册测试文件**

在 `scripts/dev/quality-gate.sh` 中,在 `scripts/dev/local-stack.test.mjs \`(第 46 行)之后新增一行:

```bash
  scripts/dev/slot-allocator.test.mjs \
```

在 `scripts/dev/quality-gate-ci.sh` 中,在 `scripts/dev/local-stack.test.mjs \`(第 38 行)之后新增一行:

```bash
  scripts/dev/slot-allocator.test.mjs \
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/quality-gate.sh scripts/dev/quality-gate-ci.sh scripts/dev/local-stack.test.mjs
git commit -m "test(dev): register slot allocator tests in quality gates"
```

---

## Task 3: Node 22 约束(.nvmrc + 启动 preflight)

**Files:**
- Create: `.nvmrc`
- Modify: `scripts/dev/start-local-stack.sh:228`(在 require 检查之后插入)
- Test: `scripts/dev/local-stack.test.mjs`(追加断言)

- [ ] **Step 1: 写失败测试**

在 `scripts/dev/local-stack.test.mjs` 末尾追加:

```js
test('start requires Node 22 via preflight and repo pins it with .nvmrc', () => {
  const source = startSource();
  const nvmrc = fs.readFileSync('.nvmrc', 'utf8').trim();

  assert.equal(nvmrc, '22');
  assert.match(source, /process\.versions\.node/i);
  assert.match(source, /Node 22\+ required/i);
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: FAIL — 找不到 `.nvmrc` / 源码无 `Node 22+ required`

- [ ] **Step 3: 创建 .nvmrc 并加 preflight**

创建仓库根 `.nvmrc`,内容:

```
22
```

在 `scripts/dev/start-local-stack.sh` 第 228 行(`require_runtime_secret_before_manifest TP_USER_TOKEN_SECRET` 之后)插入:

```bash

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf 0)"
if (( node_major < 22 )); then
  log_error "Node 22+ required (found $(node -v 2>/dev/null || printf none)). Run 'nvm use' (see .nvmrc) and retry."
  exit 1
fi
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: PASS

- [ ] **Step 5: 语法自检**

Run: `bash -n scripts/dev/start-local-stack.sh`
Expected: 无输出(语法正确)

- [ ] **Step 6: Commit**

```bash
git add .nvmrc scripts/dev/start-local-stack.sh scripts/dev/local-stack.test.mjs
git commit -m "feat(dev): pin Node 22 and add startup preflight check"
```

---

## Task 4: slot 解析 + 端口/库号偏移(start)

**Files:**
- Modify: `scripts/dev/start-local-stack.sh`(在 `load_runtime_config` 之后、`export APP_PORT` 之前插入 slot 解析)
- Test: `scripts/dev/local-stack.test.mjs`(追加断言)

- [ ] **Step 1: 写失败测试**

在 `scripts/dev/local-stack.test.mjs` 末尾追加:

```js
test('start resolves a per-worktree slot and offsets app ports plus redis db', () => {
  const source = startSource();

  assert.match(source, /local-stack-slots\.json/);
  assert.match(source, /slot-allocator\.mjs/);
  assert.match(source, /TP_BACKEND_PORT=\$\(\( TP_BACKEND_PORT \+ TP_SLOT \)\)/);
  assert.match(source, /TP_FRONT_PORT=\$\(\( TP_FRONT_PORT \+ TP_SLOT \)\)/);
  assert.match(source, /TP_ADMIN_PORT=\$\(\( TP_ADMIN_PORT \+ TP_SLOT \)\)/);
  assert.match(source, /TP_REDIS_DATABASE="\$TP_SLOT"/);
  assert.match(source, /TP_SLOT >= 64/);
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: FAIL — 源码尚无 slot 解析

- [ ] **Step 3: 插入 slot 解析函数与调用**

在 `scripts/dev/start-local-stack.sh` 中,在 `require_runtime_secret_before_manifest TP_USER_TOKEN_SECRET`(第 228 行)与 Task 3 插入的 Node preflight 之后、且在 `resolved_minio_credentials_file=""`(第 230 行)之前,插入:

```bash

resolve_local_stack_slot() {
  TP_SLOT_REGISTRY="${TERRAPEDIA_SLOT_REGISTRY:-$HOME/.terrapedia/local-stack-slots.json}"
  local worktree_root
  worktree_root="$(resolve_repo_root "$PWD")"
  TP_SLOT="$(node "$SCRIPT_DIR/lib/slot-allocator.mjs" "$TP_SLOT_REGISTRY" "$worktree_root")"
  if ! [[ "$TP_SLOT" =~ ^[0-9]+$ ]]; then
    log_error "Failed to resolve local stack slot for $worktree_root (got: ${TP_SLOT:-<empty>})"
    exit 1
  fi
  if (( TP_SLOT >= 64 )); then
    log_error "Slot $TP_SLOT exceeds shared Redis database capacity (64). Remove an unused worktree entry from $TP_SLOT_REGISTRY."
    exit 1
  fi
  TP_BACKEND_PORT=$(( TP_BACKEND_PORT + TP_SLOT ))
  TP_FRONT_PORT=$(( TP_FRONT_PORT + TP_SLOT ))
  TP_ADMIN_PORT=$(( TP_ADMIN_PORT + TP_SLOT ))
  TP_REDIS_DATABASE="$TP_SLOT"
  log_info "Local stack slot=$TP_SLOT (backend=$TP_BACKEND_PORT front=$TP_FRONT_PORT admin=$TP_ADMIN_PORT redisDb=$TP_REDIS_DATABASE)"
}

resolve_local_stack_slot
```

> 说明:`TP_BACKEND_PORT` / `TP_FRONT_PORT` / `TP_ADMIN_PORT` / `TP_REDIS_DATABASE` 由前面 `load_runtime_config`(第 221 行)从配置导出;此处在其基准值上叠加 slot 偏移,且必须在第 235 行起的 `export` 之前完成,使导出的端口与库号生效。`TP_REDIS_PORT` 不变(Redis 共享单实例)。

- [ ] **Step 4: 运行测试,确认通过**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: PASS

- [ ] **Step 5: 语法自检**

Run: `bash -n scripts/dev/start-local-stack.sh`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
git add scripts/dev/start-local-stack.sh scripts/dev/local-stack.test.mjs
git commit -m "feat(dev): derive per-worktree ports and redis db from slot"
```

---

## Task 5: Redis 经 start_background 启动并带 --databases 64

**Files:**
- Modify: `scripts/dev/start-local-stack.sh:309-316`(`start_redis_if_needed` 内的 Redis 启动段)
- Test: `scripts/dev/local-stack.test.mjs`(追加断言)

- [ ] **Step 1: 写失败测试**

在 `scripts/dev/local-stack.test.mjs` 末尾追加:

```js
test('start launches shared redis through start_background with setsid and extra databases', () => {
  const source = startSource();

  assert.match(source, /start_background "redis-\$TP_REDIS_PORT" "\$REPO_ROOT"/);
  assert.match(source, /--databases 64/);
  assert.match(source, /--requirepass <redacted> --databases 64/);
  assert.doesNotMatch(source, /nohup "\$redis_cmd" --port/);
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: FAIL — 源码仍是独立 `nohup "$redis_cmd"`

- [ ] **Step 3: 替换 Redis 启动段**

在 `scripts/dev/start-local-stack.sh` 中,把 `start_redis_if_needed()` 里以下原始段(第 309–316 行):

```bash
  local out_path err_path pid
  out_path="$(log_path "redis-$TP_REDIS_PORT")"
  err_path="$out_path.err"
  nohup "$redis_cmd" --port "$TP_REDIS_PORT" --bind "$TP_REDIS_HOST" --protected-mode yes --requirepass "$TP_REDIS_PASSWORD" >"$out_path" 2>"$err_path" &
  pid=$!
  printf '%s\n' "$pid" >"$report_dir/redis-$TP_REDIS_PORT.pid"
  append_process "redis-$TP_REDIS_PORT" "$pid" "$out_path" "$err_path" "redis-server --port $TP_REDIS_PORT --bind $TP_REDIS_HOST --protected-mode yes --requirepass <redacted>" running
  printf 'redis PID=%s log=%s\n' "$pid" "$out_path"
```

替换为:

```bash
  start_background "redis-$TP_REDIS_PORT" "$REPO_ROOT" \
    "redis-server --port $TP_REDIS_PORT --bind $TP_REDIS_HOST --protected-mode yes --requirepass <redacted> --databases 64" \
    "$redis_cmd" --port "$TP_REDIS_PORT" --bind "$TP_REDIS_HOST" --protected-mode yes --requirepass "$TP_REDIS_PASSWORD" --databases 64
```

> 说明:`start_background`(第 107 行)已用 `nohup setsid`,并写 `$report_dir/redis-$TP_REDIS_PORT.pid` 与 `append_process` 登记,故替换后 pid 文件名不变(stop 与 manifest 仍能识别)。命令文本里保留 `<redacted>` 以免泄露密码。其后的 `wait_port`(第 318 行)保持不变。

- [ ] **Step 4: 运行测试,确认通过**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: PASS

- [ ] **Step 5: 语法自检**

Run: `bash -n scripts/dev/start-local-stack.sh`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
git add scripts/dev/start-local-stack.sh scripts/dev/local-stack.test.mjs
git commit -m "fix(dev): start shared redis via setsid with extra databases"
```

---

## Task 6: 应用端口归属守卫(start)

**Files:**
- Modify: `scripts/dev/start-local-stack.sh`(在三处 `else` 分支"already running"前加守卫,并新增守卫函数)
- Test: `scripts/dev/local-stack.test.mjs`(追加断言)

- [ ] **Step 1: 写失败测试**

在 `scripts/dev/local-stack.test.mjs` 末尾追加:

```js
test('start refuses to reuse an app port owned by another worktree', () => {
  const source = startSource();

  assert.match(source, /assert_port_owned_by_worktree/);
  assert.match(source, /outside this worktree/i);
  // 三个应用服务的 else 复用分支都先校验归属
  assert.match(source, /assert_port_owned_by_worktree back "\$TP_BACKEND_PORT"/);
  assert.match(source, /assert_port_owned_by_worktree front "\$TP_FRONT_PORT"/);
  assert.match(source, /assert_port_owned_by_worktree data-query-app "\$TP_ADMIN_PORT"/);
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: FAIL

- [ ] **Step 3: 新增守卫函数**

在 `scripts/dev/start-local-stack.sh` 中,Task 4 插入的 `resolve_local_stack_slot` 函数定义之后(其调用 `resolve_local_stack_slot` 之前或之后均可,只要在使用前已定义),新增守卫函数:

```bash

assert_port_owned_by_worktree() {
  local label="$1"
  local port="$2"
  local pid cwd
  for pid in $(port_pids "$port"); do
    cwd="$(process_cwd "$pid")"
    if [[ "$cwd" == "$REPO_ROOT"* ]]; then
      continue
    fi
    log_error "$label port $port is held by pid=$pid (cwd=${cwd:-unknown}) outside this worktree ($REPO_ROOT). Likely a slot collision or stale process. Free it, or fix the slot in $TP_SLOT_REGISTRY."
    exit 1
  done
}
```

> `port_pids` 与 `process_cwd` 来自 `lib/process.sh`(已 source)。`REPO_ROOT` 在脚本第 38 行已设。

- [ ] **Step 4: 在三处复用分支加守卫**

在 `scripts/dev/start-local-stack.sh` 中,改三处 `else` 分支:

backend(原第 441–443 行):

```bash
else
  assert_port_owned_by_worktree back "$TP_BACKEND_PORT"
  printf 'back already running on %s; status=occupied\n' "$TP_BACKEND_PORT"
fi
```

front(原第 453–455 行):

```bash
else
  assert_port_owned_by_worktree front "$TP_FRONT_PORT"
  printf 'front already running on %s; status=occupied\n' "$TP_FRONT_PORT"
fi
```

data-query-app(原第 465–467 行):

```bash
else
  assert_port_owned_by_worktree data-query-app "$TP_ADMIN_PORT"
  printf 'data-query-app already running on %s; status=occupied\n' "$TP_ADMIN_PORT"
fi
```

- [ ] **Step 5: 运行测试,确认通过**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: PASS

- [ ] **Step 6: 语法自检**

Run: `bash -n scripts/dev/start-local-stack.sh`
Expected: 无输出

- [ ] **Step 7: Commit**

```bash
git add scripts/dev/start-local-stack.sh scripts/dev/local-stack.test.mjs
git commit -m "feat(dev): guard app ports against cross-worktree reuse"
```

---

## Task 7: stop 新增 --stop-shared,默认不停共享 Redis

**Files:**
- Modify: `scripts/dev/stop-local-stack.sh`(参数解析 + pid 循环跳过 redis + force-ports 跳过 redis)
- Test: `scripts/dev/local-stack.test.mjs`(追加断言)

- [ ] **Step 1: 写失败测试**

在 `scripts/dev/local-stack.test.mjs` 末尾追加:

```js
test('stop preserves shared redis unless --stop-shared is passed', () => {
  const source = stopSource();

  assert.match(source, /stop_shared=false/);
  assert.match(source, /--stop-shared/);
  assert.match(source, /redis-\*[\s\S]*stop_shared/i);
  assert.match(source, /use --stop-shared/i);
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: FAIL

- [ ] **Step 3: 加 --stop-shared 解析**

在 `scripts/dev/stop-local-stack.sh` 中,把参数解析块改为:

```bash
force_ports=false
stop_shared=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --force-ports|-ForcePorts)
      force_ports=true
      ;;
    --stop-shared|-StopShared)
      stop_shared=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/dev/stop-local-stack.sh [--force-ports] [--stop-shared]

Stops only recorded reports/local-start/*.pid processes by default.
Shared Redis is preserved unless --stop-shared is passed (other worktrees may share it).
Use --force-ports only when stale pid files are missing and configured ports are known to belong to this repo run.
EOF
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      exit 2
      ;;
  esac
  shift
done
```

- [ ] **Step 4: pid 循环跳过共享 redis**

在 `scripts/dev/stop-local-stack.sh` 中,把 pid 文件循环(原第 56–61 行)改为:

```bash
if [[ -d "$report_dir" ]]; then
  for pid_path in "$report_dir"/*.pid; do
    [[ -e "$pid_path" ]] || continue
    name="$(basename "$pid_path" .pid)"
    if [[ "$name" == redis-* ]] && ! $stop_shared; then
      log_info "skip shared redis $name (use --stop-shared to stop it)"
      continue
    fi
    stop_recorded_pid_file "$pid_path"
  done
fi
```

- [ ] **Step 5: force-ports 跳过共享 redis**

在 `scripts/dev/stop-local-stack.sh` 的 force-ports 段(原第 65–78 行),把 redis 项改为有条件加入。替换该段为:

```bash
if $force_ports; then
  log_warn "Force port cleanup requested; checking configured local stack ports after pid cleanup."
  port_targets=(
    "back:$TP_BACKEND_PORT"
    "front:$TP_FRONT_PORT"
    "data-query-app:$TP_ADMIN_PORT"
  )
  if $stop_shared; then
    port_targets=("redis:$TP_REDIS_PORT" "${port_targets[@]}")
  fi
  for label_port in "${port_targets[@]}"; do
    label="${label_port%%:*}"
    port="${label_port##*:}"
    for pid in $(port_pids "$port"); do
      stop_process_tree "$pid" "$label-port-$port"
    done
  done
fi
```

> 说明:`stop-local-stack.sh` 由 `start-local-stack.sh` 在第 282 行以无参数方式调用(`bash "$SCRIPT_DIR/stop-local-stack.sh"`),故默认 `stop_shared=false`——start 前置的 stop 不会误杀共享 Redis,符合预期(start 随后会复用已运行的 Redis)。

- [ ] **Step 6: 运行测试,确认通过**

Run: `node --test scripts/dev/local-stack.test.mjs`
Expected: PASS

- [ ] **Step 7: 语法自检**

Run: `bash -n scripts/dev/stop-local-stack.sh`
Expected: 无输出

- [ ] **Step 8: Commit**

```bash
git add scripts/dev/stop-local-stack.sh scripts/dev/local-stack.test.mjs
git commit -m "feat(dev): preserve shared redis on stop unless --stop-shared"
```

---

## Task 8: 双 worktree 手动验证

> 此任务为手动端到端验证,无自动测试。需在两个真实 worktree 中各起一次栈。

**前置:** 确保 Node 22 在 PATH(`nvm use` 或等价)。两个 worktree 路径示例:
- 主:`/home/lolben/TerraPedia`
- 另一:`/home/lolben/.config/superpowers/worktrees/TerraPedia/base-domain-crawler-monitor-2026-06-20`

- [ ] **Step 1: 跑全部脚本单测**

Run: `node --test scripts/dev/slot-allocator.test.mjs scripts/dev/local-stack.test.mjs`
Expected: 全部 PASS

- [ ] **Step 2: 在主 worktree 起栈**

Run(在 `/home/lolben/TerraPedia`): `bash scripts/dev/start-local-stack.sh`
Expected: 输出 `Local stack slot=<N>`;末尾健康行 `back/front/data-query-app` 均为 `true`;Redis 为 `true`。记录其端口。

- [ ] **Step 3: 在另一 worktree 起栈**

Run(在另一 worktree): `bash scripts/dev/start-local-stack.sh`
Expected: `Local stack slot=<M>`(M≠N);端口与 Step 2 不同;健康行全 `true`。

- [ ] **Step 4: 确认两栈共享一个 Redis、用不同库**

Run:
```bash
redis-cli -p 16380 -a root --no-auth-warning INFO keyspace
```
Expected: 输出包含多个 `dbN:` 行(两栈各自的库),证明同一 Redis 进程承载不同 DB index。

- [ ] **Step 5: 确认两栈共读同一 MySQL**

打开两个 worktree 的前端页面(各自端口),确认都能正常显示物品列表(读同一 `terria_v1_local`)。

- [ ] **Step 6: 确认 stop 不误杀共享 Redis**

Run(在 Step 3 的 worktree): `bash scripts/dev/stop-local-stack.sh`
Expected: 输出 `skip shared redis ...`;该 worktree 的 back/front/admin 被停;主 worktree 的栈与 Redis 仍在(主 worktree 前端仍可访问)。

- [ ] **Step 7: 确认 --stop-shared 能停 Redis**

仅当需要彻底清场时,在启动了 Redis 的主 worktree:
Run: `bash scripts/dev/stop-local-stack.sh --stop-shared`
Expected: Redis 被停(`redis-cli -p 16380 ping` 连接失败)。

---

## Self-Review

**Spec coverage:**
- slot 机制(注册表自动分、最小可用整数、文件锁、slot 0=基准)→ Task 1 + Task 4。
- 端口/库号推导(base+slot,Redis DB=slot,`--databases 64`,slot≥64 报错)→ Task 4 + Task 5。
- 共享 Redis 经 start_background(setsid 修复)→ Task 5。
- 应用端口归属守卫 → Task 6。
- Node 22 约束 → Task 3。
- stop `--stop-shared` 防误杀共享 Redis → Task 7。
- 测试(slot 分配器单测 + source-grep)→ Task 1/2 与各任务断言;手动双 worktree → Task 8。
- MySQL 不改、minio/flaresolverr 排除 → 计划未触碰,符合非目标。

**Placeholder scan:** 无 TBD/TODO;每个改动步骤含完整代码或完整命令。

**Type/名称一致性:** `assignSlot` 返回 `{ slot, registry }` 在 Task 1 与测试一致;shell 变量 `TP_SLOT` / `TP_SLOT_REGISTRY` / `TP_BACKEND_PORT` / `TP_FRONT_PORT` / `TP_ADMIN_PORT` / `TP_REDIS_DATABASE` 跨 Task 4/6 一致;`assert_port_owned_by_worktree` 标签 `back` / `front` / `data-query-app` 与 start 脚本既有命名一致;Redis pid 文件名 `redis-$TP_REDIS_PORT` 在 Task 5 与 stop(Task 7 的 `redis-*` 匹配)一致。
