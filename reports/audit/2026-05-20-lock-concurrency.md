# backend-refresh lock concurrency audit (2026-05-20)

## Scope

- Plan task: `I-0.2 验证后端 file-polling 监控的并发安全`
- Monitor read path: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Lock path: `reports/backend-refresh/backend-refresh.lock.json`
- Goal: identify every writer, whether writes are atomic, and what happens when concurrent backend refresh daemons contend for the same lock.

## Lock Path Ownership

The backend monitor does not write `backend-refresh.lock.json`.

- `CrawlerMonitorServiceImpl` defines `LOCK_FILE` as `reports/backend-refresh/backend-refresh.lock.json` and exposes it through `overview.lock`.
- The backend monitor reads the file with `readMonitorFile(...)`; parse failures are surfaced as unreadable monitor state, not hidden.
- Existing backend tests cover both missing lock and corrupt lock JSON.

The scheduler/daemon owns the lock file:

- `scripts/data/workflow/backend-refresh-schedule-config.mjs` sets the default lock path to `reports/backend-refresh/backend-refresh.lock.json`.
- `scripts/data/workflow/run-backend-data-refresh-daemon.mjs` passes `scheduleConfig.lockFile` into `acquireLock(...)` before running a refresh cycle.
- Local stack config also references the same path in `scripts/dev/config/local-stack.config.example.json` and local config.

Search result summary:

```text
back/src/main/java/.../CrawlerMonitorServiceImpl.java
back/src/test/java/.../CrawlerMonitorServiceImplTest.java
scripts/data/workflow/backend-refresh-schedule-config.mjs
scripts/data/workflow/run-backend-data-refresh-daemon.mjs
scripts/dev/config/local-stack.config*.json
```

## Writer Behavior

`run-backend-data-refresh-daemon.mjs` is the only code path found that writes or removes the lock file.

Initial acquire:

```js
fs.writeFileSync(lockFile, JSON.stringify(lockPayload, null, 2), {
  encoding: 'utf8',
  flag: 'wx'
});
```

This is an atomic create-if-absent operation at the filesystem level. If two daemon processes try to create the lock at the same time, one succeeds and the other gets `EEXIST`.

Held-lock behavior:

- The loser reads the existing lock payload.
- If the lock is not stale, it writes scheduler state `status: "skipped_locked"` and heartbeat `status: "skipped_locked"`, then exits the cycle with `exitCode: 0`.

Release:

```js
fs.rmSync(lockFile, { force: true });
```

Release is unconditional in `finally` after the child refresh process exits.

## Atomicity Assessment

### Lock file

- Initial lock acquisition is atomic because it uses `flag: 'wx'`.
- Lock payload writing is not temp-file plus rename, but the intended operation is create-only. Readers may still see invalid or partial JSON if a process dies during the write or if the filesystem exposes a just-created file before all bytes are written.
- Stale-lock recovery is not fully atomic:
  - it removes the existing lock with `fs.rmSync(lockFile, { force: true })`;
  - then attempts a second `writeFileSync(..., flag: 'wx')`.
  - Between remove and recreate, a third process can create the lock. The current code handles that by returning `acquired: false` when it catches `EEXIST`, so duplicate ownership is unlikely, but stale recovery is still a remove-then-create race rather than one atomic replace.

### Scheduler state and heartbeat files

Related monitor files in the same daemon are not consistently atomic:

- `run-backend-data-refresh-daemon.mjs` writes scheduler state and daemon heartbeat with direct `fs.writeFileSync(...)`.
- `scripts/data/workflow/backend-refresh-runtime-state.mjs` has an atomic `writeJsonFile(...)` helper using temp file plus rename, but the daemon file-local `writeJsonFile(...)` does not use that helper.
- This means monitor readers can still observe temporary parse errors for scheduler/heartbeat files even if the lock acquisition itself prevents duplicate refresh execution.

## Concurrent Daemon Outcome

For two concurrent daemon or manual-once processes using the same lock path:

1. Both call `acquireLock(...)`.
2. One process creates `backend-refresh.lock.json` with `flag: 'wx'` and owns the cycle.
3. The other process receives `EEXIST`, reads the lock, and skips the cycle as `skipped_locked` when the lock is fresh.
4. If the lock is stale, contenders may race through remove/recreate. Only one should win the follow-up `wx` create; losers skip.

Observed from static control flow: this prevents normal double execution of `run-backend-data-refresh.mjs`, but it does not give the monitor a fully atomic JSON file contract for the lock or adjacent scheduler files.

## Risks

- A daemon crash during initial lock write can leave a corrupt `backend-refresh.lock.json`. The backend monitor will expose it as unreadable; another daemon will parse it as `{}` and will not treat it as stale because `startedAt` is missing.
- A stale corrupt lock with missing `startedAt` is not recoverable by the stale-lock path; manual deletion or a code fix would be needed.
- Scheduler state writes are direct writes, so monitor file-polling can still see transient JSON parse failures outside the lock file.

## Recommendation

- Keep `flag: 'wx'` for initial lock ownership; it is the right primitive for lock acquisition.
- Add lock write hardening before T-0.3:
  - write lock payload to a temp file;
  - create a lock directory or use another cross-process atomic ownership primitive;
  - make stale recovery ownership-preserving and avoid remove-then-create gaps where possible;
  - treat corrupt lock payloads as stale only after conservative age checks based on file mtime.
- Replace daemon-local direct `writeJsonFile(...)` / scheduler state writes with the existing atomic helper from `backend-refresh-runtime-state.mjs`, or move the shared helper to a common module.

## I-0.2 Answer

1. Who writes `backend-refresh.lock.json`?
   - Only `scripts/data/workflow/run-backend-data-refresh-daemon.mjs` was found writing/removing it. Backend Java monitor reads it.

2. Is the lock write atomic?
   - Ownership acquisition is atomic through `flag: 'wx'`.
   - JSON visibility is not hardened with temp plus rename.
   - stale-lock recovery is not a single atomic operation.

3. What happens with two concurrent crawlers/refresh daemons?
   - One normally acquires the lock and runs.
   - The other skips as `skipped_locked`.
   - A stale-lock race is handled by the second `wx` create, but the remove/recreate window and corrupt-lock behavior are still important risks.

