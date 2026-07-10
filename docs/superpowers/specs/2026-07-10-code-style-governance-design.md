# TerraPedia Code Style Governance Design

Status: approved design
Date: 2026-07-10
Branch: `docs/current-code-style`

## Goal

Establish a current, discoverable code-style authority for TerraPedia, give
editors a shared low-risk formatting baseline, and define a staged path toward
automated frontend and backend style gates without mass-formatting existing
code in the first stage.

## Current Problem

The repository currently has strong workflow, validation, API, and UI guidance,
but no current code-style entrypoint. There is no root `.editorconfig`, no
frontend Prettier or ESLint configuration, and no backend Spotless or Checkstyle
configuration. Existing checks prove types, contracts, builds, and behavior;
they do not consistently enforce whitespace, indentation, imports, or naming.

The admin package's `lint` command currently aliases type checking, so it must
not be described as a formatting or semantic-lint gate.

## Considered Approaches

### Documentation only

Add a style document without editor or tool configuration.

- Benefit: smallest change.
- Cost: rules remain advisory and easy to drift from.
- Decision: rejected because it does not provide a machine-readable baseline.

### Staged enforcement

Add the current style authority and `.editorconfig` first, then introduce
formatter and linter tools in separate frontend and backend migrations. Enable
strong gates only after each maintained line has a clean baseline.

- Benefit: immediate consistency for new edits without a repository-wide
  formatting diff.
- Cost: full enforcement arrives over multiple focused tasks.
- Decision: selected because it controls risk and keeps review scope clear.

### Immediate full enforcement

Add all tools, format every maintained source file, and fail the full quality
gate on style in one branch.

- Benefit: quickest route to universal enforcement.
- Cost: large unrelated diffs, elevated merge-conflict risk, and poor review
  signal while the repository has no established formatter baseline.
- Decision: rejected for this task.

## Approved Design

### Stage 1: Current authority and editor baseline

This task implements Stage 1 only:

- Add `docs/project-governance/current/CURRENT_CODE_STYLE.md` as the current
  human-readable style authority.
- Add root `.editorconfig` as the machine-readable editor baseline.
- Add a focused Node test that checks the required style sections, core editor
  properties, and governance routing links.
- Link the style authority from `AGENTS.md`, the governance index, current
  governance README/control panel, current tech-stack summary, project status,
  and risk register.
- Keep the existing quality gate unchanged. The focused governance test is run
  directly during this task and documented as the Stage 1 validation command.

Stage 1 does not change runtime behavior, dependencies, package lockfiles,
application source formatting, or database/data state.

### Stage 2: Non-blocking tool adoption

Separate follow-up tasks will establish clean baselines before enforcement:

- Public and admin Nuxt packages: introduce a shared Prettier policy and an
  ESLint policy compatible with Nuxt 4 and Vue 3. Add explicit `format`,
  `format:check`, and semantic `lint` commands; do not keep `lint` as a typecheck
  alias. Establish formatter baselines separately from semantic lint
  remediation because lint fixes can change behavior.
- Spring backend: introduce Spotless with a pinned Java formatter and explicit
  `spotless:apply` / `spotless:check` commands.
- Script languages: assess shell and Python tools independently. Do not add
  `shfmt`, ShellCheck, Ruff, or Black until their current baselines and runtime
  availability are understood.

Stage 2 checks start as explicit package/module commands. They do not enter the
full repository gate while existing maintained files still fail.

### Stage 3: Strong gate activation

Only after a maintained line has a clean, committed baseline may its read-only
style check be added to `scripts/dev/quality-gate.sh`. Automatic write/format
commands must never run inside the quality gate.

Gate activation requires:

- a clean baseline on the target maintained line;
- pinned tool versions and committed lockfile/plugin configuration;
- documented local fix commands;
- focused tests for package-script or Maven wiring;
- a separate formatting-only commit when broad formatter output is unavoidable;
- normal focused tests and behavior-oriented commits for semantic lint fixes;
- devlog and validation evidence showing that behavior checks still pass.

## Stage 1 Rule Matrix

The root `.editorconfig` will define these minimum rules:

| Files | Indent | Other rules |
| --- | --- | --- |
| All text files | spaces by default | UTF-8, LF, final newline, trim trailing whitespace |
| Java, Kotlin-like Java support, Groovy, XML | 4 spaces | no formatter-specific import rules |
| JavaScript, TypeScript, MJS, CJS, Vue, CSS, SCSS, JSON, YAML, SQL, shell, PowerShell | 2 spaces | preserve local semantic conventions |
| Python | 4 spaces | compatible with PEP 8 indentation |
| Markdown | 2-space list indentation | preserve trailing whitespace for intentional hard breaks |
| Makefiles | tabs | preserve make syntax |

The style document will define the following human-readable rules:

- Common: small scoped changes, clear names, no unrelated reformatting, comments
  explain why, generated artifacts are not hand-formatted.
- Java: lowercase packages, PascalCase types, lowerCamelCase methods/fields,
  UPPER_SNAKE_CASE constants, explicit DTO boundaries, tests named by behavior.
- Vue/TypeScript: PascalCase component types/components, `useXxx` composables,
  lowerCamelCase values/functions, PascalCase types, avoid unbounded `any`, and
  keep API access in existing composable boundaries.
- Node/data scripts: ESM conventions already used by `.mjs` files, kebab-case
  executable script filenames, deterministic outputs, and no hidden writes.
- Python and shell: follow local entrypoint patterns, use 4-space Python and
  2-space shell indentation, quote shell expansions, and make destructive or
  data-writing operations explicit.
- Tests: behavior-oriented names, deterministic fixtures, temporary paths for
  generated output, and validation proportional to the changed surface. Use
  test-first for behavior changes with a practical focused automated test;
  workflow-defined exceptions remain authoritative.
- Documentation and commits: current-authority routing, concise comments/docs,
  and `type(scope): action` commit messages from the existing workflow.

When `.editorconfig`, the style document, and a future formatter disagree, the
future tool-adoption task must resolve the conflict explicitly. It must not
silently format around a contradictory documented rule.

## Files And Ownership

Stage 1 files:

- Create: `.editorconfig`
- Create: `docs/project-governance/current/CURRENT_CODE_STYLE.md`
- Create: `scripts/dev/code-style-governance.test.mjs`
- Modify: `AGENTS.md`
- Modify: `docs/project-governance/INDEX.md`
- Modify: `docs/project-governance/current/README.md`
- Modify: `docs/project-governance/current/PROJECT_CONTROL.md`
- Modify: `docs/project-governance/current/CURRENT_TECH_STACK.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify: `docs/devlog/current.md`
- Create/update: the matching task devlog entry and implementation plan

`docs/project-governance/00_CURRENT_SPEC.md` is not changed because Stage 1
does not change maintained application boundaries, source-of-truth order,
default commands, database/service lifecycle, data ownership, documentation
placement, or the repository workflow itself.

## Test And Validation Design

Implementation follows a configuration-oriented red/green cycle:

1. Add `scripts/dev/code-style-governance.test.mjs` first.
2. Run it and confirm failure because `.editorconfig`, the current style
   document, and routing links do not yet exist.
3. Add the minimum configuration and documentation needed to pass.
4. Run the focused test again.
5. Run `git diff --check`.
6. Run targeted scans for current-authority links, forbidden claims that lint is
   already enforced, and accidental changes outside the Stage 1 file list.

No backend, frontend, runtime, database, crawler, or full quality gate is
required for Stage 1 because it changes only documentation and editor guidance.
Those gates become required in the Stage 2 tasks that add package or Maven
tooling.

## Multi-Agent Execution Contract

The main agent is the coordinator and the only writer for
`docs/devlog/current.md`, the parent devlog entry, governance routing files, the
focused governance test, and final integration.

After the focused test is red, parallel implementation may use:

- Agent A: `.editorconfig` only.
- Agent B: `docs/project-governance/current/CURRENT_CODE_STYLE.md` only.
- Agent C: read-only cross-review after integration, covering rule consistency,
  authority routing, and scope.

Agents A and B consume this design as immutable contract version 2. They must
not modify each other's files, governance indexes, tests, package files, Maven
files, quality-gate scripts, or devlog files. The coordinator integrates and
runs the focused test after both return. Any conflicting rule interpretation
stops parallel writes and is resolved by the coordinator before continuing.

## Risks And Controls

- Risk: the editor baseline may expose whitespace changes in files developers
  touch later. Control: no repository-wide formatting in Stage 1; keep future
  format-only migrations separate from behavior changes.
- Risk: documentation may imply enforcement that does not exist. Control: the
  style document must label EditorConfig as baseline guidance and Stage 2/3 as
  not yet active.
- Risk: future tools may choose incompatible defaults. Control: tool-adoption
  tasks must compare their configuration to the Stage 1 rule matrix and update
  the authority in the same branch when needed.
- Risk: multi-agent edits may drift. Control: disjoint file ownership, one
  immutable design contract, one coordinator, and integrated validation.

## Acceptance Criteria

- A future contributor can find one current code-style entrypoint from the
  repository's current governance routes.
- Common indentation, encoding, line-ending, final-newline, and trailing-space
  behavior is machine-readable through `.editorconfig`.
- The document distinguishes formatting, semantic linting, type checking, and
  behavior/contract tests.
- The repository does not claim Prettier, ESLint, or Spotless enforcement before
  those tools are actually configured.
- No existing application source file is mass-formatted by Stage 1.
- The focused governance test and docs/process validation pass.
