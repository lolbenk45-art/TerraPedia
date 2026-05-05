# Phase B P2 Public Domain Readiness

## Scope

This document records readiness conditions only. It does not authorize public Boss, Buff, Projectile, or ArmorSet route implementation.

## Boss Candidate

Boss can be evaluated as an NPC aggregate/filter candidate after Domain Acceptance is fresh or explicitly warning-only.

## Buff Entry Conditions

- sourceReadiness fresh or accepted warning
- imageReadiness fresh or accepted warning
- publicReadiness pass
- public route/API contract approved

## Projectile Entry Conditions

- sourceReadiness fresh or accepted warning
- relationReadiness fresh or accepted warning
- imageReadiness fresh or accepted warning
- public route/API contract approved

## ArmorSet Entry Conditions

- sourceReadiness fresh or accepted warning
- relationReadiness fresh or accepted warning
- imageReadiness fresh or accepted warning
- public route/API contract approved

## Blocking Rules

- Any public-blocking missing/unknown evidence blocks implementation.
- `publicExposure=planned-public` does not permit route creation by itself.
- UI fallback cannot convert readiness to pass.
