# Armor set source evidence contract

## Status

`ready-for-commit`

## Scope

- Owner: Armor domain branch `feat/automation-domain-armor`; worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`.
- Goal: fail closed when the Module:ArmorSetBonuses revision or `textKey`/benefit mapping drifts between raw, parsed, standardized and refresh-report artifacts.
- Boundary: source evidence contract and crawler tests only. No database, landing, maint, relation, projection, Redis, scheduler or permit operation ran.

## Result

Added `armor-set-source-evidence/v1`. The Armor set-bonus fetch now validates one positive revision ID and timestamp across all emitted artifacts, exact parsed/standardized set mappings, and a hash of the raw module content before writing outputs. The report retains the resulting evidence envelope.

See git for code-level diff details.

## Validation

- RED observed: missing evidence module failed the new contract test; malformed and drifted cases are covered.
- GREEN: focused Armor source/relation regression passed `228/228`.
- `node --check` passed for both changed source modules.
- `git diff --check` passed.

## Residual risk and follow-up

This is an input gate for the future Armor landing/candidate proposal; it is not a database import. Qualified Shroomite values, authoritative set-effect text capture, fresh runtime authorization, and the governed full-chain apply remain open.

## Commit

`commit SHA pending in final response`
