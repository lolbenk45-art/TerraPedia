# NPC Isolated T1 Executor Repair

## Goal

Make the existing `npc-canonical` isolated T1 acceptance executable and bind its
real rollback, restore, cleanup, and scrubbed-snapshot evidence into the
fail-closed canonical NPC readiness report.

## Problem

The live acceptance CLI always selects `runNpcCanonicalT0Acceptance` for the
NPC scope. That executor rejects `profile=t1`; the readiness writer then
hard-codes all three T1 evidence flags to `false`. Consequently a valid
isolated T1 run cannot exist and the canonical NPC report cannot reach T1.

## Chosen Design

Add a separate `npc-canonical-t1-acceptance.mjs` executor. It accepts only a
`t1` manifest with an explicit scrubbed read-only source snapshot and a verified
copy of that snapshot. It validates that the copied snapshot contains every
NPC-owned table and non-empty source evidence for the canonical landing, maint,
relation, and local lanes. It does not write the formal databases.

The generic live runner continues to prove a transaction rollback, commit, and
restore in its three run-key-isolated databases. After cleanup succeeds, it
writes an atomic mode-0600 NPC T1 evidence file. The NPC readiness writer reads
that private artifact, validates its run/profile/snapshot/completion binding,
and only then reports the three T1 flags as true. It continues to make a
separate read-only formal database/API observation; missing API evidence remains
blocked.

## Rejected Alternatives

1. Treat the existing T0 fixture as T1. Rejected because it neither validates a
   copied formal snapshot nor produces a real T1 evidence binding.
2. Treat the generic probe as all T1 evidence. Rejected because it proves only
   the temporary probe table, not the NPC snapshot/input/completion chain.
3. Permit a manually-created JSON evidence file. Rejected because the readiness
   report must reject unbound or non-private evidence.

## Boundary

- The repair changes only Node acceptance/readiness code, tests, plans, and
  devlog evidence.
- The eventual T1 run creates temporary isolated databases, temporary accounts,
  and one explicit empty Redis logical database. It has read-only access to the
  formal database triplet and must remove all temporary resources before it
  returns success.
- It does not authorize or perform crawler work, formal database writes, API
  startup, source-contract flips, L1/L2 promotion, scheduler activation, or
  commits.

## Success Criteria

- `--profile=t1 --scope=npc-canonical` resolves a T1-specific executor.
- The executor rejects a T0 profile, an unverified/scrubbed snapshot mismatch,
  missing NPC snapshot tables, and incomplete cleanup evidence.
- A private T1 artifact binds the canonical NPC completion hash, T1 run key,
  source-snapshot hash, snapshot verification hash, rollback/restore proof,
  and cleanup proof.
- The readiness report remains blocked without that artifact and accepts it
  only when its identity matches the current owner-phase completion.
- Focused Node tests pass before any isolated run is requested.
