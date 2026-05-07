# 2026-05-07 Bosses Public Route Closeout

## Scope

- Domain: `bosses`
- Goal: promote Bosses from `planned-public` to public list route `/bosses`
- Execution workspace: `feature/p0-p2-closeout-execution`

## Code Changes

- Frontend public list route added:
  - `front/src/views/BossPublicView.vue`
  - `front/src/router/routes.ts`
  - `front/src/components/Navbar.vue`
- Frontend API/type additions:
  - `front/src/api/index.ts`
  - `front/src/types/index.ts`
- Route coverage updated:
  - `front/src/tests/npc-public-shell.spec.ts`
- Acceptance registry updated:
  - `scripts/data/workflow/domain-acceptance-registry.json`

## Registry Promotion

- `bosses.publicExposure`: `planned-public` -> `public`
- `bosses.publicRoute`: `null` -> `/bosses`

## Verification

### Frontend

Commands executed on 2026-05-07:

```powershell
pnpm run test:unit -- src/tests/npc-public-shell.spec.ts
pnpm run check
pnpm run build
```

Results:

- `vitest`: pass, `10/10` tests passed
- `vue-tsc --noEmit`: pass
- `vite build`: pass

## Acceptance Evidence

Commands executed on 2026-05-07:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

Results:

- generation summary:
  - `passCount: 28`
  - `warningCount: 17`
  - `blockedCount: 0`
- freshness audit:
  - `overallStatus: pass`
  - `freshCount: 45`
  - `missingCount: 0`
  - `staleCount: 0`
- A-grade gate:
  - `overallStatus: warning`
  - `blockingReasons: []`
  - `publicRouteMissingCount: 0`

## Bosses Domain Outcome

- `aGradeStatus`: `pass`
- `publicGateStatus`: `public_route_configured`
- `publicGateReason`: `null`
- `routeReady`: `true`

Evidence:

- `reports/domain/bosses/public-readiness-2026-05-07.json`
- `reports/domain/bosses/source-readiness-2026-05-07.json`
- `reports/domain/bosses/relation-readiness-2026-05-07.json`
- `reports/domain/bosses/image-readiness-2026-05-07.json`

## Remaining Warnings

Global warning state remains expected and non-blocking for this phase.

- `buffs/*`: `planned-public` but no public route
- `projectiles/*`: `planned-public` but no public route
- `armor_sets/*`: `planned-public` but no public route
- `generation.warning`: total warning panel count remains `17`

Notes:

- `bosses/unresolvedAuditTrend` report itself is `warning` because historical baseline is unavailable.
- This does not block the Bosses public route rollout under the current gate rules.

## Conclusion

Bosses public list route rollout is complete for this phase.

- Public route is live at `/bosses`
- Acceptance registry is aligned
- Frontend route/test/build verification passed
- Acceptance gate has no blocking reasons
