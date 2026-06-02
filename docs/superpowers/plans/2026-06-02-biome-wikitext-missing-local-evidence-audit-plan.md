# Biome Wikitext Missing Local Evidence Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a second read-only audit for the 24 `missing_local_entity_needs_backfill` rows to find weaker local evidence such as normalized internal-name matches, plural/singular candidates, item component sets, furniture families, banner families, and critter family rows.

**Architecture:** Reuse `reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json` as input. Add a separate audit script that filters missing rows only, runs schema-qualified `SELECT` queries against `terria_v1_local`, and emits evidence categories without writing mappings or aliases.

**Tech Stack:** Node.js ESM, `node:test`, JSON reports, `mysql2/promise` resolved through `data-query-app`, TerraPedia local DB `terria_v1_local`.

---

## Boundaries

- No DB writes.
- No `--apply=true`.
- No crawler, fetch, import, backfill, or load scripts.
- No final mapping decisions.
- Output is evidence only and must keep `needsUserDecision: true`.

## Files

- Create: `scripts/data/audit/biome-wikitext-missing-local-evidence-audit.mjs`
- Create: `scripts/data/audit/biome-wikitext-missing-local-evidence-audit.test.mjs`
- Output report, local/ignored: `reports/biome-wikitext-missing-local-evidence-audit-2026-06-02.json`

## Evidence Categories

- `normalized_internal_name_candidate`: row name matches local internal name after normalization, for example removing spaces/apostrophes.
- `weak_npc_family_candidate_needs_decision`: plural/singular NPC family candidates exist, but the evidence is not strong enough for a resolved mapping.
- `component_item_set_candidate`: set-like row has component item candidates.
- `item_family_candidate`: collection-like item row has a local item family.
- `still_missing_after_local_evidence_audit`: no useful local evidence found.

## Execution Status

- Status: executed read-only on 2026-06-02.
- Generated report: `reports/biome-wikitext-missing-local-evidence-audit-2026-06-02.json`
- Generated report summary:
  - total: 24
  - `weak_npc_family_candidate_needs_decision`: 16
  - `normalized_internal_name_candidate`: 3
  - `component_item_set_candidate`: 2
  - `item_family_candidate`: 1
  - `still_missing_after_local_evidence_audit`: 2
- Validation run:
  - `node --test scripts/data/audit/biome-wikitext-missing-local-evidence-audit.test.mjs scripts/data/audit/biome-wikitext-local-domain-resolution-audit.test.mjs scripts/data/audit/biome-wikitext-unresolved-report.test.mjs scripts/data/audit/biome-wikitext-linkage-dry-run.test.mjs`
  - result: 29/29 pass
- Runtime report validation:
  - exactly 24 rows
  - every row has `evidenceOnly: true`
  - every row has `needsUserDecision: true`
  - no DB writes, no crawler/fetch/import/backfill/load/apply command was run

## Execution Checklist

- [ ] Add tests first for classification and report contract.
- [ ] Verify tests fail before implementation.
- [ ] Add script with injected fake evidence loader and MySQL loader.
- [ ] Source-scan script for SQL writes, network/process modules, apply paths, and crawler/fetch/import/backfill/load paths.
- [ ] Run focused tests.
- [ ] Run prior biome audit tests.
- [ ] Run the real read-only audit with `NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules`.
- [ ] Validate output has 24 rows, preserves original input indexes, and every row is evidence-only/user-gated.
- [ ] Summarize which missing rows now have local evidence and which remain missing.

## Acceptance

- Tests pass.
- Real report has exactly 24 rows.
- No writes or import/backfill commands are run.
- Final handoff asks the user before any mapping or DB plan.
