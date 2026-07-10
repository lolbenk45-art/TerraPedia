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
3. Handle semantic-lint remediation separately.
   Semantic-lint remediation can change behavior, so use normal tests and behavior-oriented commits for those fixes.
4. Add read-only checks to the full quality gate only after the relevant
   maintained line has a clean baseline.

Automatic write/format commands must not run inside the quality gate. A future
tool configuration that conflicts with this document or `.editorconfig` must
resolve and document the rule change in the same task.
