# crawler snapshot inventory audit (2026-05-20)

## Scope

- Plan task: `I-0.5 盘点爬虫 snapshot 累积量`
- Target paths from plan: `data/raw`, `data/terraPedia`, timestamped `*.20*.json` files under `data/`
- Goal: decide whether snapshot accumulation is large enough to upgrade T-1.6 snapshot GC to Phase 0.

## Commands

From the task worktree:

```bash
find data -name "*.20*.json" -type f | wc -l
du -sh data/raw 2>/dev/null
du -sh data/terraPedia 2>/dev/null
```

Because this task runs in an isolated git worktree and local generated data can be ignored/unshared, I also ran the same read-only checks in the main local worktree at `/home/lolben/TerraPedia`.

## Results

Task worktree:

```text
timestamped json files: 4
data/raw: missing
data/terraPedia: 328K
data total: 34M
```

Main local worktree:

```text
timestamped json files: 4
data/raw: missing
data/terraPedia: 328K
data total: 143M
```

Timestamped files found:

```text
data/generated/wiki-armor-sets.2026-04-27T23-30-19.757Z.json
data/generated/wiki-armor-sets.2026-04-27T23-31-32.955Z.json
data/generated/wiki-armor-sets.2026-04-28T03-04-18.454Z.json
data/terraPedia/raw/wiki/armor_set_images.parsed.2026-04-27T19-29-52.416Z.json
```

Directory distribution:

```text
3 data/generated
1 data/terraPedia/raw/wiki
```

## Interpretation

- The current local checkout does not show a large timestamped crawler snapshot backlog.
- The plan's threshold for upgrading T-1.6 to P0 is `> 5GB` or `> 50k files`.
- The observed timestamped snapshot count is 4 files.
- `data/terraPedia` is 328K.
- `data/raw` is absent in both the task worktree and main local worktree.

## Caveat

This is a local filesystem inventory. It does not prove that other machines, CI artifacts, object storage, or historical archives have no snapshot growth problem. It only answers the current workspace state requested by I-0.5.

## I-0.5 Answer

T-1.6 snapshot GC does not need to be upgraded to P0 based on the current local workspace inventory. The current snapshot footprint is far below both escalation thresholds.
