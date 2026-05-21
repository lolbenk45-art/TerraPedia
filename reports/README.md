# Reports

`reports/**` stores generated evidence. It is not a general source-of-truth data layer.

## Tracked Evidence

Track reports when they are durable acceptance evidence, relation/readiness baselines, cutover verification records, or audit artifacts that future workers must reference by path.

Current tracked evidence includes:

- `reports/relation/*.md`
- `reports/relation/*.json`

Current tracked evidence excludes rerunnable runtime snapshots such as
`reports/relation/relation-audit-*.md` and `reports/relation/relation-audit-*.json`.
Promote any accepted relation-audit conclusion into `docs/audits/**` or a named baseline
before relying on it across tasks.

Tracked reports should have enough context to identify the command, date, scope, and intended consumer. If a report becomes an accepted audit conclusion, link it from `docs/audits/**` or promote the conclusion into a durable audit document.

## Ignored Runtime Reports

Local runtime reports, scratch logs, temporary diagnostics, repeated command output, and large rerunnable artifacts should stay untracked unless a plan explicitly promotes them as evidence.

Do not rely on a local ignored report as project knowledge. Promote the conclusion into `docs/audits/**`, `docs/plans/**`, or a tracked report path before handoff.

## Source-Of-Truth Rule

Reports are evidence, not data source files. A candidate report under `reports/canonical/candidates/**` is not canonical data until an accepted promotion writes a validated artifact under `data/canonical/{domain}/**`.

Do not move existing tracked report JSON without a compatibility plan and reference audit.
