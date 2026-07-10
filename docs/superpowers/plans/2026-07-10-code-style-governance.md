# TerraPedia Code Style Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a current TerraPedia code-style authority, a root EditorConfig baseline, and a focused consistency test without formatting existing application code or activating formatter/linter gates.

**Architecture:** A focused Node test defines the Stage 1 governance contract first. After the expected red result, two agents implement the disjoint machine-readable and human-readable sources in parallel; the coordinator then serially updates governance routing, project status/risk, devlog state, and integrated validation before a read-only cross-review.

**Tech Stack:** EditorConfig, Markdown governance, Node.js built-in `node:test`, Git, existing TerraPedia devlog/workflow conventions.

---

## Scope And File Ownership

Coordinator-only files:

- Create: `scripts/dev/code-style-governance.test.mjs`
- Modify: `AGENTS.md`
- Modify: `docs/project-governance/INDEX.md`
- Modify: `docs/project-governance/current/README.md`
- Modify: `docs/project-governance/current/PROJECT_CONTROL.md`
- Modify: `docs/project-governance/current/CURRENT_TECH_STACK.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-10-code-style-governance.md`
- Create: `docs/superpowers/plans/2026-07-10-code-style-governance.md`

Parallel producer files:

- Agent A creates `.editorconfig` and no other file.
- Agent B creates
  `docs/project-governance/current/CURRENT_CODE_STYLE.md` and no other file.
- Agent C performs read-only review and writes no file.

Forbidden in this plan:

- `front-nuxt/**`, `data-query-app/**`, `back/**`, and `data/**` changes
- package or Maven dependency changes
- `scripts/dev/quality-gate.sh` changes
- mass formatting or automatic format writes
- Prettier, ESLint, Spotless, Checkstyle, shfmt, ShellCheck, Ruff, or Black activation

## Execution Continuity

If a producer or reviewer finds that a known repository fact contradicts this
plan, the coordinator pauses only the affected lane, records the blocker in the
parent devlog, patches this plan (and the approved design only when the contract
itself must change), reruns the plan audit, and then resumes the original goal.
Agents must not improvise new tools, expand file ownership, or replace the
Stage 1 goal with a broader cleanup.

### Task 1: Define The Stage 1 Contract With A Failing Test

**Files:**

- Create: `scripts/dev/code-style-governance.test.mjs`
- Modify: `docs/devlog/entries/2026-07-10-code-style-governance.md`

- [x] **Step 1: Create the focused governance test**

Create `scripts/dev/code-style-governance.test.mjs` with exactly this content:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readIfPresent(relativePath) {
  const targetPath = repoPath(relativePath);
  return fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
}

test('root editorconfig defines the Stage 1 formatting baseline', () => {
  const editorConfigPath = repoPath('.editorconfig');
  const editorConfig = readIfPresent('.editorconfig');

  assert.equal(fs.existsSync(editorConfigPath), true, '.editorconfig must exist');
  assert.match(editorConfig, /^root = true$/m);
  assert.match(editorConfig, /^charset = utf-8$/m);
  assert.match(editorConfig, /^end_of_line = lf$/m);
  assert.match(editorConfig, /^insert_final_newline = true$/m);
  assert.match(editorConfig, /^trim_trailing_whitespace = true$/m);
  assert.match(editorConfig, /\[\*\.\{js,ts,mjs,cjs,vue,css,scss,json,jsonc,yml,yaml,sql,sh,bash,ps1\}\]\nindent_size = 2/);
  assert.match(editorConfig, /\[\*\.\{java,kt,kts,groovy,xml\}\]\nindent_size = 4/);
  assert.match(editorConfig, /\[\*\.py\]\nindent_size = 4/);
  assert.match(editorConfig, /\[\*\.md\][\s\S]*trim_trailing_whitespace = false/);
  assert.match(editorConfig, /\[Makefile\]\nindent_style = tab/);
});

test('current code style separates active rules from planned enforcement', () => {
  const stylePath = repoPath('docs/project-governance/current/CURRENT_CODE_STYLE.md');
  const style = readIfPresent('docs/project-governance/current/CURRENT_CODE_STYLE.md');

  assert.equal(fs.existsSync(stylePath), true, 'CURRENT_CODE_STYLE.md must exist');
  for (const heading of [
    '## Scope And Authority',
    '## Enforcement Status',
    '## Common Rules',
    '## Java',
    '## Vue And TypeScript',
    '## Node And Data Scripts',
    '## Python And Shell',
    '## Tests',
    '## Documentation And Commits',
    '## Staged Tool Adoption'
  ]) {
    assert.match(style, new RegExp(`^${heading}$`, 'm'), `missing heading: ${heading}`);
  }
  assert.match(style, /EditorConfig is the active machine-readable baseline/);
  assert.match(style, /Prettier, ESLint, and Spotless are not currently enforced/);
  assert.match(style, /Do not mass-format unrelated existing files/);
  assert.match(style, /behavior changes that have a practical focused automated test/);
  assert.match(style, /Exceptions follow the task workflow/);
  assert.match(style, /Semantic-lint remediation can change behavior/);
  assert.match(style, /normal tests and behavior-oriented commits/);
});

test('current governance routes contributors to the code style authority', () => {
  const routedFiles = [
    'AGENTS.md',
    'docs/project-governance/INDEX.md',
    'docs/project-governance/current/README.md',
    'docs/project-governance/current/PROJECT_CONTROL.md',
    'docs/project-governance/current/CURRENT_TECH_STACK.md',
    'docs/project-management/current-status.md',
    'docs/project-management/risk-register.md'
  ];

  for (const relativePath of routedFiles) {
    assert.match(
      readIfPresent(relativePath),
      /CURRENT_CODE_STYLE\.md/,
      `${relativePath} must route to CURRENT_CODE_STYLE.md`
    );
  }
});
```

- [x] **Step 2: Run the test and verify the expected red state**

Run from repository root:

```bash
node --test scripts/dev/code-style-governance.test.mjs
```

Expected: exit code `1`, three failed tests. The failures must identify missing
`.editorconfig`, missing `CURRENT_CODE_STYLE.md`, and missing governance routing.
If the command errors for syntax/import reasons, fix the test until it fails only
for the missing Stage 1 behavior.

- [x] **Step 3: Record the red evidence and immutable contract**

Run `date '+%Y-%m-%d %H:%M CST'` and use its exact output as the heading for a
new state-change item in
`docs/devlog/entries/2026-07-10-code-style-governance.md`. Under that heading,
append this body:

```md
- Change: Confirmed the Stage 1 governance test fails before implementation.
- Reason: The red result proves the test detects the missing EditorConfig,
  current style authority, and governance routing.
- Evidence: `node --test scripts/dev/code-style-governance.test.mjs` exited 1
  with three expected failed tests.
```

Do not stage or commit the red state.

### Task 2: Implement The Two Sources In Parallel

Task 2 starts only after Task 1 is red for the expected reason. Agents A and B
must acknowledge design contract v2 in their return message and must not run
`git add` or `git commit` in the shared worktree.

#### Task 2A: Agent A Creates The EditorConfig Baseline

**Files:**

- Create: `.editorconfig`

- [x] **Step 1: Create `.editorconfig`**

Create the file with exactly this content:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
trim_trailing_whitespace = true

[*.{js,ts,mjs,cjs,vue,css,scss,json,jsonc,yml,yaml,sql,sh,bash,ps1}]
indent_size = 2

[*.{java,kt,kts,groovy,xml}]
indent_size = 4

[*.py]
indent_size = 4

[*.md]
indent_size = 2
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

- [x] **Step 2: Validate the owned file without formatting sources**

Run:

```bash
sed -n '1,120p' .editorconfig
git diff --check -- .editorconfig
git status --short -- .editorconfig
```

Expected: the rule matrix is visible, diff check exits `0`, and only
`.editorconfig` is reported in the agent-owned scope.

- [x] **Step 3: Return the handoff**

Return:

```text
Contract acknowledged: design contract v2
Changed: .editorconfig
Validation: commands and exit results
Existing files formatted: none
Residual concerns: none, or exact rule conflict
```

#### Task 2B: Agent B Creates The Current Style Authority

**Files:**

- Create: `docs/project-governance/current/CURRENT_CODE_STYLE.md`

- [x] **Step 1: Create the current style document**

Create the file with exactly this content:

```md
# Current Code Style

Status: current
Last updated: 2026-07-10

This file is the current code-style entrypoint for maintained TerraPedia code.
It defines conventions for new and modified code without requiring unrelated
legacy files to be reformatted. The repository workflow and task-specific
contracts still control execution, validation, data safety, and API behavior.

## Scope And Authority

Apply this document to the maintained public Nuxt frontend under `front-nuxt/`,
the admin Nuxt frontend under `data-query-app/`, the Spring Boot backend under
`back/`, and maintained scripts under `scripts/`.

For an edited file, use this order:

1. Runtime/compiler/language correctness.
2. Repository workflow and current architecture or contract documents.
3. This code-style document and root `.editorconfig`.
4. Established local conventions in the owning module.

Generated data, reports, build output, vendored files, and lockfiles follow
their generators or package managers. Do not hand-format generated artifacts.

## Enforcement Status

EditorConfig is the active machine-readable baseline for encoding, line endings,
final newlines, indentation, and trailing whitespace in supported editors.

Prettier, ESLint, and Spotless are not currently enforced. Existing frontend
`check` commands primarily validate types and contracts, and backend Maven tests
validate compilation and behavior. Do not describe those commands as style
formatters or semantic linters.

Do not mass-format unrelated existing files. Format only new code and the lines
or focused files owned by the current task unless a dedicated baseline migration
explicitly authorizes wider formatting.

## Common Rules

- Use UTF-8, LF line endings, and a final newline.
- Prefer clear, domain-specific names over abbreviations.
- Keep functions and files focused on one responsibility.
- Preserve module boundaries and reuse existing helpers before adding new ones.
- Comments explain reasons, safety constraints, or non-obvious trade-offs; they
  do not narrate self-explanatory assignments.
- Do not mix behavior changes with repository-wide formatting.
- Keep secrets, credentials, tokens, private URLs, and local machine paths out
  of committed source and examples.

## Java

- Use lowercase package names, PascalCase types, lowerCamelCase methods and
  fields, and UPPER_SNAKE_CASE constants.
- Keep controller, DTO, service, mapper, entity, and configuration concerns in
  their existing package boundaries.
- Expose request/response DTOs instead of persistence entities unless an
  existing route intentionally preserves a legacy contract.
- Prefer constructor injection and existing Lombok patterns used by the owning
  module; do not introduce a second injection style in the same class.
- Use 4-space indentation. Keep imports explicit and remove unused imports.
- Name tests after observable behavior. Focused tests should identify the owning
  class and scenario without depending on execution order.

## Vue And TypeScript

- Use PascalCase for Vue components and TypeScript types/interfaces.
- Use lowerCamelCase for variables, functions, props, and local state.
- Name composables `useXxx` and keep API access in the existing composable or
  store boundary rather than hardcoding origins in pages/components.
- Use UPPER_SNAKE_CASE only for true module-level constants.
- Avoid unbounded `any`. When an external boundary is unknown, narrow `unknown`
  through validation or a small typed adapter.
- Keep Vue templates semantic and accessible; use the existing icon and design
  systems rather than adding one-off replacements.
- Use 2-space indentation and preserve the local quote/semicolon convention
  until a dedicated formatter migration establishes an automatic rule.

## Node And Data Scripts

- Follow the repository's ESM `.mjs` conventions for maintained Node scripts.
- Use kebab-case for executable script filenames and behavior-oriented names for
  tests.
- Make input, output, dry-run, and write boundaries explicit.
- Keep outputs deterministic where they are used as evidence or test fixtures.
- Use temporary directories in tests; do not write generated test data into the
  real tracked data chain.
- Use structured parsers and serializers for structured data instead of ad hoc
  text replacement.

## Python And Shell

- Use 4-space Python indentation and conventional snake_case names.
- Use 2-space shell indentation and quote variable expansions unless deliberate
  word splitting is documented and required.
- New Bash orchestration should use strict error handling when compatible with
  the command flow; document any deliberate exception.
- Bash/WSL remains the maintained automation path. PowerShell files are
  compatibility wrappers unless a current runbook says otherwise.
- Use 2-space indentation in PowerShell compatibility wrappers to preserve the
  dominant tracked convention.
- Destructive, data-writing, crawler, import, backfill, and service-lifecycle
  operations must remain explicit and follow their repository guards.

## Tests

- For behavior changes that have a practical focused automated test, add the
  test before implementation and verify the expected red result before the
  minimal green implementation. Exceptions follow the task workflow and must
  record the selected validation and reason.
- Prefer deterministic behavior assertions over implementation-detail snapshots.
- Keep fixtures minimal and name the contract they represent.
- Use the narrowest validation that proves the changed surface, then broaden
  when a shared contract or release boundary is affected.
- Do not hide failures through output filtering or claim an unrun gate passed.

## Documentation And Commits

- Update current-authority documents only when current project facts or durable
  development rules change; preserve historical document bodies.
- Keep devlog entries focused on decisions, validation, risks, and handoff state.
- Use behavior-oriented commit messages in the form `type(scope): action` with
  the commit types allowed by `AGENTS.md` and `00_WORKFLOW.md`.
- Stage explicit paths. Do not use `git add .`.

## Staged Tool Adoption

Future tooling is introduced in separate focused tasks:

1. Establish clean, pinned, non-blocking formatter and semantic-linter
   configurations for each maintained frontend or backend line.
2. Migrate formatter baselines in reviewable formatting-only commits.
3. Handle semantic-lint remediation separately. Semantic-lint remediation can
   change behavior, so use normal tests and behavior-oriented commits for those
   fixes.
4. Add read-only checks to the full quality gate only after the relevant
   maintained line has a clean baseline.

Automatic write/format commands must not run inside the quality gate. A future
tool configuration that conflicts with this document or `.editorconfig` must
resolve and document the rule change in the same task.
```

- [x] **Step 2: Validate the owned document**

Run:

```bash
git diff --check -- docs/project-governance/current/CURRENT_CODE_STYLE.md
rg -n '^## (Scope And Authority|Enforcement Status|Common Rules|Java|Vue And TypeScript|Node And Data Scripts|Python And Shell|Tests|Documentation And Commits|Staged Tool Adoption)$' docs/project-governance/current/CURRENT_CODE_STYLE.md
rg -n 'EditorConfig is the active|not currently enforced|Do not mass-format' docs/project-governance/current/CURRENT_CODE_STYLE.md
```

Expected: diff check exits `0`, all ten headings are returned, and active versus
planned enforcement wording is present.

- [x] **Step 3: Return the handoff**

Return:

```text
Contract acknowledged: design contract v2
Changed: docs/project-governance/current/CURRENT_CODE_STYLE.md
Validation: commands and exit results
Enforcement claim: EditorConfig active; Prettier/ESLint/Spotless planned
Residual concerns: none, or exact unsupported repository claim
```

### Task 3: Integrate Governance Routing And Project State

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/project-governance/INDEX.md`
- Modify: `docs/project-governance/current/README.md`
- Modify: `docs/project-governance/current/PROJECT_CONTROL.md`
- Modify: `docs/project-governance/current/CURRENT_TECH_STACK.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`

The coordinator performs these edits only after Agents A and B return and the
diff confirms they touched only their assigned files.

- [x] **Step 1: Add the contributor routing rule**

In `AGENTS.md`, add this bullet under `## Work Rules` immediately after the
scope rule:

```md
- Follow `docs/project-governance/current/CURRENT_CODE_STYLE.md` and the root
  `.editorconfig` for new or modified code; do not mass-format unrelated files.
```

- [x] **Step 2: Add current governance entrypoints**

In `docs/project-governance/INDEX.md`, add this item after
`CURRENT_TECH_STACK.md`:

```md
- `current/CURRENT_CODE_STYLE.md` - maintained code-style rules and staged
  formatter/linter adoption boundary.
```

In `docs/project-governance/current/README.md`, add this item after
`CURRENT_TECH_STACK.md`:

```md
- `CURRENT_CODE_STYLE.md`：当前代码风格、EditorConfig 基线和格式化/检查工具分阶段接入边界。
```

In `docs/project-governance/current/PROJECT_CONTROL.md`, add this companion item
after `CURRENT_TECH_STACK.md`:

```md
- `CURRENT_CODE_STYLE.md` - maintained code style and staged tool-adoption boundary.
```

Also add this status-table row after `CURRENT_TECH_STACK.md`:

```md
| `current/CURRENT_CODE_STYLE.md` | current | Maintained code style and EditorConfig baseline; formatter/linter gates remain staged. |
```

- [x] **Step 3: Describe the real tool boundary in the tech-stack summary**

In `docs/project-governance/current/CURRENT_TECH_STACK.md`, add this section
before `## Local Automation`:

```md
## Code Style Baseline

- Current human-readable authority:
  `docs/project-governance/current/CURRENT_CODE_STYLE.md`.
- Root `.editorconfig` is the active machine-readable editor baseline.
- Frontend Prettier/ESLint and backend Spotless are not currently enforced.
- Existing frontend `check` commands remain type/contract checks, and Maven
  remains compile/test validation; do not relabel them as style gates.
- Formatter/linter adoption and full-gate activation require separate baseline
  migrations documented by the current style authority.
```

- [x] **Step 4: Synchronize current project status**

In `docs/project-management/current-status.md`:

1. Change the date from `2026-07-09` to `2026-07-10`.
2. Change the companion-doc sentence/list so it includes
   `docs/project-governance/current/CURRENT_CODE_STYLE.md` between tech stack and
   architecture.
3. Add this bullet to `## Current Blockers And Risks`:

```md
- Code style now has a current document and EditorConfig baseline, but
  Prettier/ESLint/Spotless and strong style gates remain staged until each
  maintained line has a clean baseline.
```

4. Add this bullet to `## Next Actions`:

```md
- Introduce frontend and backend formatter/linter tooling through separate
  baseline migrations before adding read-only style checks to the full gate.
```

- [x] **Step 5: Record the current style-drift risk**

In `docs/project-management/risk-register.md`:

1. Change `Last updated` to `2026-07-10`.
2. Append this row:

```md
| R-2026-07-10-01 | Code style can drift because only EditorConfig is active and formatter/linter gates are not yet enforced. | active | New and modified code can remain structurally valid while accumulating inconsistent formatting or semantic lint debt. | `CURRENT_CODE_STYLE.md` and root `.editorconfig` establish Stage 1; package/Maven style tools remain explicitly staged. | Add pinned frontend/backend tools in separate baseline migrations, then activate read-only gates only after each maintained line is clean. | 2026-07-10 |
```

- [x] **Step 6: Run the focused test for the first green result**

Run:

```bash
node --test scripts/dev/code-style-governance.test.mjs
```

Expected: three tests pass, zero fail.

- [x] **Step 7: Run docs/process checks**

Run:

```bash
git diff --check
rg -n 'CURRENT_CODE_STYLE\.md' AGENTS.md docs/project-governance/INDEX.md docs/project-governance/current/README.md docs/project-governance/current/PROJECT_CONTROL.md docs/project-governance/current/CURRENT_TECH_STACK.md docs/project-management/current-status.md docs/project-management/risk-register.md
git status --short
git diff --stat
```

Expected: no whitespace errors; all seven routed files contain the style
entrypoint; changed paths remain inside this plan.

### Task 4: Update Handoff State And Run Cross-Review

**Files:**

- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-10-code-style-governance.md`

- [x] **Step 1: Record producer acknowledgement and integrated validation**

Update the parent devlog entry:

- Agent A status: `completed`; consumer acknowledgement: design contract v2.
- Agent B status: `completed`; consumer acknowledgement: design contract v2.
- Record the focused test command/result and `git diff --check` result.
- Record changed paths by module and write `See git for code-level diff details.`
- Keep overall status `active` until Agent C review is resolved.

Update `docs/devlog/current.md` timestamp and current state, but keep this entry
under Open Work with status `active` and dependency `read-only cross-review`.

- [x] **Step 2: Dispatch Agent C for read-only review**

Provide Agent C:

- Design spec path and implementation plan path.
- The exact Stage 1 changed-file list.
- Current `git diff --check` and focused test results.
- Instructions to report findings first by severity with file/line references,
  then residual risks and a review verdict.
- Explicit prohibition on all file writes, staging, commits, package installs,
  service operations, data/crawler commands, and quality-gate changes.

Expected: Agent C returns either no material findings or concrete findings for
coordinator resolution.

- [x] **Step 3: Resolve and record review findings**

For every material finding:

1. Record reviewer, scope, finding, disposition, resolver, and re-review need in
   the parent devlog.
2. Fix only the affected Stage 1 file.
3. Rerun the focused test and `git diff --check`.
4. Request focused re-review when the finding requires it.

Do not move to closeout while a finding is unresolved or marked
`needs-coordinator-decision`.

### Task 5: Final Verification And Focused Commit

**Files:**

- All Stage 1 files listed in this plan
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-10-code-style-governance.md`

- [x] **Step 1: Run fresh final validation**

Run from repository root:

```bash
node --test scripts/dev/code-style-governance.test.mjs
git diff --check
git status --short
git diff --stat
```

Expected: three tests pass, diff check exits `0`, and all changed paths belong to
Stage 1.

- [x] **Step 2: Close the devlog for one-commit implementation closeout**

Before changing status, run:

```bash
git status --short
git diff --cached --stat
```

Then update the parent entry:

- Status: `closed`
- Result: Stage 1 files and routing completed
- Validation: fresh focused test, docs check, and review result
- Residual risks: Stage 2/3 tooling remains follow-up; API-doc branch may cause a
  small governance-list merge conflict
- Follow-up: separate frontend/backend baseline migrations
- Commits: `commit SHA pending in final response`
- Complete the closeout checklist

Update `docs/devlog/current.md`:

- remove the entry from Open Work;
- add it to Recently Closed with branch/worktree/status and
  `commit: pending in final response`;
- update timestamp, current state, next start point, and current risks.

- [x] **Step 3: Stage only Stage 1 paths and inspect staged scope**

Run with the explicit path list:

```bash
git add .editorconfig \
  AGENTS.md \
  scripts/dev/code-style-governance.test.mjs \
  docs/project-governance/INDEX.md \
  docs/project-governance/current/README.md \
  docs/project-governance/current/PROJECT_CONTROL.md \
  docs/project-governance/current/CURRENT_TECH_STACK.md \
  docs/project-governance/current/CURRENT_CODE_STYLE.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-10-code-style-governance.md \
  docs/superpowers/specs/2026-07-10-code-style-governance-design.md \
  docs/superpowers/plans/2026-07-10-code-style-governance.md
git status --short
git diff --cached --stat
git diff --cached --name-status
git diff --cached --check
```

Expected: only the explicit Stage 1 paths are staged and cached diff check exits
`0`.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git commit -m "docs(style): establish current code style baseline"
```

Expected: one focused commit succeeds. Do not edit devlog solely to backfill the
SHA; report it in the final response.

- [ ] **Step 5: Verify post-commit branch state**

Run:

```bash
git status --short --branch -uall
git branch -vv
git worktree list --porcelain
```

Expected: the task worktree is clean, `docs/current-code-style` is ahead of
`origin/main`, and the original API-contract worktree remains untouched.

Keep the task branch and global worktree open after the commit. Do not push,
merge, or clean them until the user chooses the integration path.

## Plan Auditor Self-Review

- Status: execution-ready.
- Main goal: establish a discoverable current code-style authority and
  machine-readable editor baseline without broad formatting or tool activation.
- Closure definition: the focused test passes all three governance contracts,
  docs/process checks pass, routing/state records are synchronized, and the
  Stage 1 diff contains no application/dependency/gate changes.
- Critical defects: none.
- Important defects: none after removing the timestamp placeholder, correcting
  routed-file counting, adding execution-continuity and branch-disposition
  rules, aligning PowerShell to the tracked 2-space baseline, scoping test-first
  guidance to practical focused tests, and separating semantic lint remediation
  from formatting-only migrations.
- Agent split: Agent A owns `.editorconfig`; Agent B owns only the current style
  document; the coordinator owns tests/routing/devlog; Agent C is read-only.
- Smoke test: `node --test scripts/dev/code-style-governance.test.mjs` must fail
  before implementation and pass after integration.
- Final validation: focused Node test, `git diff --check`, explicit status/diff
  scope checks, devlog closeout, and post-commit branch/worktree verification.
- Residual risk: the separate API-contract documentation branch may later need a
  small manual merge resolution in shared governance lists.
