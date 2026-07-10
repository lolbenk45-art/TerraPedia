# Remove Stale Governance Root Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete eight obsolete root governance documents and make every live
governance surface describe their removal instead of routing contributors to
stale guidance.

**Architecture:** A focused Node contract test defines the deletion boundary
and protects the three retained root references. Implementation hard-deletes
only the approved paths, updates the six live governance/status surfaces, and
preserves historical devlog records plus Git history as audit evidence.

**Tech Stack:** Markdown, Node.js built-in test runner, Git, Bash.

---

## File Map

Create:

- `scripts/dev/stale-governance-removal.test.mjs`: focused absence,
  preservation, live-routing, status, risk, and historical-evidence contract.
- `docs/superpowers/plans/2026-07-10-remove-stale-governance-docs.md`: this
  executable plan.

Delete:

- `docs/project-governance/03_TECH_STACK.md`
- `docs/project-governance/04_ARCHITECTURE.md`
- `docs/project-governance/07_TESTING_STRATEGY.md`
- `docs/project-governance/08_CICD_DEPLOYMENT.md`
- `docs/project-governance/09_SECURITY.md`
- `docs/project-governance/10_OPERATIONS.md`
- `docs/project-governance/11_DOCUMENTATION_SYSTEM.md`
- `docs/project-governance/12_RELEASE_CHECKLIST.md`

Modify:

- `docs/project-governance/INDEX.md`: replace stale-root routing with a durable
  removal boundary.
- `docs/project-governance/current/PROJECT_CONTROL.md`: remove deleted-file
  rows and prevent reintroduction as current guidance.
- `docs/project-governance/current/CURRENT_TECH_STACK.md`: replace the
  discovered status-banner route with the Git-audit-only removal boundary.
- `docs/project-management/current-status.md`: record completed removal.
- `docs/project-management/risk-register.md`: mark stale-root risk mitigated.
- `docs/devlog/current.md`: maintain active handoff, then close the task.
- `docs/devlog/entries/2026-07-10-remove-stale-governance-docs.md`: record
  red-green evidence, review disposition, residual risk, and closeout.

Do not modify `01_OVERVIEW.md`, `02_REQUIREMENTS.md`,
`06_UI_UX_GUIDELINES.md`, `archive/`, `legacy/`, or historical devlog entries.

## Execution Rules

- Source of truth: use `00_CURRENT_SPEC.md`, `00_WORKFLOW.md`, the maintained
  companion documents under `current/`, current status/risk records, and the
  approved design. The deleted bodies never supply replacement wording.
- Ownership: the main agent is the only writer for this plan, the design,
  `docs/devlog/current.md`, the task entry, final staging, integration, and
  remote operations. The Task 1 implementer owns only the focused test. The
  Task 2 implementer owns only the eight deletions plus INDEX, PROJECT_CONTROL,
  CURRENT_TECH_STACK, current-status, and risk-register. Implementers run
  strictly in sequence; specification and quality reviewers are read-only.
- Continuity: if execution finds another live consumer of a deletion target,
  keep the task `active`, patch this plan with the exact consumer and repair,
  re-run the affected plan-audit gates, and continue toward the same eight-file
  removal goal. Stop only if deletion would remove unique current knowledge
  without a maintained replacement.
- Destructive boundary: deletion is limited to the eight paths in the File Map.
  No archive, legacy, historical devlog, application, data, crawler, or runtime
  write is allowed.
- Plan-v8 repair sequence: the Task 1 implementer first extends only the focused
  test and returns a 2-pass/1-fail red state at the current-devlog Git-only
  boundary; Task 1 specification and quality re-reviews must pass. The main
  agent then repairs only coordinator-owned current devlog and requires 6/6
  integrated focused tests. The final integrated reviewer must re-review the
  two accepted Important findings before closeout resumes.

### Task 1: Define The Deletion Contract

**Files:**

- Create: `scripts/dev/stale-governance-removal.test.mjs`
- Read: `docs/superpowers/specs/2026-07-10-remove-stale-governance-docs-design.md`

- [ ] **Step 1: Write the focused contract test**

Create `scripts/dev/stale-governance-removal.test.mjs` with this content:

```js
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const stalePaths = [
  'docs/project-governance/03_TECH_STACK.md',
  'docs/project-governance/04_ARCHITECTURE.md',
  'docs/project-governance/07_TESTING_STRATEGY.md',
  'docs/project-governance/08_CICD_DEPLOYMENT.md',
  'docs/project-governance/09_SECURITY.md',
  'docs/project-governance/10_OPERATIONS.md',
  'docs/project-governance/11_DOCUMENTATION_SYSTEM.md',
  'docs/project-governance/12_RELEASE_CHECKLIST.md',
];

const preservedPaths = [
  'docs/project-governance/01_OVERVIEW.md',
  'docs/project-governance/02_REQUIREMENTS.md',
  'docs/project-governance/06_UI_UX_GUIDELINES.md',
];

const historicalDevlogPaths = [
  'docs/devlog/entries/2026-07-09-old-governance-doc-refresh.md',
  'docs/devlog/entries/2026-07-09-project-status-risk-sync.md',
];

function readText(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function pathEntryExists(relativePath) {
  return (
    lstatSync(resolve(repoRoot, relativePath), { throwIfNoEntry: false }) !==
    undefined
  );
}

test('approved stale root governance files are absent', () => {
  for (const relativePath of stalePaths) {
    assert.equal(pathEntryExists(relativePath), false, relativePath);
  }
});

test('approved reference and historical evidence files are preserved', () => {
  for (const relativePath of [...preservedPaths, ...historicalDevlogPaths]) {
    assert.equal(pathEntryExists(relativePath), true, relativePath);
  }
});

test('live governance surfaces record removal without routing deleted files', () => {
  const index = readText('docs/project-governance/INDEX.md');
  const control = readText(
    'docs/project-governance/current/PROJECT_CONTROL.md',
  );
  const currentTechStack = readText(
    'docs/project-governance/current/CURRENT_TECH_STACK.md',
  );
  const status = readText('docs/project-management/current-status.md');
  const risk = readText('docs/project-management/risk-register.md');
  const currentDevlog = readText('docs/devlog/current.md');
  const taskEntry = readText(
    'docs/devlog/entries/2026-07-10-remove-stale-governance-docs.md',
  );

  const liveSurfaces = {
    index,
    control,
    currentTechStack,
    status,
    risk,
    currentDevlog,
  };

  assert.match(index, /^## Removed Stale Root Documents$/m, 'INDEX removal heading');
  assert.match(
    index,
    /removed from the current\s+tree on 2026-07-10/,
    'INDEX removal date',
  );
  assert.doesNotMatch(
    index,
    /^## Stale Or Historical Root Files$/m,
    'INDEX obsolete routing heading',
  );
  assert.match(
    control,
    /Removed root `03`, `04`, and `07-12`/,
    'PROJECT_CONTROL removal row',
  );
  assert.doesNotMatch(
    control,
    /Root governance files reviewed .* carry status banners/,
    'PROJECT_CONTROL obsolete banner wording',
  );
  assert.match(
    currentTechStack,
    /Removed root governance files `03`, `04`, and `07-12` are available only\s+through Git history for audit or rollback/,
    'CURRENT_TECH_STACK removal boundary',
  );
  assert.doesNotMatch(
    currentTechStack,
    /Use old root governance files only through their status banners and\s+routing/,
    'CURRENT_TECH_STACK obsolete banner route',
  );
  assert.match(
    status,
    /were removed from the current tree on 2026-07-10/,
    'current-status removal state',
  );
  assert.doesNotMatch(
    status,
    /remain in place as reference\/history/,
    'current-status obsolete presence state',
  );
  assert.match(
    currentDevlog,
    /were removed from the current tree/,
    'current devlog removal state',
  );
  assert.doesNotMatch(
    currentDevlog,
    /Old root governance documents now carry status banners/,
    'current devlog obsolete banner state',
  );
  assert.match(
    currentDevlog,
    /Do not recreate removed root governance files `03`, `04`, or `07-12`;\s+use Git history only for audit or rollback/,
    'current devlog missing Git-only audit and rollback boundary',
  );
  const activeReviewState = /complete\s+final-review repair and re-review before closeout/.test(
    currentDevlog,
  );
  const closedTaskState = /^## Status\n\n`closed`$/m.test(taskEntry);
  assert.equal(
    activeReviewState || closedTaskState,
    true,
    'task missing active-review or closed state',
  );
  if (closedTaskState) {
    assert.equal(
      activeReviewState,
      false,
      'current devlog retains active final-review handoff after closeout',
    );
  }
  assert.doesNotMatch(
    currentDevlog,
    /execute\s+the audited removal plan from its focused red-state test/,
    'current devlog retains preimplementation red-state handoff',
  );
  assert.doesNotMatch(
    currentDevlog,
    /Root governance files `03`, `04`, and `07-12`\s+contain\s+old\s+planning-era\s+assumptions\s+and\s+should\s+not\s+be\s+used\s+as\s+current\s+execution\s+authority\s+without\s+revalidation/,
    'current devlog retains obsolete revalidation route',
  );

  const riskRows = risk
    .split('\n')
    .filter((line) => line.startsWith('| R-2026-07-09-01 |'));
  assert.equal(riskRows.length, 1, 'stale-root risk row count');
  assert.match(riskRows[0], /\| mitigated \|/, 'stale-root risk status');
  assert.match(
    riskRows[0],
    /were removed from the current tree on 2026-07-10/,
    'stale-root risk removal evidence',
  );

  for (const relativePath of stalePaths) {
    const basename = relativePath.split('/').at(-1);
    for (const [surfaceName, content] of Object.entries(liveSurfaces)) {
      assert.equal(
        content.includes(basename),
        false,
        `${surfaceName} routes ${basename}`,
      );
    }
  }
});
```

- [ ] **Step 2: Run the extended test and verify the plan-v8 red state**

Run:

```bash
node --test scripts/dev/stale-governance-removal.test.mjs
```

Expected at the plan-v8 continuation point: exit 1 with 3 tests executed, 2
passed, and exactly 1 failed. The live-governance test must fail first at
`current devlog missing Git-only audit and rollback boundary` because current
devlog still carries preimplementation and revalidation-era handoff wording.
Syntax, import, absence, preservation, INDEX, PROJECT_CONTROL,
CURRENT_TECH_STACK, status, or risk failures are not an acceptable red state.

- [ ] **Step 3: Return red-state evidence to the coordinator**

Return this compact validation result; only the main agent may append it to the
active task entry:

```md
- Plan-v8 red state: the focused removal contract executed three tests with two
  passing and failed only at the unrepaired current-devlog Git-only boundary.
- The test had no syntax or import failure.
```

Do not commit yet; the final implementation commit must contain the test with
the deletion and current-state updates.

### Task 2: Delete The Stale Roots And Repair Live Governance

**Files:**

- Delete: the eight paths listed in the File Map
- Modify: `docs/project-governance/INDEX.md`
- Modify: `docs/project-governance/current/PROJECT_CONTROL.md`
- Modify: `docs/project-governance/current/CURRENT_TECH_STACK.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`

- [ ] **Step 1: Delete exactly the eight approved files**

Use `apply_patch` delete operations for the eight paths in the File Map. Do not
delete or move any other root, archive, legacy, current, or reference file.

Verify the deletion boundary:

```bash
for path in \
  docs/project-governance/03_TECH_STACK.md \
  docs/project-governance/04_ARCHITECTURE.md \
  docs/project-governance/07_TESTING_STRATEGY.md \
  docs/project-governance/08_CICD_DEPLOYMENT.md \
  docs/project-governance/09_SECURITY.md \
  docs/project-governance/10_OPERATIONS.md \
  docs/project-governance/11_DOCUMENTATION_SYSTEM.md \
  docs/project-governance/12_RELEASE_CHECKLIST.md; do
  test ! -e "$path"
done

test -f docs/project-governance/01_OVERVIEW.md
test -f docs/project-governance/02_REQUIREMENTS.md
test -f docs/project-governance/06_UI_UX_GUIDELINES.md
```

Expected: exit 0.

- [ ] **Step 2: Replace stale routing in the governance index**

Replace the entire `## Stale Or Historical Root Files` section in
`docs/project-governance/INDEX.md` with:

```md
## Removed Stale Root Documents

Root governance documents `03`, `04`, and `07-12` were removed from the current
tree on 2026-07-10 because they contained obsolete technology, architecture,
testing, deployment, security, operations, documentation, or release guidance.

Git history preserves their original content for audit and rollback. Do not
recreate those root paths or route current work to their historical bodies.
Use `00_CURRENT_SPEC.md`, `00_WORKFLOW.md`, and the maintained files under
`current/` instead.
```

- [ ] **Step 3: Remove deleted rows from the project control panel**

In `docs/project-governance/current/PROJECT_CONTROL.md`:

1. Replace the paragraph at lines 22-23 with:

```md
Only files explicitly listed by the current spec, index, or this control panel
may guide current work. Historical intent remains available through Git,
`archive/`, and `legacy/`, but does not control progress.
```

2. Replace the `Governance File Status` introduction with:

```md
The table lists files and areas that remain in the current tree. Obsolete root
documents `03`, `04`, and `07-12` were intentionally removed on 2026-07-10 and
are recoverable only from Git history.
```

3. Delete the eight table rows for the removed files. Keep the rows for `01`,
   `02`, `06`, `reference/`, `archive/`, and `legacy/`.
4. Add this row after the `06_UI_UX_GUIDELINES.md` row:

```md
| Removed root `03`, `04`, and `07-12` | removed | Do not recreate or use as current guidance; Git history is audit-only recovery. |
```

5. Replace the P0 stale-document bullet with:

```md
- Keep removed root `03`, `04`, and `07-12` paths absent and route work through maintained current companions.
```

6. Replace the final two-line instruction with:

```md
Do not restore removed root planning files just to reuse old wording. Open a
new current companion or dedicated, freshly validated plan when guidance is
missing.
```

- [ ] **Step 4: Repair the discovered maintained-stack consumer**

Replace the final two-line instruction in
`docs/project-governance/current/CURRENT_TECH_STACK.md` with:

```md
Removed root governance files `03`, `04`, and `07-12` are available only
through Git history for audit or rollback. Use maintained current companions for
implementation guidance.
```

- [ ] **Step 5: Synchronize current status**

Replace the stale-root bullet in
`docs/project-management/current-status.md` with:

```md
- Stale root governance files `03`, `04`, and `07-12` were removed from the current tree on 2026-07-10; Git history remains audit-only recovery, not current authority.
```

- [ ] **Step 6: Mitigate the stale-root risk row**

Replace risk `R-2026-07-09-01` in
`docs/project-management/risk-register.md` with:

```md
| R-2026-07-09-01 | Stale root governance documents can be treated as current execution authority. | mitigated | Agents could follow old Astro/SSG/Pagefind/Cloudflare assumptions and choose wrong gates or architecture. | Root documents `03`, `04`, and `07-12` were removed from the current tree on 2026-07-10; maintained current companions remain routed from the index and control panel. | Keep the removed root paths absent; use Git history only for audit or rollback. | 2026-07-10 |
```

- [ ] **Step 7: Run the focused test and verify the serialized handoff state**

Run:

```bash
node --test scripts/dev/stale-governance-removal.test.mjs
```

Expected: 3 tests execute, 2 pass, and only the live-governance test fails
because coordinator-owned `docs/devlog/current.md` still carries the old banner
wording. Any remaining stale path, INDEX, PROJECT_CONTROL, CURRENT_TECH_STACK,
current-status, risk-register, preservation, syntax, or import failure blocks
handoff.

### Task 3: Validate And Review The Integrated Change

**Files:**

- Test: `scripts/dev/stale-governance-removal.test.mjs`
- Test: `scripts/dev/code-style-governance.test.mjs`
- Review: all paths changed from `40b41e7`

- [ ] **Step 1: Synchronize the active current devlog after Task 2 handoff**

After Task 2 implementation and its scope checks complete, the main agent must
replace this current-state bullet in `docs/devlog/current.md`:

```md
- Old root governance documents now carry status banners and current-authority routing.
```

with:

```md
- Stale root governance files `03`, `04`, and `07-12` were removed from the current tree; maintained companion docs remain the implementation authority.
```

Keep the task entry and Open Work active until integrated review and final
closeout finish.

At the plan-v8 continuation point, also replace the preimplementation red-state
handoff with:

```md
- Continue from the active task entry and complete final-review repair and re-review before closeout.
- Do not recreate removed root governance files `03`, `04`, or `07-12`; use Git history only for audit or rollback and add freshly validated current guidance when needed.
```

Replace the obsolete root revalidation risk with:

```md
- Historical devlog entries still mention removed root paths by design; those records are provenance, not live authority.
```

- [ ] **Step 2: Run both focused test files**

Run:

```bash
node --test \
  scripts/dev/stale-governance-removal.test.mjs \
  scripts/dev/code-style-governance.test.mjs
```

Expected: 6 tests passed, 0 failed.

- [ ] **Step 3: Run documentation integrity checks**

Run:

```bash
git diff --check 40b41e7

if rg -n \
  '03_TECH_STACK|04_ARCHITECTURE|07_TESTING_STRATEGY|08_CICD_DEPLOYMENT|09_SECURITY|10_OPERATIONS|11_DOCUMENTATION_SYSTEM|12_RELEASE_CHECKLIST' \
  docs/project-governance/INDEX.md \
  docs/project-governance/current/PROJECT_CONTROL.md \
  docs/project-governance/current/CURRENT_TECH_STACK.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md \
  docs/devlog/current.md; then
  exit 1
fi
```

Expected: exit 0. Historical devlog, design, plan, archive, and legacy paths are
excluded deliberately because they preserve provenance rather than live routing.

- [ ] **Step 4: Verify exact deletion and preservation scope**

Run:

```bash
git diff --name-status 40b41e7
git ls-files --others --exclude-standard
```

Expected:

- exactly eight `D` entries for the approved root documents;
- `M` only for INDEX, PROJECT_CONTROL, CURRENT_TECH_STACK, current-status,
  risk-register, `docs/devlog/current.md`, and the active task entry;
- the untracked-file list contains only the focused test and this plan;
- no changes under application, data, crawler, archive, legacy, `01`, `02`, or
  `06` paths.

- [ ] **Step 5: Request independent review**

Use `requesting-code-review` with:

- Base: `40b41e7`
- Review target: current uncommitted implementation diff
- Requirements: the approved design and this plan
- Focus: accidental knowledge loss, remaining live routes, exact deletion
  boundary, risk/status correctness, test adequacy, and rollback clarity

Critical or Important findings block closeout. Record reviewer, scope,
findings, disposition, resolver, re-review requirement, and remaining risks in
the active task entry.

### Task 4: Close Devlog And Commit The Implementation

**Files:**

- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-10-remove-stale-governance-docs.md`
- Stage: exact paths from Tasks 1-4

- [ ] **Step 1: Run pre-closeout status checks after review is clear**

Run:

```bash
git status --short
git diff --cached --stat
```

Expected: task-only working scope and an empty cached stat before explicit
staging. Do not set the entry to `closed` until these outputs are read.

- [ ] **Step 2: Close the task entry**

Update the entry as follows:

- set `## Status` to `closed`;
- record red and green focused-test results;
- record the 6/6 integrated focused-test result;
- record `git diff --check` and live-reference scan results;
- record exact eight-file deletion and three-file preservation results;
- record review disposition and residual risk;
- set Follow-up to `none`;
- set Commits to `commit SHA pending in final response`;
- complete every closeout checklist item.

- [ ] **Step 3: Close the current handoff**

In `docs/devlog/current.md`:

- remove `Active Branch` and `Active Focus` sections;
- set `Open Work` to `- none`;
- preserve the synchronized current-state bullet:

```md
- Stale root governance files `03`, `04`, and `07-12` were removed from the current tree; maintained companion docs remain the implementation authority.
```

- remove the active final-review task instruction and preserve this durable
  next-agent instruction:

```md
- Do not recreate removed root governance files `03`, `04`, or `07-12`; use Git history only for audit or rollback and add freshly validated current guidance when needed.
```

- preserve the synchronized historical-provenance risk bullet:

```md
- Historical devlog entries still mention removed root paths by design; those records are provenance, not live authority.
```

- add the task entry to `Recently Closed` with branch, worktree, `closed`
  status, and `commit SHA pending in final response`.

- [ ] **Step 4: Re-run final validation**

Run:

```bash
node --test \
  scripts/dev/stale-governance-removal.test.mjs \
  scripts/dev/code-style-governance.test.mjs
git diff --check 40b41e7
git status --short
git diff --cached --stat
```

Expected: 6 tests passed, diff check exit 0, task-only working scope. The cached
stat is empty before explicit staging.

- [ ] **Step 5: Stage explicit paths only**

Stage the eight deletion paths, the focused test, this plan, INDEX,
PROJECT_CONTROL, CURRENT_TECH_STACK, current-status, risk-register, current
devlog, and task entry. Never use `git add .`.

- [ ] **Step 6: Verify staged scope and commit**

Run:

```bash
git status --short
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
```

Expected: only the paths named in this plan. Then commit:

```bash
git commit -m "docs(governance): remove stale root guidance"
```

- [ ] **Step 7: Verify the committed branch**

Run:

```bash
git status --short --branch -uall
git show --stat --oneline --summary HEAD
node --test \
  scripts/dev/stale-governance-removal.test.mjs \
  scripts/dev/code-style-governance.test.mjs
```

Expected: clean branch and 6 tests passed.

### Task 5: Integrate And Publish

**Files:** none beyond committed task scope.

- [ ] **Step 1: Refresh and verify main**

From `/home/lolben/TerraPedia`:

```bash
git fetch --prune origin
git status --short --branch -uall
git rev-parse main
git rev-parse origin/main
```

Expected: clean `main`, with local and remote tips equal before integration.

- [ ] **Step 2: Fast-forward main**

Run:

```bash
git merge --ff-only docs/remove-stale-governance
```

Expected: fast-forward to the implementation commit.

- [ ] **Step 3: Verify and push main**

Run both focused test files and `git diff --check origin/main...HEAD`, then:

```bash
git push --dry-run origin main
git push origin main
```

Expected: remote `main` advances without force.

- [ ] **Step 4: Verify remote recovery and clean local task state**

Verify remote `main` equals local `HEAD`, the task worktree is clean, and
`origin/main` contains the exact task HEAD. Then remove the task worktree and
delete only the merged local task branch with `git branch -d`. Do not delete a
remote task branch unless separately requested.
