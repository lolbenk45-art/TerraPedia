# Runtime artifacts

`artifacts/` is reserved for generated runtime output that is demonstrably
rebuildable and is not a source of truth or durable evidence. The migration
does not move existing `data/` or `reports/` content into this directory.

- Keep canonical, normalized, compatibility, and backup data under `data/`.
- Keep authorization, canonical-migration, relation, crawler-monitor, and
  accepted audit evidence under `reports/` or promote durable conclusions to
  `docs/audits/`.
- Future runtime-only output may use `artifacts/runtime/` after its generator,
  retention, and rebuild contract is documented.
- Never place credentials, database dumps, Shimmer generations, or authorization
  packets here as a convenience.

The directory is intentionally empty apart from this placement contract until a
separate artifact-classification task proves a concrete runtime family can move
without breaking consumers or rollback evidence.
