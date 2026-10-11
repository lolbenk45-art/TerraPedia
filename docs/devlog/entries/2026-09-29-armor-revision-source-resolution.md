# Armor revision-bound source resolution

## Status

`closed`

## Context

- User goal: continue Armor source-gate work toward a governed full-chain import without inventing qualified numeric values.
- Branch: `feat/automation-domain-armor`
- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`
- Related entries: `2026-09-28-armor-source-semantics-continuation.md`, `2026-09-29-armor-qualified-cell-diagnostics.md`, `2026-09-29-armor-set-source-evidence-contract.md`.

## Direction / Decisions

- Ran a new bounded, revision-bound collection under immutable namespace `a63-20260929-armor-source-01` for five Shroomite pages plus Mining Helmet/Pants, with monitor-visible progress and no database or control writes.
- Ran a second bounded revision-bound collection under `a63-20260929-armor-source-02` for `Module:Iteminfo/data` and `Module:ArmorSetBonuses`.
- Accepted the module identity evidence for Mining Helmet (`itemId=88`, head slot, defense 2), Mining Pants (`itemId=411`, leg slot, defense 1), and the five Shroomite item IDs/slots. This resolves the duplicate Mining Helmet identity without row-order or image guessing.
- Kept the six Shroomite qualified cells (`>15%` ranged damage and `>20%` ranged damage+crit cells) rejected. The fresh Shroomite armor page revision supplies set-level effects (`+13%`, `+25%`, `+20%`, `+12%`) but no exact per-piece numeric authority for those qualified cells.

## Scope

- Data/evidence: source collection manifests, immutable raw pages and a canonical source-evidence report.
- Out of scope: landing/maint/relation/projection writes, permits, scheduler state, H8 policy changes, local.items, DDL, direct SQL/Redis repair, and replay of consumed decisions.

## Validation

- `bash platform/local/verify-local-stack.sh --skip-front` passed DB TCP, mapper preflight, backend compile and Admin typecheck.
- Authenticated read-only runtime checks: scheduler disabled, live attempts/claims `0/0`, reconciler healthy, MySQL server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, Redis 6380 DB14 `PONG`/readable.
- Revision-bound collection progress completed `7/7`; module collection completed `2/2`.
- Armor focused Node22 regression passed `261/261`; `git diff --check` passed.

## Result

- Completed: fresh revision evidence and `reports/authorization/canonical/canonical-armor-semantic-repair.a63-20260929-01.source.json`.
- Not completed: executable Armor candidate or governed import. The six qualified cells remain a source-semantic blocker; no landing or database operation was attempted.

## Residual Risks

- The source table intentionally expresses six qualified values without exact numeric precision. Coercing them would recreate the prior unsafe 15/20% fabrication.
- The evidence report references immutable local artifacts retained under the Armor source namespaces; those artifacts are diagnostic and are not landing authority by themselves.

## Follow-up

- Owner: Armor domain/coordinator. Decide and test an explicit partial-source policy that can carry qualified cells as excluded diagnostics, or obtain stronger revision-bound per-piece exact evidence. Only then derive a fresh landing → maint → relation → projection candidate and proceed through permit/apply gates.

## Commits

- `commit SHA pending in final response`.
