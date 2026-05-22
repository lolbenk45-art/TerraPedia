# Condition Terms Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move TerraPedia local requirement terms out of `world_contexts` into `condition_terms`, while preserving NPC shop and recipe condition references.

**Architecture:** Add a focused `condition_terms` backend/admin domain and keep existing polymorphic relation tables. World-context transforms and imports stop emitting `LOCAL_CONDITION`; local shop condition parsing resolves range/completion/progression phrases as `CONDITION_TERM`.

**Tech Stack:** MySQL/Flyway migrations, Spring Boot/MyBatis Plus, Node ESM data scripts/tests, Nuxt admin generic entity page.

---

## Scope Guard

- Do not edit biome schema, biome crawler, biome import, biome image code, or biome admin behavior.
- Existing biome relation reads may remain in files that also need condition-term joins; those joins must not change semantics.
- Do not push remote.
- Do not commit generated local artifacts.

## Task 1: Tests First For Data Split

- [x] Update `scripts/data/transform/transform-wiki-world-contexts-to-importable.test.mjs` so `LOCAL_CONDITION` rows are absent from world-context output.
- [x] Update `scripts/data/lib/town-npc-shop-conditions.test.mjs` so moon phase ranges, completed events, and mechanical boss progress resolve as `CONDITION_TERM`.
- [x] Update `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs` so the import setup ensures condition terms separately from world contexts.
- [x] Run the three Node tests and confirm failures are caused by the missing split implementation.

## Task 2: Data Script Implementation

- [x] Modify `scripts/data/transform/transform-wiki-world-contexts-to-importable.mjs` so it filters local terms out of `worldContexts`.
- [x] Modify `scripts/data/lib/town-npc-shop-conditions.mjs`:
  - add local condition term definitions,
  - add `getRequiredTownNpcConditionTerms()`,
  - add `conditionTermsByCode` to the lookup,
  - resolve local condition phrases to `CONDITION_TERM`.
- [x] Modify `scripts/data/import/import-wiki-town-npcs-to-db.mjs`:
  - ensure condition terms in `condition_terms`,
  - load condition terms into the lookup,
  - keep real states in `world_contexts`.
- [x] Re-run the Node tests.

## Task 3: Backend Tests First

- [x] Add backend coverage for condition-term catalog/API behavior.
- [x] Update support-domain tests so the catalog includes `conditionTerms`.
- [x] Update recipe condition tests or controller coverage so `CONDITION_TERM` references resolve labels.
- [x] Run targeted Maven tests and confirm failures before backend implementation.

## Task 4: Backend Implementation

- [x] Add Flyway migration `V44__split_condition_terms_from_world_contexts.sql`.
- [x] Add `ConditionTerm` entity and mapper.
- [x] Add `/admin/condition-terms` CRUD controller.
- [x] Extend support-domain catalog with `conditionTerms`.
- [x] Extend recipe/NPC/public condition joins so `CONDITION_TERM` labels resolve.
- [x] Prevent new `LOCAL_CONDITION` world-context creation.
- [x] Re-run targeted Maven tests.

## Task 5: Admin UI Tests And Implementation

- [x] Update `data-query-app/tests/world-context-admin-contract.test.mjs` so `LOCAL_CONDITION` is no longer a world-context filter and `condition-terms` has a separate config.
- [x] Update `data-query-app/stores/supportDomains.ts` to expose condition terms.
- [x] Update `data-query-app/pages/entities/[type].vue`:
  - world-context copy only describes wiki-backed contexts,
  - add `condition-terms` entity config,
  - remove `LOCAL_CONDITION` filter from world-contexts,
  - keep recipe/NPC condition helper copy aligned.
- [x] Run admin contract test and typecheck.

## Task 6: Validation And Commit

- [x] Run focused Node tests.
- [x] Run focused backend Maven tests.
- [x] Run `cd data-query-app && pnpm run check`.
- [x] Skip `bash scripts/dev/verify-local-stack.sh`; local stack live verification was not required for this data/admin split.
- [x] Check `git status --short` and staged stat.
- [ ] Commit focused implementation without generated artifacts.
