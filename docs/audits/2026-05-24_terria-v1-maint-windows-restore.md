# terria_v1_maint Windows Restore - 2026-05-24

## Goal

Copy the existing Windows MySQL `terria_v1_maint` database into the WSL local MySQL instance used by TerraPedia evidence commands.

## Branch And Worktrees

- Main execution worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22`
- Restore branch: `ops/restore-terria-v1-maint-from-windows-2026-05-24`
- Restore worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/ops-restore-terria-v1-maint-from-windows-2026-05-24`
- Primary checkout `/home/lolben/TerraPedia` remained on `chore/local-stack-front-nuxt-2026-05-23` and was not used for this restore.

## Source

- Host: Windows MySQL via Windows client on `127.0.0.1:3306`
- Service observed: `MySQL92`
- Database copied: `terria_v1_maint`
- Source client: `C:\Program Files\MySQL\MySQL Server 9.2\bin\mysqldump.exe`

Source database list included:

```text
terria_v1_item_staging_20260413
terria_v1_item_staging_20260413_r2
terria_v1_local
terria_v1_maint
terria_v1_relation
terria_v1_shadow_20260326_195629
```

## Target

- Host: WSL MySQL on `127.0.0.1:13306`
- Database created/restored: `terria_v1_maint`
- Existing target databases before restore:
  - `terria_v1_local`
  - `terria_v1_relation`

## Restore Command Shape

The restore used temporary MySQL defaults files outside the repo for credentials. Temporary files were removed after command completion.

```bash
mysql --defaults-extra-file="$TGT_CNF" -e "CREATE DATABASE IF NOT EXISTS terria_v1_maint CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
"C:\Program Files\MySQL\MySQL Server 9.2\bin\mysqldump.exe" \
  --defaults-extra-file="$SRC_CNF" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  terria_v1_maint \
  | mysql --defaults-extra-file="$TGT_CNF" terria_v1_maint
```

No dump file was committed or left in the repository.

## Validation

Target DB inventory after restore:

```json
{
  "options": {
    "host": "127.0.0.1",
    "port": 13306,
    "user": "root",
    "password": "[redacted]"
  },
  "databases": [
    "terria_v1_local",
    "terria_v1_maint",
    "terria_v1_relation"
  ],
  "maint": {
    "tablesCount": 32,
    "approxRows": "54623"
  }
}
```

Exact table row-count comparison between Windows source and WSL target passed for 32 base tables.

Sample compared rows:

```text
maint_armor_set_images 175
maint_armor_sets 63
maint_backfill_candidates 432
maint_biomes 7
maint_bosses 33
maint_buffs 388
maint_categories 6
maint_item_images 4310
```

## Result

- `terria_v1_local`: present
- `terria_v1_relation`: present
- `terria_v1_maint`: present
- Decision: DB read environment restored for the next preview closeout loop tasks.

## Next Step

Resume `docs/superpowers/plans/2026-05-24-domain-a-grade-preview-closeout-loop.md` at:

- Task 2: `fix/domain-a-grade-boss-image-lineage-2026-05-24`
- Task 3: `fix/domain-a-grade-projectile-relation-coverage-2026-05-24`
