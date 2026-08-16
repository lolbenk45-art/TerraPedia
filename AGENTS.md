# TerraPedia Agent Guide

This file is the first-read entrypoint for coding agents. It applies to the
whole repository.

## Read Order

1. `AGENTS.md`
2. `docs/project-governance/00_CURRENT_SPEC.md`
3. `docs/project-governance/00_WORKFLOW.md`
4. `docs/devlog/current.md`
5. The task plan, devlog entry, issue, or file named by the user

If documents conflict, the earlier item wins. Historical material under
`docs/project-governance/archive/` and `docs/project-governance/legacy/` is
reference only unless the current spec explicitly promotes it.

## Project Map

- `services/catalog-api/`: maintained Spring Boot backend and only backend source root.
- `apps/public-web/`: maintained public Nuxt frontend and only public-web source root.
- `apps/admin-console/`: maintained admin/data-query Nuxt frontend and only admin-console source root.
- `platform/local/`: local stack, smoke, and quality-gate automation.
- `platform/operations/`: scheduled/daemon wrappers.
- `platform/tooling/`: standalone developer tooling.
- `pipelines/`: crawl, standardize, import, sync, audit, and data workflow tooling.
- `packages/content-runtime/`: shared article/content runtime.
- `agent/`: shared portable skill source and thin cross-model agent adapters; runtime views are generated under `.codex/skills/` and `.claude/skills/`.
- `data/`: tracked data layers and compatibility inputs; never move data blindly.
- `docs/project-governance/`: current project facts, workflow, long-term governance, reference, archive, and legacy plans.
- `docs/devlog/`: active task traceability and handoff state.
- `docs/plans/` and `docs/superpowers/plans/`: task-level executable plans.
- `docs/audits/`: durable audit evidence and accepted review reports.
- `reports/`: generated runtime or audit artifacts; promote durable conclusions to `docs/audits/`.
- `.local/`: ignored per-worktree temporary state and logs; use `.local/tmp/` or `.local/logs/`.
- `task/`: local task context only, never a source of project facts.

The old `project-plan/` root is retired. Use `docs/project-governance/`.

The 2026-08-16 compatibility window is closed. The former roots
`front-nuxt/`, `data-query-app/`, `back/`, `shared/article-runtime/`,
`scripts/dev/`, `scripts/ops/`, `scripts/tooling/`, and `scripts/data/` are
retired and must not be recreated. Use the canonical roots above; historical
references belong only in archived or audit evidence.

## Cross-Model Entrypoints

`AGENTS.md` is the repository-wide entrypoint. `CLAUDE.md` and `GEMINI.md` are
thin adapters that use the same read order and governance sources. All agents
read `AGENTS.md`, `docs/project-governance/00_CURRENT_SPEC.md`, and
`docs/project-governance/00_WORKFLOW.md` before task-specific material.

`agent/skills/` is the editable common source for project skills marked
`portable`. `.codex/skills/` and `.claude/skills/` are generated runtime views;
do not edit them directly. Generate or refresh views with:

```bash
node platform/tooling/sync-agent-skills.mjs --write
```

Check runtime parity with `node platform/tooling/sync-agent-skills.mjs --check`.
Select a skill by its `description` and read only the skills relevant to the
task. Tool-specific metadata and local agent state remain outside the common
source.

## Work Rules

- Restate the user goal, success criteria, and out-of-scope items before non-trivial edits.
- Read `docs/devlog/current.md` before implementation, review closeout, handoff, or commit.
- For non-trivial work, decide whether to reuse/create a devlog entry. Workflow, skill, data, crawler, API, UI, validation, multi-agent, or multi-step work needs devlog traceability.
- Inspect real entrypoints, runtime state, data source chain, reusable scripts, and existing reports before changing behavior.
- Keep edits scoped. Do not rewrite historical documents just to modernize old wording.
- Follow `docs/project-governance/current/CURRENT_CODE_STYLE.md` and the root
  `.editorconfig` for new or modified code; do not mass-format unrelated files.
- Do not use destructive git commands such as `git reset --hard`, `git checkout -- <path>`, or broad cleanup unless the user explicitly asks.
- Do not use `git add .`; stage explicit paths only.

## Public UI Design Baseline

For any public frontend visual work (new page, high-fidelity mockup, layout,
theme, component styling, or visual review), agents **must read and follow**
`docs/design/terrapedia-public-ui-design-system-v1.md` before proposing or
editing UI. The document is the public design baseline and applies equally to
brainstorming previews and production `apps/public-web/` work.

- Use only the established runtime themes: `dark` / Forest Archive,
  `morning-paper` / Linen Paper, and `warm-slate` / Mist Workbench. Reuse the
  semantic token flow in `apps/public-web/assets/css/hifi-preview.css` and
  `apps/public-web/assets/css/tokens.css`; do not create a local palette or a new
  theme key without explicit user approval.
- Select the required page archetype before visual work: homepage is a public
  index; item/NPC pages are data-rich entity archives; articles are editorial
  discovery plus a dense archive. Homepage palette and material may be reused,
  but its hero structure must not be copied into detail or article pages.
- Preserve the design system's depth, density, control, image, accessibility,
  and forbidden-pattern rules. In particular, do not introduce oversized empty
  hero blocks, single-hue/heavy palettes, nested cards, decorative blobs, fake
  art, token-bypassing raw colors, or sparse long pages.
- Before showing or handing off visual work, run the design-system review
  checklist and validate the relevant desktop and mobile views for image
  failures, console/request errors, horizontal overflow, readable text, focus
  visibility, and 44px interactive targets.
- The visual specimen at
  `.superpowers/brainstorm/3542442-1785229764/content/public-ui-design-system-v1.html`
  is a comparison aid; the Markdown baseline is the normative source.

## Validation Defaults

Use the narrowest validation that proves the change.

- Docs/process: `git diff --check` plus targeted path/term consistency scans.
- Skill changes: skill validator plus `git diff --check`.
- Backend focused tests: run Maven from `services/catalog-api/`, for example `mvn -Dtest=ClassA,ClassB test`.
- Backend broad tests: `cd services/catalog-api && mvn test`.
- Public frontend checks: `cd apps/public-web && pnpm run check`.
- Admin checks: `cd apps/admin-console && pnpm run check` or `pnpm run test`.
- Full local gate: `bash ./platform/local/quality-gate.sh`.
- Local stack start/stop: `bash ./platform/local/start-local-stack.sh` and `bash ./platform/local/stop-local-stack.sh`.

Bash/WSL is the primary automation path. `.ps1` counterparts are compatibility
wrappers unless a current runbook says otherwise.

## Spec And Devlog

Update `docs/project-governance/00_CURRENT_SPEC.md` when a task changes current
project facts:

- maintained app boundaries
- source-of-truth order
- default commands, database, or service lifecycle
- data source chain or durable data ownership
- documentation placement rules
- workflow rules future agents must follow

Use `docs/devlog/entries/` for task state, validation evidence, residual risks,
handoff notes, and commit closeout. Keep `docs/devlog/current.md` short and
pointed at open work.

## Documentation Placement

- Current project facts: `docs/project-governance/00_CURRENT_SPEC.md`
- Project workflow: `docs/project-governance/00_WORKFLOW.md`
- Project governance index: `docs/project-governance/INDEX.md`
- Current project-level long-term plans: `docs/project-governance/current/`
- Useful non-authoritative references: `docs/project-governance/reference/`
- Historical records: `docs/project-governance/archive/`
- Legacy planning cluster: `docs/project-governance/legacy/`
- Task plans: `docs/plans/` or `docs/superpowers/plans/`
- Runbooks: `docs/runbooks/`
- Durable audits: `docs/audits/`
- Reproducible runtime reports: `reports/runtime/<operation>/`
- Local temporary state and logs: `.local/tmp/` and `.local/logs/`
- Historical task summaries: `docs/project-governance/archive/`

## Commit Checklist

Before commit:

1. Run required validation and read the output.
2. Run `git status --short`.
3. Run `git diff --cached --stat`.
4. Confirm staged scope belongs to one task.
5. Close or update devlog if the task requires it.
6. Use a message in the form `type(scope): action`.

Allowed commit types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, and
`data`.
