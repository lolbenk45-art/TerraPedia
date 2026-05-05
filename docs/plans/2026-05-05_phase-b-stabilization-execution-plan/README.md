# Phase B Stabilization Split Task Cards

This directory contains the split execution cards for `docs/plans/2026-05-05_phase-b-stabilization-execution-plan.md`.

Execute in this order:

1. `P0-00-project-management-records.md`
2. `P0-01-ci-quality-gate.md`
3. `P0-02a-data-source-acceptance-api.md`
4. `P0-02b-data-source-acceptance-admin.md`
5. `P0-5a-domain-acceptance-gate.md`
6. `P0-5b-domain-acceptance-backend.md`
7. `P0-5c-domain-acceptance-admin.md`
8. `P1-item-npc-public-acceptance.md`
9. `P2-public-domain-readiness.md`

Shared hard boundaries:

- No crawler/import/backfill/load/apply or DB-writing commands.
- No Acceptance UI/API evidence generation.
- No automatic refresh-plan execution.
- No public Boss/Buff/Projectile/ArmorSet route in Phase B.
- No `git add .`.
