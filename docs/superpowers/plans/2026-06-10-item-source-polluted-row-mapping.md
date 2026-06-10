# Item Source Polluted Row Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the remaining polluted item source pages by extracting item-specific rows instead of copying page-level source matrices to every item.

**Architecture:** Keep the current candidate planner blocked by default. Add raw HTML fixtures and an item-specific row mapping contract before promoting any Torches, Ropes, or Block-placing wands rows.

**Tech Stack:** Node data audit scripts, raw wiki item page fixtures, JSON candidate reports, local `terria_v1_local` dry-run/apply only after review.

---

## Current Blockers

- `Torches`: 24 candidates; current extraction copies `Baby Slime`, `Bonus drop`, and other shared rows to every torch.
- `Ropes`: 4 candidates; current extraction copies the same mixed rows to every rope.
- `Block-placing wands`: 6 candidates; current extraction copies all wand sources to every wand.
- `Mummy set`: 3 candidates; source `Mummies` is unresolved.
- `Witch set`: 3 candidates; contains valid `Goodie Bag` plus extra `Witch set worldgen`.
- `Shucked Oyster`: 1 candidate; source `Oyster` is unresolved.

## Hard Boundaries

- Do not run crawler/fetch/import/backfill/pipeline/sync.
- Do not apply any Torches/Ropes/Wands rows until each extracted row carries a stable item key.
- Do not infer item-specific ownership from display text alone if the raw table structure does not provide a stable row or section.
- All DB writes must go through `scripts/data/relation/apply-item-source-candidate-local-compat.mjs` with dry-run first and `--confirm-local-compat=true`.

## Required Contract

Every promoted row from a polluted matrix page must include at least one stable item discriminator:

- `sourceItemInternalName`
- `sourceItemName`
- `sourceRowHeader`
- `sourceSectionTitle`

## Tasks

- [ ] Add raw HTML fixture tests for one representative Torch, Rope, and Wand page.
- [ ] Extend extraction output with the item discriminator fields above.
- [ ] Add candidate planner tests proving Torches/Ropes/Wands remain blocked when discriminator fields are absent.
- [ ] Add candidate planner tests proving only rows matching the candidate item can become eligible.
- [ ] Generate a read-only report with per-page eligible/blocked counts.
- [ ] Multi-agent review the report for cross-item leakage.
- [ ] Dry-run one small batch; apply only if `blockedRows=0`, `validationErrors=0`, and no cross-item rows are present.

## Acceptance

- Torches/Ropes/Wands do not share the same full source matrix across every item.
- Mummy set, Witch set, and Shucked Oyster each have an explicit rule or remain blocked with a documented reason.
- API `/api/public/items/{id}/sources` shows only item-specific sources for sampled repaired items.
