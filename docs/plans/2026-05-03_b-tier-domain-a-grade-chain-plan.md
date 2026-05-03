# B-Tier Domain A-Grade Chain Plan

## Goal

Upgrade the current B-tier domains to the same operational standard as the item and NPC chains: source evidence, freshness, manual refresh plan, gate coverage, admin visibility, and then public consumption.

## Architect Decision

Do not start with public Boss, Buff, Projectile, or Armor Set pages. The multi-agent audit showed the repeated gap is not missing import ability; it is missing domain-level acceptance evidence and a shared refresh/freshness contract.

The first implementation round builds the common domain acceptance foundation only. It is read-only and must not run crawler, import, backfill, load, apply, or database-writing commands.

## Target Domains

- `bosses`
- `buffs`
- `projectiles`
- `armor_sets`
- `support.recipe`
- `support.shimmer`
- `support.category`
- `support.item_group`
- `support.town_npc_maintenance`

## Round 1: Domain Acceptance Foundation

Create a generic registry for domain acceptance panels. Each panel declares:

- domain id
- panel id
- report pattern or external evidence source
- generator command
- database requirements
- database write status
- freshness policy
- notes and status impact

Then add:

- generic domain freshness audit
- generic domain refresh plan
- node tests for manifest shape, freshness classification, and manual-only refresh actions

## Round 2: Domain Readiness Evidence

Add read-only reports for the four product B-tier domains:

- Boss readiness: boss groups, member references, loot ownership, image fallback status.
- Buff readiness: source items, immune NPC samples, inflicting NPC relations, projection status, image fallback status.
- Projectile readiness: item/NPC source relations, unresolved audits, projection/local coverage, image fallback status.
- Armor Set readiness: source coverage, projection/API coverage, image coverage.

## Round 3: Support Domain Gates

Stabilize support chains that block product domains:

- Item Group duplicate/blocked audit in domain acceptance.
- Recipe provider/canonical gate.
- Category mapping drift gate.
- Town NPC maintenance validation signals.
- Shimmer controller contract and business validation.

## Round 4: Backend and Admin Consumption

Expose domain acceptance through backend and admin UI:

- `/admin/domain-acceptance/overview`
- domain drill-down cards in management pages
- per-domain freshness, latest report, next evidence command, and manual-only refresh actions

## Round 5: Public Product Surfaces

Only after the domain readiness panels are fresh or explicitly warning-only:

- Boss public list/detail.
- Buff public list/detail.
- Projectile public list/detail or contextual detail entry.
- Armor Set public list/detail.

## Safety Rules

- Evidence commands are never executed by refresh-plan code.
- Refresh actions always use `executeMode: "manual"`.
- DB-writing commands are blocked.
- Unknown evidence or unreadable JSON never counts as fresh.
- DB-required evidence needs confirmation before manual execution.
- Public pages must not be added before readiness evidence exists.

