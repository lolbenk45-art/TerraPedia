# 2026-05-07 P5 Public Route Closeout

## Scope

- Target domains:
  - `bosses`
  - `buffs`
  - `projectiles`
  - `armor_sets`
- Existing public domains retained:
  - `items`
  - `npcs`

## Registry Outcome

`scripts/data/workflow/domain-acceptance-registry.json`

- `bosses` -> `public`, `/bosses`
- `buffs` -> `public`, `/buffs`
- `projectiles` -> `public`, `/projectiles`
- `armor_sets` -> `public`, `/armor-sets`

## Public API Added

- `GET /public/buffs`
- `GET /public/projectiles`
- `GET /public/armor-sets`

Existing:

- `GET /public/bosses`
- `GET /public/items`
- `GET /public/npcs`

## Frontend Public Routes

- `/bosses`
- `/buffs`
- `/projectiles`
- `/armor-sets`

No detail routes were added for the new three domains in this slice.

## Verification

### Node audit test

```powershell
node --test scripts/data/audit/domain-readiness-audit.test.mjs
```

Result:

- pass
- `47/47`

### Backend tests

```powershell
Push-Location back
mvn "-Dtest=PublicBuffControllerTest,PublicProjectileControllerTest,PublicArmorSetControllerTest,PublicBossControllerTest,AdminDomainAcceptanceControllerTest" test
Pop-Location
```

Result:

- pass
- `10/10`

### Frontend tests

```powershell
Push-Location front
pnpm run test:unit
pnpm run check
pnpm run build
Pop-Location
```

Result:

- `vitest`: pass, `93/93`
- `vue-tsc --noEmit`: pass
- `vite build`: pass

## Acceptance

Commands:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

Results:

- freshness audit:
  - `overallStatus: pass`
  - `freshCount: 45`
  - `missingCount: 0`
  - `staleCount: 0`
- A-grade gate:
  - `overallStatus: warning`
  - `blockingReasons: []`
  - only remaining top-level warning:
    - `generation.warning`
    - message: `domain acceptance generation has 17 warning panels`

## Product Domain Outcome

All six product domains are now public-route configured:

- `items`: `aGradeStatus=pass`, `publicGateStatus=public_route_configured`, `routeReady=true`
- `npcs`: `aGradeStatus=pass`, `publicGateStatus=public_route_configured`, `routeReady=true`
- `bosses`: `aGradeStatus=pass`, `publicGateStatus=public_route_configured`, `routeReady=true`
- `buffs`: `aGradeStatus=pass`, `publicGateStatus=public_route_configured`, `routeReady=true`
- `projectiles`: `aGradeStatus=pass`, `publicGateStatus=public_route_configured`, `routeReady=true`
- `armor_sets`: `aGradeStatus=pass`, `publicGateStatus=public_route_configured`, `routeReady=true`

## Notes

- The final gate is not `pass` only because report generation still contains legacy warning panels outside this rollout scope.
- There are no blocking reasons for public exposure in the current P5 state.
