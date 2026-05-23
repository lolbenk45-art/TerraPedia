# Basic Public Site V0.1 Domain Precheck

## Branch

- Branch: `release/basic-public-site-v0.1-domain-precheck-2026-05-23`
- Base commit: `85b1db1 feat(front): connect public search to real results`

## Commands

```bash
node --check scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node --check scripts/data/workflow/domain-acceptance-a-grade-gate.mjs
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-v01.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-v01.json
```

## Result

- Syntax checks: pass.
- Freshness audit: `overallStatus=warning`, exit code 0.
- A-grade gate: `overallStatus=blocked`, exit code 1.

## Blocking Reasons

- `items/publicReadiness` public-blocking evidence freshness is missing.
- `npcs/publicReadiness` public-blocking evidence freshness is missing.
- `bosses/publicReadiness` public-blocking evidence freshness is missing.
- `buffs/publicReadiness` public-blocking evidence freshness is missing.
- `projectiles/publicReadiness` public-blocking evidence freshness is missing.
- `armor_sets/publicReadiness` public-blocking evidence freshness is missing.
- Support recipe, shimmer, category, item group, and town NPC maintenance blocking or exemption evidence freshness is missing.
- Domain acceptance generation has 13 blocked panels.

## Execution Constraint

Do not run crawler, import, backfill, or database-writing work from this launch UI plan. Public route patches must stay truthful: render real API data when available, or a limited/unavailable state when the acceptance chain is not fresh enough to claim launch completeness.
