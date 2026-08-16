# Data pipelines

`pipelines/` is the canonical data lifecycle boundary. It owns source fetch,
normalization, transformation, canonical projection, audit, import/backfill,
relation sync, and workflow orchestration. The former `scripts/data` entrypoint
was removed when the compatibility window closed; this is the only writable
pipeline source.

Use paths under `pipelines/` in new commands, CI, reports, and generated action
metadata. Existing reports and historical documents may retain
`scripts/data/...` as evidence of the command that produced them.

The pipeline boundary is fail-closed for destructive work: migration does not
authorize crawler apply/force, database writes, Redis reset, or external source
fetches. Run an operation only with its existing authorization and workflow
contract.

Common read-only entrypoints:

```bash
node pipelines/workflow/run-wiki-sync.mjs --mode=plan
node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan
node pipelines/audit/domain-readiness-audit.mjs --domain=items
```

Shared script helpers that are not data lifecycle code remain under
`scripts/lib/` and are imported through the project constants/resolver contract.
