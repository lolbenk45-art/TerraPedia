# Basic Public Site V0.1 Domain Evidence - 2026-05-23

## Branch

- Branch: `release/basic-public-site-v0.1-smoke-gate-2026-05-23`
- Base evidence precheck: `docs/audits/2026-05-23_basic-public-site-v0.1-domain-precheck.md`

## Commands

```bash
node --check scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node --check scripts/data/workflow/domain-acceptance-a-grade-gate.mjs
node --check scripts/data/workflow/domain-acceptance-generate-reports.mjs
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true > /tmp/terrapedia-domain-generate-v01-final.json
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-v01-final.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-v01-final.json
```

## Evidence Written

- `reports/domain/**`: 45 fresh domain acceptance JSON reports.
- Product domains covered: `items`, `npcs`, `bosses`, `buffs`, `projectiles`, `armor_sets`.
- Support domains covered: `support.recipe`, `support.shimmer`, `support.category`, `support.item_group`, `support.town_npc_maintenance`.

## Freshness Result

- Exit code: `0`.
- `overallStatus=pass`.
- `panelCount=45`, `freshCount=45`, `staleCount=0`, `missingCount=0`, `unknownCount=0`.
- This closes the previous missing/stale evidence blocker recorded in the precheck audit.

## A-Grade Gate Result

- Exit code: `1`.
- `overallStatus=blocked`.
- Summary: `generatedPassCount=23`, `generatedWarningCount=9`, `generatedBlockedCount=13`.
- Blocking reason: `domain acceptance generation has 13 blocked panels`.
- Warning reason: `domain acceptance generation has 9 warning panels`.

## Public Route Gate Snapshot

All six product domains now have configured public routes in the gate output:

| Domain | Public gate | Route ready |
| --- | --- | --- |
| `items` | `public_route_configured` | `true` |
| `npcs` | `public_route_configured` | `true` |
| `bosses` | `public_route_configured` | `true` |
| `buffs` | `public_route_configured` | `true` |
| `projectiles` | `public_route_configured` | `true` |
| `armor_sets` | `public_route_configured` | `true` |

Support domains remain `admin_only` by design.

## Remaining Blocked Panels

| Domain | Panel | Evidence path |
| --- | --- | --- |
| `items` | `unresolvedAuditTrend` | `reports/domain/items/unresolved-audit-trend-2026-05-23.json` |
| `npcs` | `unresolvedAuditTrend` | `reports/domain/npcs/unresolved-audit-trend-2026-05-23.json` |
| `bosses` | `sourceReadiness` | `reports/domain/bosses/source-readiness-2026-05-23.json` |
| `bosses` | `imageReadiness` | `reports/domain/bosses/image-readiness-2026-05-23.json` |
| `bosses` | `unresolvedAuditTrend` | `reports/domain/bosses/unresolved-audit-trend-2026-05-23.json` |
| `buffs` | `unresolvedAuditTrend` | `reports/domain/buffs/unresolved-audit-trend-2026-05-23.json` |
| `projectiles` | `relationReadiness` | `reports/domain/projectiles/relation-readiness-2026-05-23.json` |
| `projectiles` | `unresolvedAuditTrend` | `reports/domain/projectiles/unresolved-audit-trend-2026-05-23.json` |
| `armor_sets` | `sourceReadiness` | `reports/domain/armor_sets/source-readiness-2026-05-23.json` |
| `armor_sets` | `unresolvedAuditTrend` | `reports/domain/armor_sets/unresolved-audit-trend-2026-05-23.json` |
| `support.shimmer` | `sourceReadiness` | `reports/domain/support.shimmer/source-readiness-2026-05-23.json` |
| `support.item_group` | `blockingGate` | `reports/domain/support.item_group/blocking-gate-2026-05-23.json` |
| `support.town_npc_maintenance` | `sourceReadiness` | `reports/domain/support.town_npc_maintenance/source-readiness-2026-05-23.json` |

## Interpretation

The evidence chain is now fresh and traceable, but the full domain A-grade gate is still blocked by the content of the generated reports. The V0.1 public UI branch can be merged as a truthful preview surface, but it must not be represented as final domain A-grade release readiness until the blocked panels above are cleared or explicitly accepted by a later release decision.
