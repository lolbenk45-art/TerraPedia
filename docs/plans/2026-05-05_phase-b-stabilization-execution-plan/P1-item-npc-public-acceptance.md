# P1 Item/NPC Public Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public consumer acceptance tests and small fixes after Domain Acceptance P0.5 is closed.

**Architecture:** Treat Item/NPC as public consumers of accepted data, not as readiness authorities. Tests cover empty/error/fallback behavior; implementation is limited to small guards and display fixes.

**Tech Stack:** Vue 3 + Vite public front, Vitest, existing `front/src/views` and `front/src/api` modules.

---

## Entry Condition

P0.5a, P0.5b, and P0.5c are committed or explicitly recorded as already passing.

## Files

- Create or Modify: `front/src/tests/item-public-acceptance.spec.ts`
- Create or Modify: `front/src/tests/npc-public-acceptance.spec.ts`
- Modify only if tests fail: `front/src/views/ItemDetailView.vue`
- Modify only if tests fail: `front/src/views/NpcDetailView.vue`
- Modify only if tests fail: `front/src/api/itemAggregate.ts`
- Modify only if tests fail: `front/src/api/npcDomain.ts`

## Steps

- [ ] **Step 1: Add Item public tests**

Cover:

- item detail 404 state
- missing image fallback
- missing source/acquisition data
- missing aggregate module

Expected user-visible behavior:

- no runtime crash
- no layout-breaking undefined text
- fallback image or no-image state renders
- source module can show empty state

- [ ] **Step 2: Add NPC public tests**

Cover:

- NPC detail empty loot module
- NPC detail empty shop module
- NPC detail empty buffs module
- `moduleStatus` warning display
- missing image fallback

Expected user-visible behavior:

- no runtime crash
- empty modules render stable empty states
- warning state is visible to the user
- fallback image or no-image state renders

- [ ] **Step 3: Run tests and verify failures**

Run:

```powershell
cd front
pnpm run test:unit
```

Expected: new tests fail only if current views lack the required empty/error/fallback handling.

- [ ] **Step 4: Implement small fixes only**

Allowed:

- guards around missing modules
- empty state text already consistent with existing page tone
- image fallback handling
- status rendering for warning modules

Forbidden:

- new public Boss/Buff/Projectile/ArmorSet routes
- page structure refactor
- API contract expansion unrelated to tests
- new data readiness rules in front code

- [ ] **Step 5: Validate front**

Run:

```powershell
cd front
pnpm run check
pnpm run test:unit
pnpm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add front/src/tests/item-public-acceptance.spec.ts front/src/tests/npc-public-acceptance.spec.ts front/src/views/ItemDetailView.vue front/src/views/NpcDetailView.vue front/src/api/itemAggregate.ts front/src/api/npcDomain.ts
git commit -m "test: add item npc public acceptance coverage"
```

If some listed implementation files were not changed, omit them from `git add`.
