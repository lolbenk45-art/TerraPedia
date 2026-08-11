# Recipe T1 Isolated Acceptance

## Status

`closed`

## Goal

Add and execute a governed recipe-only T1 pipeline acceptance against disposable
three-database resources, with formal databases remaining read-only.

## Scope

- Add `canonical-recipe-t1-acceptance` and a `recipe-canonical` T1 scope.
- Execute recipe import and relation consolidation only in isolated databases.
- Produce authorization, pipeline, formal-immutability, and cleanup evidence.
- Exclude formal recipe apply, item-scale work, scheduler activation, push, and merge.

## Current State

- `canonical-recipe-t1-acceptance` uses two real recipes extracted from the
  local crawler JSON, enforced offline resolution, an exact run-derived local
  database name, and the temporary provisioner account.
- ADMIN decision `canonical-recipe-t1-acceptance-20260807-admin-12` passed in
  the isolated environment. Existing `canonical-recipe-apply` remains a formal
  database pipeline and is not authorized by this task.

## Validation

- Recipe/automation focused tests pass `83/83`; `git diff --check` passes.
- First ADMIN-authorized isolated run reached disposable resource creation and
  cleaned all databases/accounts/Redis state, but evidence publication failed
  on multiline pipeline JSON parsing. No formal database write occurred.
- A later run exposed that the full 3,663-recipe input combined with a two-row
  snapshot caused unnecessary Wiki metadata requests despite the manifest's
  `networkAccess=false` boundary. That run was stopped and independent readback
  confirmed zero remaining databases, accounts, Redis keys, or child writers.
- T1 now uses two real recipes extracted from the local crawler JSON, a bounded
  25-row snapshot, and enforced offline metadata resolution. A fresh packet is
  required for every rerun. See git for code-level diff details.
- Final run `npc-t1-recipe-20260807-12` passed: 129/129 snapshot tables
  verified; 2 recipes, 2 ingredient rows, and 3 station rows imported; no
  placeholder item/station or unresolved relation remained; provider
  consolidation completed against the isolated local database.
- Transaction probes were rollback `0/0/0`, commit `1/1/1`, restore `0/0/0`.
  Report cleanup passed, and independent readback found zero run databases,
  temporary accounts, Redis DB 1 keys, or recipe acceptance child processes.

## Residual Risks

- The two fixture recipes depend on item and station rows present in the first
  25-row bounded snapshot; offline acceptance fails closed if those source rows
  are no longer copied.
- Passing isolated T1 does not authorize formal recipe apply or prove a full
  3,663-recipe production import.

## Follow-Up

- Formal recipe apply requires a separate current-hash owner decision.
- Commit SHA pending in final response.
