# Armor report revision binding

## Status

`closed`

## Scope

- Owner: Armor domain branch `feat/automation-domain-armor`; worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`.
- Goal: keep the Module:ArmorSetBonuses revision identity present in every emitted source artifact, including the refresh report.
- Boundary: crawler source/report contract and focused tests only. No database, landing, maint, relation, projection, Redis, scheduler or permit operation ran.

## Result

The Armor set-bonus refresh report now emits `revisionId` alongside its revision timestamp. The test also verifies the revision identity in raw, parsed, standardized, report and manifest outputs.

See git for code-level diff details.

## Validation

- RED observed: `node --test pipelines/fetch/fetch-wiki-armorsetbonuses.test.mjs` failed because `report.revisionId` was `undefined`.
- GREEN: `node --test pipelines/fetch/fetch-wiki-armorsetbonuses.test.mjs` passed `4/4`.
- `node --check pipelines/fetch/fetch-wiki-armorsetbonuses.mjs` passed.
- Armor source/relation regression passed `225/225`.
- `git diff --check` passed.

## Residual risk and follow-up

This closes only the report-level evidence gap. Qualified Shroomite values, authoritative set-effect mapping, and the Armor full-chain source gate remain open. No consumed decision was reused.

## Commit

`commit SHA pending in final response`
