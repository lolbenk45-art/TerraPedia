# Project Patterns

## Summary-First Repositories

Some repositories accumulate many task artifacts over time:

- `reports/*.md`
- `reports/*.json`
- runtime logs
- screenshots
- backup directories
- generated exports

In these repositories, the main risk is not missing information. The main risk is paying to reread too much information.

## Default Strategy

Use this order:

1. search report names
2. open one or two likely summaries
3. inspect structured outputs if needed
4. inspect the smallest raw source fragment that closes the gap

## Default Exclusions

Unless the task clearly requires them, deprioritize:

- `data/`
- `node_modules/`
- `target/`
- backup folders
- screenshots and binary files
- old runtime logs
- large generated JSON files that already have a markdown summary

## TerraPedia-Like Pattern

For repositories shaped like `terraPedia-db-redesign`, a good first pass is:

- scan filenames under `reports/`
- pick the newest matching markdown summary
- use matching JSON only when the summary lacks enough detail
- open only the code or log slices tied to the active task

Do not start by scanning the whole repository tree.
