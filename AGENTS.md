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

- `back/`: Spring Boot backend.
- `front-nuxt/`: maintained public Nuxt frontend.
- `data-query-app/`: maintained admin/data-query Nuxt frontend.
- `front/`: older frontend area; verify current relevance before editing.
- `scripts/dev/`: local stack, smoke, and quality-gate automation.
- `scripts/data/`: crawl, standardize, import, sync, audit, and data workflow tooling.
- `data/`: tracked data layers and compatibility inputs; never move data blindly.
- `docs/project-governance/`: current project facts, workflow, long-term governance, reference, archive, and legacy plans.
- `docs/devlog/`: active task traceability and handoff state.
- `docs/plans/` and `docs/superpowers/plans/`: task-level executable plans.
- `docs/audits/`: durable audit evidence and accepted review reports.
- `reports/`: generated runtime or audit artifacts; promote durable conclusions to `docs/audits/`.
- `task/`: local task context only, not final authority.

The old `project-plan/` root is retired. Use `docs/project-governance/`.

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
brainstorming previews and production `front-nuxt/` work.

- Use only the established runtime themes: `dark` / Forest Archive,
  `morning-paper` / Linen Paper, and `warm-slate` / Mist Workbench. Reuse the
  semantic token flow in `front-nuxt/assets/css/hifi-preview.css` and
  `front-nuxt/assets/css/tokens.css`; do not create a local palette or a new
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
- Backend focused tests: run Maven from `back/`, for example `mvn -Dtest=ClassA,ClassB test`.
- Backend broad tests: `cd back && mvn test`.
- Public frontend checks: `cd front-nuxt && pnpm run check`.
- Admin checks: `cd data-query-app && pnpm run check` or `pnpm run test`.
- Full local gate: `bash ./scripts/dev/quality-gate.sh`.
- Local stack start/stop: `bash ./scripts/dev/start-local-stack.sh` and `bash ./scripts/dev/stop-local-stack.sh`.

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
