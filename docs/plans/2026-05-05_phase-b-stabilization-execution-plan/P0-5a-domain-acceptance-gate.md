# P0.5a Domain Acceptance Script And Gate Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Domain Acceptance script gates match Phase B policy before public consumer work.

**Architecture:** Harden tests and CI-safe gate behavior around the existing domain acceptance workflow. CI should fail on blocking states only; ordinary warnings stay visible but non-red in CI v1.

**Tech Stack:** Node.js workflow scripts, PowerShell CI-safe gate, Markdown decision records.

---

## Files

- Modify: `scripts/dev/quality-gate-ci.ps1`
- Modify: `scripts/dev/quality-gate.test.mjs`
- Modify: `scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs`
- Modify: `docs/project-management/decision-log.md`

## Steps

- [ ] **Step 1: Add or update A-grade gate tests**

Required cases in `domain-acceptance-a-grade-gate.test.mjs`:

- `writesDatabase=true` blocks.
- `commandRisk="unsafe"` blocks.
- public-blocking panel with `freshnessStatus="missing"` blocks.
- public-blocking panel with `freshnessStatus="unknown"` blocks.
- non-public panel with `freshnessStatus="stale"` warns.
- planned-public domain with `publicRoute=null` warns but does not block by itself.

- [ ] **Step 2: Add CI gate assertions**

In `quality-gate.test.mjs`, assert:

```js
const ciSource = fs.readFileSync('scripts/dev/quality-gate-ci.ps1', 'utf8');
assert.match(ciSource, /domain-acceptance-a-grade-gate\.mjs/);
assert.match(ciSource, /--fail-on-blocked=true/);
assert.doesNotMatch(ciSource, /--fail-on-warning=true/);
assert.doesNotMatch(ciSource, /domain-acceptance-generate-reports\.mjs[\s\S]*--write=true/);
```

- [ ] **Step 3: Run tests**

Run:

```powershell
node --test scripts/dev/quality-gate.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs
```

Expected: PASS after implementation.

- [ ] **Step 4: Update decision log**

Append:

```markdown
## D-2026-05-05-07: Domain Acceptance blocks P2 public domains

Decision: Domain Acceptance is P0.5 and must close before Item/NPC public acceptance and before new public Boss/Buff/Projectile/ArmorSet work.
Reason: Public consumers must not define readiness independently of registry, reports, freshness, refresh plan, and gate.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add scripts/dev/quality-gate-ci.ps1 scripts/dev/quality-gate.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs docs/project-management/decision-log.md
git commit -m "test: harden domain acceptance workflow gates"
```
