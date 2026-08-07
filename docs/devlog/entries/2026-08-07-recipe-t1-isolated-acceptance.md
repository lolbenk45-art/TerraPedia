# Recipe T1 Isolated Acceptance

## Status

`active`

## Goal

Add and execute a governed recipe-only T1 pipeline acceptance against disposable
three-database resources, with formal databases remaining read-only.

## Scope

- Add `canonical-recipe-t1-acceptance` and a `recipe-canonical` T1 scope.
- Execute recipe import and relation consolidation only in isolated databases.
- Produce authorization, pipeline, formal-immutability, and cleanup evidence.
- Exclude formal recipe apply, item-scale work, scheduler activation, push, and merge.

## Current State

- Design and implementation plan are recorded under `docs/superpowers/`.
- Existing `canonical-recipe-apply` remains a formal database pipeline and is
  not authorized by this task.

## Validation

- Pending TDD contract and executor tests.
- Pending live ADMIN-authorized isolated T1 run.

## Residual Risks

- The existing recipe pipeline currently defaults to `terria_v1_local`; the
  new executor must prove every child stage receives the isolated target.

## Follow-Up

- Formal recipe apply requires a separate current-hash owner decision after T1 passes.
