# MySQL Full Backup and Binlog Purge Handoff - 2026-10-13

## Status

`closed`

## Purpose

Record the root-session storage operation for lolben to reconcile into
`docs/devlog/current.md` and the workspace-storage-cleanup entry. No source,
formal table, or application data was changed.

## Full Backup

- Destination: `D:\Mysql\TerriaData`, mounted at `/mnt/d/Mysql/TerriaData`.
- Archive: `terrapedia-formal-full-20261013.sql.gz` (`2,009,085,340` bytes).
- SHA-256: `41dfe4cd086c2182defe2371c17d2d18556aa9432b5962a710caa6d38a38bff4`.
- Companion files: `.sha256` and `.preflight.tsv` beside the archive.
- Databases: `terria_v1_local`, `terria_v1_maint`, `terria_v1_relation`, and
  `terria_v1_v55_rehearsal`.
- Preflight table counts: local `272`, maint `39`, relation `55`, rehearsal
  `18`.
- Dump used `mysqldump --source-data=2 --single-transaction --quick
  --skip-lock-tables --routines --events --triggers --hex-blob
  --no-tablespaces --set-gtid-purged=OFF`, piped through `gzip -1`.
- Backup records source binlog position `binlog.000197:158`. `gzip -t` passed
  and recomputed SHA-256 matched the recorded digest.
- A separate archive of 158 `terria_v1_local` backup/pre-restore tables was
  also exported to `terria_v1_local-backup-tables-20261013.sql.gz` (44,712,514
  bytes; SHA-256
  `b8712a1894a45347e5a7ddb510b9f409af987381a86454e054e494c555be0ded`). It
  imported successfully into a temporary verification database with 158
  tables; that temporary database was dropped afterward.

## Binlog Purge

- Immediately before purge, `SHOW BINARY LOG STATUS` reported
  `binlog.000197`, position `158`, matching the full-backup source position.
- Executed `PURGE BINARY LOGS TO 'binlog.000197'`.
- MySQL confirmed only `binlog.000197` remained, at position `158`. Formal
  database table counts were unchanged.
- The purge removed binlogs `000164` through `000196`; files `000187` through
  `000192` accounted for about `23.13 GiB`.
- Root filesystem use fell from about `114 GiB` to `91 GiB`; `/var/lib/mysql`
  fell from about `41 GiB` to `17 GiB`.

## Verification Limits and Follow-up

- The full four-database archive passed gzip integrity and SHA-256 checks, but
  has not yet been restored as a complete set into an isolated MySQL instance.
  Treat full-database restore rehearsal as pending before relying on it as the
  only recovery point.
- The dedicated 158-table archive did pass an isolated import check.
- No formal tables were dropped. The original 4.3G
  `pre-item-image-lineage-2026-08-01.sql` backup remains untouched.
- The MySQL root credential used for this operation is present in the tracked
  `platform/local/config/local-stack.config.example.json`. Rotate it and
  replace the committed value with a placeholder; do not copy the credential
  into this entry or other documentation.
- Binlog expiration remains configured for 30 days. Reassess the retention
  window after deciding the required point-in-time recovery period.

## User stop decision — 2026-11-11

- 用户明确停止全部现有任务；本条因 intentionally stopped 关闭，不代表功能完成或验收通过。
- 保留上文历史问题、验证记录与未完成项；旧的执行、授权和 next-action 指令均不自动恢复。
- 本次未重新验证业务功能；复工须重新确认目标、运行态与授权，并创建新的 active entry。
- 分支交接：`docs/handoffs/2026-11-11-workspace-stop.md`。Stop reason: user-requested cancellation and recoverable branch snapshot.
