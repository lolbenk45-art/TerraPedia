# Projectile T1 Source Blocker

## Status

`blocked`

## Goal

Select a 2-5 row offline Projectile fixture that closes projectile import,
item/NPC relations, projection, and cleanup before generating authorization.

## Result

- Read-only audit found two viable projectile/item pairs:
  `WoodenArrowFriendly`/`WoodenBow` and `FireArrow`/`FlamingArrow`.
- Both standardized projectile records and formal maint projectile/item rows
  exist with managed images and supported item `shoot` fields.
- Formal maint NPC rows with any supported projectile field: `0`.
- Repository-local NPC projectile source matches outside generated image summary:
  `0`.
- No database write, isolated write, network request, crawler, scheduler, or
  authorization was started.
- Evidence: `reports/canonical-migration/canonical-projectile-t1-blocker.json`.

## Blocker

The Batch 2 plan requires a relationship-closed offline fixture. There is no
real local NPC source contract carrying a projectile identity, so an NPC
relation could only be fabricated. The plan's stop condition therefore applies.

## Unblock Condition

Add or identify a real local NPC source contract with a supported projectile
field, land it through the maintained NPC/maint chain, and re-audit the fixture
before creating a Projectile T1 operation or ADMIN request.

## Residual Risks

- Relaxing the gate to item-only would change the approved acceptance plan and
  requires an explicit plan amendment.
- Running the Wiki projectile backfill would require network access and would
  not create the missing NPC relationship evidence.
