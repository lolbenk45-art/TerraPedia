# P0.5c Domain Acceptance Admin View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the admin Domain Acceptance page displays readiness, freshness, public gate, and manual refresh guidance without execution controls.

**Architecture:** Render the existing `/admin/domain-acceptance/overview` projection and typed fields. The page is a read-only evidence consumer and cannot run commands, refresh data, or create public exposure.

**Tech Stack:** Nuxt 4 admin app, TypeScript types, Node `node --test` contract tests.

---

## Files

- Modify: `data-query-app/types/domainAcceptance.ts`
- Modify: `data-query-app/pages/operations/domain-acceptance.vue`
- Modify: `data-query-app/tests/domain-acceptance-page-contract.test.mjs`

## Steps

- [ ] **Step 1: Add admin contract tests**

Required assertions:

```js
assert.match(types, /publicGateStatus/);
assert.match(types, /refreshPlanSummary/);
assert.match(types, /actionQueue/);
assert.match(types, /executeMode/);
assert.match(types, /executionPolicy/);
assert.match(page, /publicGateStatus/);
assert.match(page, /refresh-plan-summary/);
assert.match(page, /nextEvidenceCommand/);
assert.doesNotMatch(page, /runCommand|executeCommand|applyCommand|crawlerCommand/i);
```

- [ ] **Step 2: Run tests**

Run:

```powershell
cd data-query-app
pnpm run test:unit
```

Expected: PASS if page already satisfies these; otherwise fail only on missing fields.

- [ ] **Step 3: Implement minimal page/type updates**

Render:

- overall status
- per-domain `publicGateStatus`
- per-panel `freshnessStatus`, `freshnessReason`, `reportPath`
- per-panel `generatorCommand` and `nextEvidenceCommand` as text
- refresh plan summary and action queue

Do not add:

- execute button
- copy-and-run button
- auto refresh
- DB diagnostic query

- [ ] **Step 4: Validate admin**

Run:

```powershell
cd data-query-app
pnpm run check
pnpm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add data-query-app/types/domainAcceptance.ts data-query-app/pages/operations/domain-acceptance.vue data-query-app/tests/domain-acceptance-page-contract.test.mjs
git commit -m "feat: harden domain acceptance admin view"
```
