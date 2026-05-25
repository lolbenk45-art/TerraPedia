# Boss Detail P2 Contract Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Boss detail pages professional by exposing summon, trigger, mechanics, and difficulty notes through explicit read-only contracts instead of front-end text guessing.

**Architecture:** P2 starts with admin/public DTO alignment and empty-safe read-only fields. It must not parse free text into facts, write crawler guesses back to the database, or add durable storage. New durable fact tables, text-derived facts, or data backfills are deferred until the source chain can provide evidence and review status.

**Tech Stack:** Spring Boot controllers/services under `back/`, Nuxt admin/public clients under `data-query-app/` and `front-nuxt/`. Flyway migrations are out of scope for P2 and require a separate data-contract approval.

---

## Current Facts

- Admin Boss detail uses `/admin/bosses` and returns `summonMethod`, members, reference members, loot owner NPC, and loot entries from Map payloads.
- Public Boss detail uses `/public/bosses/{id}` and `PublicBossDetailDTO`.
- `boss_groups.summon_method` is a text field. There are no structured summon items, trigger conditions, phase mechanics, or difficulty notes in the current schema.
- Admin currently has fallback summon text for some bosses; public detail only returns DB `summonMethod`, so admin/public behavior can drift.
- Front-end P1.5 may display a safe “召唤与触发” section, but it must not invent summon items or conditions.

## P2 Scope

In scope:

- Add read-only DTO fields to admin and public Boss detail with the same shape.
- Resolve `summonMethodResolved` consistently: DB value first, then existing fallback text.
- Add empty-safe arrays with confidence fields, populated only from explicit reviewed contract fields if such fields already exist.
- Add tests that old fields remain compatible.
- Add public/admin smoke checks for selected Boss detail IDs.

Out of scope:

- DB writes, imports, crawlers, backfills, production deployment.
- Writing front-end inferred summon items back to DB.
- Any Flyway migration or schema change.
- Parsing `summonMethod`, `notes`, raw wiki text, or fallback copy into summon items, trigger conditions, mechanics, or difficulty facts.
- Treating `notes` as authoritative mechanics.
- Reusing loot conditions for summon conditions.
- Adding new fact tables without a separate data-source and migration plan.

## Proposed DTO Fields

Add these fields to admin/public detail payloads:

```ts
type BossSummonItemDTO = {
  itemId: number | null
  internalName: string | null
  name: string | null
  nameZh: string | null
  imageUrl: string | null
  role: 'summon_item' | 'trigger_item' | 'unknown'
  sourceText: string | null
  confidence: number
  derived: boolean
}

type BossConditionDTO = {
  conditionType: 'time' | 'biome' | 'event' | 'progression' | 'world_seed' | 'npc_state' | 'action' | 'natural_spawn' | 'unknown'
  label: string
  value: string | null
  sourceText: string | null
  confidence: number
  derived: boolean
}

type BossMechanicNoteDTO = {
  kind: 'phase' | 'segment' | 'adds' | 'arena' | 'event_wave' | 'immunity' | 'enrage' | 'loot_unlock' | 'progression_unlock' | 'unknown'
  title: string
  description: string
  sourceText: string | null
  confidence: number
  derived: boolean
}

type BossDifficultyNoteDTO = {
  mode: 'expert' | 'master' | 'classic' | 'event' | 'special_seed' | 'unknown'
  description: string
  sourceText: string | null
  confidence: number
  derived: boolean
}
```

Add to Boss detail:

- `summonMethodResolved: string | null`
- `summonItems: BossSummonItemDTO[]`
- `summonConditions: BossConditionDTO[]`
- `mechanicNotes: BossMechanicNoteDTO[]`
- `difficultyNotes: BossDifficultyNoteDTO[]`

Public UI display rule:

- `internalName`, `sourceText`, raw enum fields such as `role`, `kind`, `mode`, and contract code keys are identity/evidence fields only.
- Public pages must render translated labels from explicit display fields or approved label maps.
- If a field is missing or unrecognized, public pages must show an empty state or generic copy, not the raw contract value.

## Execution Tasks

### Task 1: Contract Baseline

- [ ] Read `back/src/main/java/com/terraria/skills/controller/AdminBossController.java`.
- [ ] Read `back/src/main/java/com/terraria/skills/controller/PublicBossController.java`.
- [ ] Read `back/src/main/java/com/terraria/skills/service/impl/PublicBossServiceImpl.java`.
- [ ] Capture one admin and one public Boss detail payload from local GET requests.
- [ ] Record field differences in `docs/audits/2026-05-25_boss-detail-p2-contract-baseline.md`.

### Task 2: Shared Resolver

- [ ] Add one backend resolver for `summonMethodResolved`.
- [ ] Use the same resolver in admin and public detail payloads.
- [ ] Add unit tests for DB value, fallback value, and missing value.
- [ ] Keep existing `summonMethod` unchanged.

### Task 3: Empty-Safe Read-Only Fields

- [ ] Add empty-safe arrays for `summonItems`, `summonConditions`, `mechanicNotes`, and `difficultyNotes`.
- [ ] Default arrays to empty when no explicit reviewed contract field exists.
- [ ] Do not derive array entries from `summonMethod`, `notes`, raw wiki text, or fallback copy in P2.
- [ ] If a later approved contract provides reviewed derived facts, include `derived=true`, `sourceText`, and `confidence`.
- [ ] Do not persist derived output.
- [ ] Add tests proving the fields exist and default to empty arrays when no evidence exists.

### Task 4: Front-End Consumption

- [ ] Update public Boss detail types in `front-nuxt/types/public-api.ts`.
- [ ] Render structured summon/condition/mechanics only when arrays have entries.
- [ ] Keep the current P1.5 “资料待补齐” copy when arrays are empty.
- [ ] Do not render `internalName`, `sourceText`, raw enum `role/kind/mode`, contract code keys, or unrecognized derived values directly in public UI.
- [ ] Update `front-nuxt/scripts/check-public-pages.mjs` to prevent raw enum or internal contract wording from leaking.

### Task 5: Admin Consumption

- [ ] Update admin Boss detail display to show `summonMethodResolved`.
- [ ] Show derived fields as reviewable read-only facts.
- [ ] Keep editing bound to `summonMethod` only.

### Task 6: Verification

- [ ] Run `cd back && mvn -Dtest=PublicBossServiceImplTest,AdminBossControllerTest test`.
- [ ] Run `cd data-query-app && pnpm run check`.
- [ ] Run `cd front-nuxt && pnpm run check:public-pages`.
- [ ] Run local read-only GET smoke for `/admin/bosses/{id}` and `/public/bosses/{id}`.
- [ ] Confirm public and admin detail payloads share the new field names and shapes.

## Deferred P2.5/P3 Work

- New tables such as `boss_summon_items`, `boss_summon_conditions`, and `boss_mechanic_notes`.
- Source crawlers for “Summoning and spawning”, “Behavior”, “Tips”, and “Notes” sections.
- Backfill with evidence, confidence, and review status.
- Search/filter by summon condition or difficulty mechanic.

## Stop Conditions

- The implementation needs any DB write, Flyway migration, schema change, crawler, import, or backfill.
- The only evidence is raw wiki text, `summonMethod`, fallback copy, or `notes` without review status.
- The implementation proposes regex, NLP, or heuristic text parsing to populate structured boss facts.
- Admin and public payload shapes diverge.
- A front-end page needs to guess item identity from text.
