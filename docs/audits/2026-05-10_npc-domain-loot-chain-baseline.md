# NPC Domain Loot Chain Baseline

Date: 2026-05-10

Branch: `fix/npc-domain-loot-data-chain`

Plan: `docs/plans/2026-05-10_npc-domain-loot-data-chain-governance-plan.md`

## Scope

This baseline freezes the current NPC domain loot chain state before Phase 1 audit implementation. It is a whole-domain baseline, not a family-specific closeout.

Mimic is not the acceptance scope.

## No-Write Confirmation

- No code or script files were edited for this Phase 0 baseline.
- No DB-writing command was run.
- DB evidence below was collected with read-only `SELECT` statements only.
- Active writer check found no matching `node.exe` command line for `sync`, `import`, `backfill`, `crawl`, `fetch-wiki`, `run-wiki-sync`, `run-backend-data-refresh`, `apply=true`, or `write-db`.
- Existing untracked plan file before this baseline: `docs/plans/2026-05-10_npc-domain-loot-data-chain-governance-plan.md`.

## Git State At Baseline

```text
git status --short:
?? docs/plans/2026-05-10_npc-domain-loot-data-chain-governance-plan.md

current branch:
fix/npc-domain-loot-data-chain

worktrees:
G:/ClaudeCode/TerraPedia-dev           922adf9 [fix/npc-domain-loot-data-chain]
G:/ClaudeCode/TerraPedia-dev-closeout  903da64 [feature/p0-p2-closeout-execution]
```

## Read-Only DB Counts

| Check | Count |
| --- | ---: |
| Active NPCs in `terria_v1_local.npcs` | `762` |
| Structured local loot rows in `terria_v1_local.npc_loot_entries` | `1082` |
| NPCs with structured local loot | `244` |
| Zero-loot non-town NPCs | `518` |
| Relation loot rows in `terria_v1_relation.item_npc_loot_relations` | `736` |
| Relation NPCs with loot | `220` |
| Projection NPCs with loot JSON in `terria_v1_relation.projection_npcs` | `220` |

## Mimic-Family Sample Only

This table is a sample health check because the previous work focused on Mimic-family defects. It must not be used as the acceptance scope for NPC domain closure.

| NPC | Local structured loot | Relation loot | Projection loot JSON |
| --- | ---: | ---: | ---: |
| `Mimic` | `6` | `6` | `6` |
| `IceMimic` | `14` | `14` | `14` |
| `WaterBoltMimic` | `1` | `1` | `1` |
| `PresentMimic` | `2` | `2` | `2` |
| `BigMimicCorruption` | `8` | `8` | `8` |
| `BigMimicCrimson` | `8` | `8` | `8` |
| `BigMimicHallow` | `7` | `7` | `7` |
| `BigMimicJungle` | `10` | `10` | `10` |

## Baseline Interpretation

- The domain still has `518` non-town NPCs with zero structured local loot, so zero-loot classification must be explicit.
- Current counts alone do not prove row-identity parity across source, relation, projection, local, API, and UI.
- The next phase must classify every active NPC as trusted direct loot, trusted inherited loot, expected zero loot, or an explicit blocker.

## Read-Only Commands Run

```powershell
git status --short
git branch -vv
git worktree list
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -match 'sync|import|backfill|crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh|apply=true|write-db' } | Select-Object ProcessId, CommandLine
```

```sql
SELECT COUNT(*) AS active_npcs
FROM terria_v1_local.npcs
WHERE deleted = 0;

SELECT COUNT(*) AS loot_rows,
       COUNT(DISTINCT npc_id) AS npcs_with_loot
FROM terria_v1_local.npc_loot_entries
WHERE deleted = 0;

SELECT COUNT(*) AS zero_non_town_npcs
FROM (
  SELECT n.id
  FROM terria_v1_local.npcs n
  LEFT JOIN terria_v1_local.npc_loot_entries e
    ON e.npc_id = n.id AND e.deleted = 0
  WHERE n.deleted = 0
    AND COALESCE(n.is_town_npc, 0) = 0
  GROUP BY n.id
  HAVING COUNT(e.id) = 0
) t;

SELECT COUNT(*) AS relation_loot_rows,
       COUNT(DISTINCT npc_internal_name) AS relation_npcs
FROM terria_v1_relation.item_npc_loot_relations
WHERE deleted = 0 AND status = 1;

SELECT COUNT(*) AS projection_npcs_with_loot
FROM terria_v1_relation.projection_npcs
WHERE deleted = 0
  AND status = 1
  AND JSON_LENGTH(loot_items_json) > 0;
```
