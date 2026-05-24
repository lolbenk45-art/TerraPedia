# Domain A-Grade DB Read Environment

Date: 2026-05-24

## Scope

Task 3 verified whether the local DB environment is complete enough to close the remaining DB-dependent Domain A-grade blockers.

No database writes, imports, backfills, apply scripts, restores, or schema creation were run.

## Dependency Check

The plan's inventory command requires `mysql2/promise` from `data-query-app`.

Running directly in the isolated worktree failed before DB connection:

```text
Error: Cannot find module 'mysql2/promise'
Require stack:
- .../fix-domain-a-grade-source-evidence-2026-05-24/data-query-app/package.json
```

The isolated worktree does not have `data-query-app/node_modules/mysql2`. The main worktree already has the dependency:

```text
/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22/data-query-app/node_modules/.pnpm/mysql2@3.20.0_@types+node@25.5.0/node_modules/mysql2/promise.js
```

For this read-only inventory only, the command was rerun with:

```bash
NODE_PATH=/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22/data-query-app/node_modules
```

No `node_modules` directory was installed or committed in this worktree.

## Config

`loadLocalStackConfig(process.cwd())` resolved a database config:

```json
{
  "name": "terria_v1_local",
  "host": "127.0.0.1",
  "port": 13306,
  "username": "root",
  "password": "<redacted>"
}
```

## Inventory Command

```bash
NODE_PATH=/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22/data-query-app/node_modules node - <<'NODE'
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
console.log(JSON.stringify({ options: { ...options, password: '<redacted>' }, databases: rows }, null, 2));
await conn.end();
NODE
```

Exit code: `0`

Output:

```json
{
  "options": {
    "host": "127.0.0.1",
    "port": 13306,
    "user": "root",
    "password": "<redacted>"
  },
  "databases": [
    {
      "Database (terria_v1_%)": "terria_v1_local"
    },
    {
      "Database (terria_v1_%)": "terria_v1_relation"
    }
  ]
}
```

## Classification

The DB read environment is incomplete for this plan.

Required by plan:

- `terria_v1_local`: present
- `terria_v1_maint`: missing
- `terria_v1_relation`: present

Because `terria_v1_maint` is missing, Task 4 Boss image lineage and Task 5 Projectile relation coverage cannot be closed in this plan. The plan explicitly forbids synthesizing, restoring, importing, or writing a maint database as part of this checkpoint.

## Next Required Work

Open a separate DB restore/read-environment branch to restore or provide a complete readable `terria_v1_maint` database, then rerun:

- `node scripts/data/audit/image-source-lineage-report.mjs --source=db --generated-at=2026-05-24T00:00:00.000Z`
- `node scripts/data/relation/entity-coverage-baseline.mjs --local-database=terria_v1_local --maint-database=terria_v1_maint --relation-database=terria_v1_relation`
