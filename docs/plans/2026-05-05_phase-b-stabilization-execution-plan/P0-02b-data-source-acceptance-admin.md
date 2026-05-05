# P0-02b Data Source Acceptance Admin Drilldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display Data Source Acceptance failure samples in the admin page from the existing overview response.

**Architecture:** Extend the admin type contract and page rendering only. The page must keep a single overview request and must not add command execution, sample-generation endpoints, or DB diagnostics.

**Tech Stack:** Nuxt 4 admin app, TypeScript types, Node `node --test` contract tests.

---

## Files

- Modify: `data-query-app/types/dataSourceAcceptance.ts`
- Modify: `data-query-app/pages/operations/data-source-acceptance.vue`
- Modify: `data-query-app/tests/data-source-acceptance-page-contract.test.mjs`

## Steps

- [ ] **Step 1: Add failing contract tests**

Add assertions:

```js
assert.match(types, /export interface DataSourceAcceptanceFailureSample/);
assert.match(types, /failureSamples\?: DataSourceAcceptanceFailureSample\[\]/);
assert.match(page, /failureSamples/);
assert.match(page, /sampleSource/);
assert.match(page, /notGateEvidence/);
assert.doesNotMatch(page, /\/admin\/data-source-acceptance\/panels\/\$\{.*\}\/samples/);
assert.doesNotMatch(page, /executeMode|runCommand|apply|crawler/i);
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
cd data-query-app
pnpm run test:unit
```

Expected: FAIL because types/page do not include `failureSamples`.

- [ ] **Step 3: Add TypeScript interface**

Add:

```ts
export interface DataSourceAcceptanceFailureSample {
  entityType?: string | null
  entityId?: string | null
  sourceId?: string | null
  status?: string | null
  reason?: string | null
  evidencePath?: string | null
  recommendedAction?: string | null
  freshnessStatus?: string | null
  reportPath?: string | null
  sampleSource?: string | null
  notGateEvidence?: boolean | null
}
```

Add to `DataSourceAcceptancePanel`:

```ts
failureSamples?: DataSourceAcceptanceFailureSample[]
```

- [ ] **Step 4: Render samples in page**

For each panel card:

- Show only the first 50 samples.
- Show status, reason, entity id, evidence path, sample source, and whether it is non-gate evidence.
- Do not add a button that runs commands.
- Do not add a new endpoint call.

Use this helper:

```ts
function panelSamples(panel?: DataSourceAcceptancePanel | null) {
  return Array.isArray(panel?.failureSamples) ? panel.failureSamples.slice(0, 50) : []
}
```

- [ ] **Step 5: Validate admin**

Run:

```powershell
cd data-query-app
pnpm run check
pnpm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add data-query-app/types/dataSourceAcceptance.ts data-query-app/pages/operations/data-source-acceptance.vue data-query-app/tests/data-source-acceptance-page-contract.test.mjs
git commit -m "feat: show data source acceptance failure samples"
```
