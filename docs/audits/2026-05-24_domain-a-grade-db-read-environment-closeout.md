# Domain A-Grade DB Read Environment Closeout - 2026-05-24

## Goal

Make `terria_v1_local`, `terria_v1_relation`, and `terria_v1_maint` readable for DB-dependent Domain A-grade evidence.

## Result

- `terria_v1_local`: present
- `terria_v1_relation`: present
- `terria_v1_maint`: missing
- Decision: preview-only with explicit blocker

Task 2 Boss image lineage and Task 3 projectile relation coverage must not start from this environment because both require a readable `terria_v1_maint` database.

## Dependency Note

The isolated task worktree does not contain `data-query-app/node_modules/mysql2`. The first direct run failed before opening a DB connection with `Cannot find module 'mysql2/promise'`.

For this read-only inventory only, the command was rerun with:

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules
```

No dependencies were installed in this task worktree.

## Commands

```bash
NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules node - <<'NODE'
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadLocalStackConfig } from './scripts/lib/local-runtime-config.mjs';
const require = createRequire(path.join(process.cwd(), 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');
const config = loadLocalStackConfig(process.cwd());
const options = {
  host: config.database?.host ?? '127.0.0.1',
  port: Number(config.database?.port ?? 3306),
  user: config.database?.username ?? 'root',
  password: config.database?.password ?? 'root',
};
const conn = await mysql.createConnection(options);
const [rows] = await conn.query("SHOW DATABASES LIKE 'terria_v1_%'");
console.log(JSON.stringify({
  options: { ...options, password: '[redacted]' },
  databases: rows.map((row) => Object.values(row)[0]).sort(),
}, null, 2));
await conn.end();
NODE
```

Exit code: `0`

## Output Summary

- Host: `127.0.0.1`
- Port: `13306`
- User: `root`
- Databases:
  - `terria_v1_local`
  - `terria_v1_relation`

## Local Config Boundary

`loadLocalStackConfig(process.cwd())` resolved a local ignored config path from the primary worktree. These paths are intentionally ignored:

- `scripts/dev/config/local-stack.config.json`
- `scripts/dev/local-stack.config.json`
- `scripts/dev/config/credentials.json`

Because the config is local-only, this closeout commits the observed host, port, user, and database inventory instead of committing credentials or local machine configuration.

## Dump Search

Read-only searches did not find a local `terria_v1_maint` SQL or dump file under `/home/lolben` within the checked depth.

## Follow-Up

- Next branch: `fix/domain-a-grade-db-read-environment-2026-05-24` remains blocked until an operator provides or restores readable `terria_v1_maint`.
- Blocker: `terria_v1_maint` is not present on the configured MySQL instance at `127.0.0.1:13306`.
- Required operator action: provide a readable `terria_v1_maint` database or approve a separate restore/import task. This controller plan must not synthesize an empty maint database, copy tables from other DBs, run crawlers, or perform DB writes.
