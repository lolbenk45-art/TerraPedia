# Armor qualified cell diagnostics

## Status

`ready-for-commit`

## Scope

- Owner: Armor domain branch `feat/automation-domain-armor`; worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`.
- Goal: retain complete diagnostics for Armor attribute cells rejected by the exact numeric parser, especially qualified Shroomite values.
- Boundary: source semantic diagnostics and relation tests only. No database, landing, maint, projection, Redis, scheduler or permit operation ran.

## Result

Added `collectArmorAttributeCellDiagnostics()`, which reports every invalid cell with its record key, item identity, field, raw source text and expected unit. The existing producer remains fail-closed and still refuses to publish qualified values.

See git for code-level diff details.

## Validation

- RED observed: the new diagnostic export was initially missing.
- GREEN: Armor source/relation regression passed `262/262`.
- `node --check pipelines/relation/sync-maint-to-relation.mjs` passed.
- `git diff --check` passed.

## Residual risk and follow-up

Diagnostics do not authorize a value or perform an import. A fresh authoritative source must still resolve the six Shroomite qualified cells before the Armor candidate can proceed to governed landing and database execution.

## Commit

`commit SHA pending in final response`
