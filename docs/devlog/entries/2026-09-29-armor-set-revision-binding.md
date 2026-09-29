# Armor set source revision binding

## Status

`closed`

## Scope

- Owner: Armor domain branch `feat/automation-domain-armor`; worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`.
- Goal: preserve the authoritative Module:ArmorSetBonuses revision ID through raw, parsed, standardized and manifest evidence so future set-effect proposals can bind exact source bytes and module text keys.
- Boundary: source/evidence code and focused tests only. No database, landing, maint, relation, projection, Redis, scheduler or permit operation ran.

## Result

The Armor set-bonus fetch now carries `revisionId` in its raw payload, parsed payload, standardized upstream metadata and output/report path. The existing manifest advancement reads the output field and records the exact revision identity. Existing nullable behavior remains valid for test fixtures without a revision ID.

See git for code-level diff details.

## Validation

- RED observed: `node --test pipelines/fetch/fetch-wiki-armorsetbonuses.test.mjs` failed on `null !== 987654` before implementation.
- GREEN: same suite `4/4` passed.
- `node --check pipelines/fetch/fetch-wiki-armorsetbonuses.mjs` passed.
- `git diff --check` passed.

## Residual risk and follow-up

This binds module revision identity but does not authorize set-effect publication. A future proposal still needs revision-bound module text parsing, canonical textKey/variant mapping, complete before/after relation evidence and a registered executor. Qualified Shroomite attribute cells and the existing Armor full-chain source gate remain open. No consumed decision was reused.

## Commit

`commit SHA pending in final response`
