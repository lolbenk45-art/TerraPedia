# Unified Source-Backed Any Item Group Management Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Validate serially through the coordinator; do not run competing data writers.

**Goal:** Replace ad hoc Any item/item group handling with a unified, source-backed management path that preserves traceability, avoids fabricated data, and supports rollback at every milestone.

**Architecture:** Start with a file-backed read API and admin page so current source data can be inspected without DB writes, then migrate groups into database tables/services with source references. Downstream recipe, NPC shop, relation, projection, and compatibility consumers move one at a time behind validation reports and rollback switches.

**Tech Stack:** TerraPedia backend Java/Spring, existing DB migration tooling, existing crawler/import source artifacts, existing frontend/admin runtime, coordinator validation scripts/reports.

---

## Global Rules

- Do not invent item records, fake aliases, or placeholder items to satisfy missing relations.
- Every group, member, relation, and projection row must carry source identity: source type, source file/page/table, source key, observed name, import batch, and timestamps where available.
- Coordinator validation is serial: one milestone writes data or changes runtime consumers at a time; no parallel jobs touching the same tables, files, projections, or reports.
- Rollback must be available per milestone: feature flag, DB migration down path or restore script, projection regeneration from previous source, and cached file-backed fallback.
- Preserve compatibility for public consumers until M8 cutover; deprecate local files only after validated DB parity.
- Reports are deliverables, not optional logs: each milestone writes a deterministic report with counts, mismatches, unresolved references, and source coverage.

## Impact Map

- Source inventory: crawler/import artifacts, current local Any item/group files, recipe source files, NPC shop sources, relation tables/reports.
- Backend APIs/services: current item group endpoints first as file-backed, then DB-backed after M2.
- Data model: item group, group member, source trace, import batch, validation status, projection compatibility outputs.
- Consumers: recipe ingredient resolution, NPC shop item resolution, relation pages/services, local projections, frontend admin/runtime pages.
- Validation: coordinator reports, parity checks, source coverage checks, unresolved reference reports, rollback rehearsal.

## M0: Inventory And Source Audit

- [ ] Lock the write scope: this milestone is read-only except for audit reports under the project report/docs area.
- [ ] Inventory all current Any item/item group definitions and classify each entry as `source-backed`, `derived-from-source`, `local-only`, or `unknown`.
- [ ] Map source chain for each candidate group: wiki/crawler page, parser output, import artifact, recipe/NPC/relation use site, and current local consumer.
- [ ] Identify all fabricated or synthetic records currently used to make Any behavior work, including fake items such as stand-ins for `Any Pylon`.
- [ ] Produce `any_item_group_source_audit` report with:
  - group key, display name, members, source references, consumers, confidence, unresolved references
  - duplicate groups or conflicting names
  - local-only data requiring source confirmation before migration
- [ ] Gate to M1 only when every existing group is either traceable or explicitly listed as blocked with no DB writes planned for it.

**Rollback:** None required; M0 is read-only. If audit is incomplete, stop and keep current runtime unchanged.

## M1: Current File-Backed API And Page

- [ ] Add or stabilize a file-backed admin API that serves current Any item/item group data with source audit metadata.
- [ ] Add or stabilize an admin page for group browsing, search, member inspection, source links, source-backed edits, and consumer usage.
- [ ] Show validation state plainly: `verified`, `source-missing`, `member-unresolved`, `consumer-only`, `blocked`.
- [ ] Allow only source-backed central override writes; the page must not synthesize members, create fake items, or repair data silently.
- [ ] Block writes when the existing central override file is malformed so a bad file cannot be overwritten by an empty replacement.
- [ ] Add contract tests for the file-backed API response shape, including source fields and unresolved member reporting.
- [ ] Add UI/runtime smoke checks for the page using only current local files.

**Exit criteria:** Admin users can inspect all current groups and see where each record came from before any migration.

**Rollback:** Remove/disable the admin route or feature flag; current production consumers continue reading existing files.

## M2: DB Schema And Service Migration

- [ ] Create DB schema for canonical groups, members, source traces, import batches, and validation statuses.
- [ ] Enforce uniqueness on stable group keys and member identity, but allow multiple source traces per group/member.
- [ ] Import only M0-verified source-backed records; blocked/local-only records remain file-backed and excluded from canonical tables.
- [ ] Implement DB-backed service with read parity to the M1 API shape.
- [ ] Add migration tests for:
  - duplicate group prevention
  - member source trace retention
  - unresolved source rejection
  - idempotent re-import by batch
- [ ] Produce parity report comparing file-backed M1 output to DB-backed M2 output.

**Exit criteria:** DB service can serve all verified groups with complete source traceability and no fabricated records.

**Rollback:** Feature flag API back to file-backed service; drop or ignore new tables; retain migration batch report for diagnosis.

## M3: Recipe Consumption Migration

- [ ] Inventory recipe consumers that expand Any ingredients or resolve group members.
- [ ] Add resolver path that reads canonical DB groups first and falls back to file-backed data only for explicitly blocked records.
- [ ] Preserve recipe semantics: Any ingredient remains a group requirement, not a fabricated item.
- [ ] Validate recipe output before/after migration:
  - recipe count unchanged unless source audit explains a correction
  - unresolved group references reported, not hidden
  - no new fake item IDs introduced
- [ ] Add tests for representative recipes using Any groups, mixed source-backed and blocked groups, and missing members.
- [ ] Write recipe migration report with affected recipes, resolved groups, fallback groups, and failures.

**Exit criteria:** Recipe runtime consumes canonical groups for verified Any requirements while retaining transparent fallback for blocked records.

**Rollback:** Disable DB group resolver for recipes; restore file-backed resolver and keep M3 report for replay.

## M4: NPC Shop And Relation Resolution

- [ ] Inventory NPC shop entries and relation records that refer to Any groups, group members, pylons, or local stand-ins.
- [ ] Resolve NPC shop requirements through canonical groups without manufacturing item rows.
- [ ] Treat `Any Pylon` as a source-backed group or condition expression, never as a fake item.
- [ ] For pylon-like requirements, model the relation as:
  - source-backed group if source lists interchangeable pylon items
  - source-backed condition if source describes category behavior without item membership
  - unresolved if source cannot verify either form
- [ ] Update relation resolution to preserve original source name and resolved target separately.
- [ ] Add validation report for NPC shops and relations with resolved, fallback, unresolved, and rejected-fake counts.
- [ ] Add tests covering NPC shop relation resolution, `Any Pylon`, unresolved source, and no-fake-item guarantees.

**Exit criteria:** NPC shop and relation views resolve Any groups from source-backed data, and `Any Pylon` no longer depends on fabricated item records.

**Rollback:** Feature flag relation/shop resolver back to legacy path; do not delete legacy files until M8.

## M5: Projection And Local Compatibility Consumers

- [ ] Inventory generated projections and local compatibility files that still expect old Any group shapes.
- [ ] Generate compatibility projections from canonical DB groups with source trace metadata included or linked.
- [ ] Keep output schemas stable for unchanged consumers; introduce versioned fields only where needed for traceability.
- [ ] Add deterministic projection build checks:
  - stable ordering
  - no local-only unverified records entering canonical projection
  - unresolved references emitted to report
  - legacy consumers pass against generated compatibility files
- [ ] Document each compatibility consumer and its planned retirement condition.

**Exit criteria:** Existing consumers can keep running on generated compatibility outputs while canonical DB remains the source of truth.

**Rollback:** Repoint consumers to previous checked-in/local projection files; keep generated outputs out of cutover until reports are clean.

## M6: Validation And Reporting

- [ ] Centralize coordinator validation into one serial command or documented sequence for M2-M5 checks.
- [ ] Produce consolidated report with:
  - group count by source and status
  - member count and unresolved member count
  - recipe/NPC/relation consumer coverage
  - fake/synthetic item detections
  - projection parity and drift
  - rollback readiness
- [ ] Fail validation on fabricated data, source-missing canonical records, unexplained count drift, or non-deterministic projections.
- [ ] Add a manual review checklist for blocked source gaps before runtime cutover.
- [ ] Archive reports by batch ID/date so regressions can be compared across imports.

**Exit criteria:** One coordinator-serial validation path proves source traceability, consumer parity, and no fabricated data before UI/runtime verification.

**Rollback:** Validation is non-mutating except report writes; failed reports block M7/M8.

## M7: UI And Runtime Verification

- [ ] Run backend API smoke tests for group list/detail, recipe expansion, NPC shop relation, and projection endpoints.
- [ ] Run frontend/admin page verification for search, status filters, source trace display, unresolved rows, and linked consumers.
- [ ] Run public/runtime page checks for item, recipe, NPC shop, and relation views that include Any groups.
- [ ] Verify empty/error/loading states do not hide source gaps or imply fabricated completeness.
- [ ] Compare screenshots or DOM snapshots for representative cases before and after feature flag switch.
- [ ] Record runtime verification report with URLs, API calls, expected statuses, and observed differences.

**Exit criteria:** UI and runtime surfaces show source-backed Any group data correctly, preserve existing user workflows, and expose unresolved data honestly.

**Rollback:** Switch feature flags back to file-backed/legacy consumers; restart only the affected services if required by the runtime config.

## M8: Cleanup And Cutover

- [ ] Freeze legacy file-backed writes and mark old local Any group files as compatibility-only.
- [ ] Switch default runtime to DB-backed canonical groups after M6 and M7 pass on the same batch.
- [ ] Remove fake item dependencies and dead synthetic records only after reports prove no active consumer needs them.
- [ ] Remove or quarantine obsolete local projections after generated compatibility outputs are adopted.
- [ ] Update operational docs with:
  - source-backed import flow
  - validation command sequence
  - rollback switches and restore points
  - blocked source review process
- [ ] Run final coordinator validation after cleanup and archive the cutover report.

**Exit criteria:** Canonical source-backed DB groups are the default runtime path; legacy files are retired or compatibility-only; rollback remains documented and tested.

**Rollback:** Restore feature flags to M5 compatibility outputs or M1 file-backed service, then replay the last clean import batch after the issue is fixed.

## Final Acceptance Checklist

- [ ] No canonical group/member exists without source trace.
- [ ] No fabricated item is introduced for Any groups or `Any Pylon`.
- [ ] Recipe, NPC shop, relation, projection, admin UI, and public runtime consumers pass serial validation.
- [ ] All unresolved records are reported with source gap reason and owner action.
- [ ] Rollback path is tested for API/service, projections, and runtime feature flags.
- [ ] Cleanup removes only data and code paths proven unused by reports.
