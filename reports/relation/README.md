# Relation Reports

`reports/relation/**` contains tracked relation evidence, readiness baselines, and cutover verification records.

The existing relation JSON files are compatibility-sensitive evidence and are not moved in the 2026-05-14 responsibility cleanup pass.

Rules:

- Keep `reports/relation/*.json` in place unless a separate migration plan inventories all references and consumers.
- Treat relation Markdown files as human-readable evidence paired with JSON snapshots when both exist.
- Do not rewrite historical relation evidence only to match new directory preferences.
- New relation reports should state the command, date, scope, and whether the output is a baseline, verification, or readiness snapshot.
