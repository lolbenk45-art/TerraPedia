# wiki-request-gate state atomicity audit (2026-05-20)

## Scope

- Plan task: `I-0.1 验证 wiki-request-gate state 写入是否原子`
- Target file: `scripts/data/lib/wiki-request-gate.mjs`
- State file under normal runtime: `data/terraPedia/generated/wiki-request-gate.latest.json`
- Goal: decide whether concurrent crawler processes can corrupt or transiently break reads of the gate state file.

## Code Findings

- `createWikiRequestGate()` keeps an in-process Promise queue at `scripts/data/lib/wiki-request-gate.mjs:49-55`.
- That queue serializes only requests made through the same Node.js process and same gate instance.
- `waitForTurn()`, `noteSuccess()`, and `noteFailure()` all call `saveGateState()` after mutating the in-memory state.
- `saveGateState()` writes directly with `fs.writeFileSync(filePath, ...)` at `scripts/data/lib/wiki-request-gate.mjs:581-587`.
- There is no temp-file plus rename pattern, no file lock, and no cross-process compare-and-swap.

Conclusion from static inspection: the write itself is not atomic from the perspective of other processes reading the same path, and the state update is not cross-process safe.

## Runtime Check

The original plan suggested starting 10 concurrent `check-upstream-updates.mjs` processes against wiki.gg. I did not run that command because the current crawler workflow guard requires monitor-visible crawler progress before executing fetch/crawler tasks, and this upstream monitor entrypoint does not provide a stable crawler `actionId` or progress path.

Instead, I ran an offline equivalent that:

- created one temporary gate state file under `/tmp/terrapedia-gate-atomicity-Np4Aib/wiki-request-gate.latest.json`;
- spawned 10 Node.js processes;
- gave each process its own `createWikiRequestGate()` instance pointing to the same temporary state path;
- used a mock `fetchFn`, so no wiki.gg request was sent;
- executed 250 `runJsonRequest()` calls per process;
- ran a reader process in parallel that repeatedly parsed the state file while the writers were active.

Command shape:

```bash
node --input-type=module <<'EOF'
# Spawn 10 worker processes sharing one temp statePath.
# Each worker imports createWikiRequestGate(), uses mock fetchFn, and runs 250 requests.
# A parallel reader loops over fs.readFileSync(statePath) + JSON.parse().
EOF
```

Observed output:

```json
{
  "workerProcessCount": 10,
  "requestsPerWorker": 250,
  "reader": {
    "reads": 1436294,
    "parseFailures": 13488,
    "emptyReads": 13488,
    "firstFailure": {
      "message": "Unexpected end of JSON input",
      "sample": "",
      "length": 0
    }
  },
  "finalState": {
    "successCount": 250,
    "lastRequestAt": "2026-05-20T04:23:59.652Z"
  }
}
```

## Interpretation

- The final file was parseable after all workers exited.
- During concurrent writes, readers observed empty file contents 13,488 times. This is consistent with direct truncate-and-write behavior from `fs.writeFileSync()`.
- `successCount` ended at 250 instead of the expected 2,500, showing cross-process lost updates. Each process loaded an initial state and maintained a private in-memory counter.
- `lastRequestAt` can move according to whichever process writes last, not according to a globally serialized gate.

## Answer To I-0.1 Questions

1. Can concurrent crawler processes damage `wiki-request-gate.latest.json`?
   - They can leave it temporarily unreadable for concurrent readers. In this offline stress run, the reader saw empty JSON during active writes.
   - The final file did not remain corrupt in this run, but direct writes provide no guarantee against process death between truncate and write.

2. Does the code use temp + rename atomic writes?
   - No. `saveGateState()` directly calls `fs.writeFileSync(filePath, ...)`.

3. Is gate state cross-process safe?
   - No. The in-process queue does not coordinate separate Node.js processes, and counters / timestamps are last-writer-wins.

## Recommended Follow-Up

- Upgrade `saveGateState()` to write to a unique temp file in the same directory, `fsync` when practical, then `rename` over the target.
- Add a narrow unit/integration test that proves readers never observe invalid JSON while multiple processes write the same state path.
- If `lastRequestAt` is intended to enforce global wiki.gg rate limiting across processes, add cross-process locking or move the gate state to a single broker process / Redis-backed lock. Atomic rename alone fixes partial reads but does not fix lost updates or global serialization.

