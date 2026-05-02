# NPC / Item Source Maintenance Chain Runbook

Status: serial runbook for the A/B `NPC / item source / shop / loot` chain.

## Goal

Move source evidence from landing and maint into relation, projection, and local compatibility layers without opening an apply window until the read-only validation chain has passed and human approval is recorded.

## Serial Boundary

- Do not run two DB apply scripts in parallel.
- Do not run crawler, maint, recipe, relation, projection, local compatibility, or image sync apply against the same target in parallel.
- Do not let multiple agents write the same database, table, or scope.
- This runbook is read-only by default. Use `--apply=false`, `--print-*`, and `--write-report=false` unless an explicit apply window has been opened.
- Every apply command requires a fresh active-writer check, reviewed dry-run output, and human approval.

## Entrypoints

```powershell
node scripts/data/relation/relation-health-report.mjs --print-checklist=true
node scripts/data/relation/relation-health-report.mjs --print-sql=true
node scripts/data/relation/relation-health-report.mjs --write-report=false
```

## Read-Only Preflight

1. Active writer check

Confirm no DB apply, crawler apply, recipe apply, relation apply, projection apply, local compatibility apply, or image sync apply is running against the same target. Stop if another writer owns the target.

2. Source / landing read-only audit

```powershell
node scripts/data/landing/audit-source-dataset-landings.mjs --output=reports/source-dataset-landing-audit-YYYY-MM-DD.json
```

3. Generate or refresh the NPC item relation bundle

```powershell
node scripts/data/fetch/build-npc-item-relations-bundle.mjs --output=data/generated/npc-item-relations.bundle.json
```

This prepares an input artifact only. It does not authorize any apply.

4. Maint dry-run

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=npcs
```

5. Relation dry-run

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Review relation facts, shop and loot relations, audit rows, and unresolved/exportable reports.

6. Relation health

```powershell
node scripts/data/relation/relation-health-report.mjs --write-report=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
```

Gate policy:

- `blockingCount > 0`: stop. Do not apply and do not expand new public features.
- `warningCount > 0` with no blocking: existing resolved/promoted/accepted read-only consumption can continue, but warnings must be shown and recorded.
- `unresolved_item_npc_relation_audits` is warning, not blocking.

7. Projection / local core dry-run

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles
```

8. Local compatibility dry-run

```powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation
```

9. Replacement readiness audit

```powershell
node scripts/data/relation/replacement-readiness-audit.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation
```

10. Local compatibility smoke

```powershell
node scripts/data/relation/local-core-compat-smoke-check.mjs
```

Only after steps 1-10 pass may the coordinator open an apply window.

## Apply Window

Before every command below, repeat the active-writer check, confirm the matching dry-run was reviewed, and record human approval.

1. Maint apply

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=npcs
```

2. Relation apply

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
```

3. Projection / local core apply

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles
```

4. Local compatibility apply

```powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation
```

## Publish Decision

Treat the chain as A2 publishable input only when relation health has no blocking checks, replacement readiness has no blockers, local compatibility smoke passes, and all warning rows are registered for admin review.

## Known Risks

- Current relation health can still contain `unresolved_item_npc_relation_audits` warnings.
- Any Item Group has its own blocked gate and cannot be downgraded by this runbook.
- NPC image source/cache/fallback is not part of this runbook's sync scope.

## Validation

```powershell
node --test scripts/data/relation/relation-health-report.test.mjs
node --check scripts/data/relation/relation-health-report.mjs
node scripts/data/relation/relation-health-report.mjs --print-checklist=true
Select-String -Path .\docs\audits\relation-warning-policy.md -Pattern "unresolved_item_npc_relation_audits"
Select-String -Path .\docs\runbooks\npc-item-source-maintenance-chain.md -Pattern "Do not run two DB apply scripts in parallel"
```
