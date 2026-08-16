# Task Routing

## Goal

Choose the cheapest source that can answer the task correctly.

## Routing Order

### Report Or Summary Tasks

Read in this order:

1. recent summary `.md`
2. structured report `.json`
3. only the raw files needed to verify a gap

Do not start from full raw logs unless no usable summary exists.

### Code Change Tasks

Read in this order:

1. target file list from the user
2. direct imports, callers, tests, or adjacent config
3. wider module search only if behavior is still unclear

Do not scan the whole repo before reading the target files.

### Bug Or Debug Tasks

Read in this order:

1. exact error message or failing test
2. log tail around the failure
3. owning code path
4. neighboring files only if the root cause remains unclear

Do not read entire logs. Start from the tail or the matching error lines.

### Data Repair Or Audit Tasks

Read in this order:

1. latest audit report or dry-run result
2. schema or script tied to the issue
3. only the affected rows, entities, or files

Prefer derived reports over raw datasets.

## Scope Rules

- Start with one primary module
- Add a second module only if the first module cannot explain the behavior
- Add a third module only if the interface boundary is proven relevant

If scope keeps expanding, pause and write a compact scope summary before continuing.
