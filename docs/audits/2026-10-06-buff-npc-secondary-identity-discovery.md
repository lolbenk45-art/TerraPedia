# Buff NPC Secondary Identity Discovery - 2026-10-06

## Scope

This is a read-only identity discovery pass over the `114` immunity facts that
were deferred by the approved `canonical-buff-npc-secondary-apply` operation.
It does not change the consumed `259`-row decision, create a packet or permit,
acquire a fence, or write any database, Redis, scheduler, landing, maint, or
relation row.

## Evidence

- Input candidate: `.local/tmp/buff-npc-secondary-candidate-20261006-v3.json`
- Input candidate SHA-256: `sha256:7102c4a604f89f5e0fdb9c5c1539da893dafce41f30f1f18cac00695955fe835`
- Identity target artifact: `.local/tmp/buff-npc-infliction-capture-20261001-v5-targets.json`
- Target artifact SHA-256: recorded in
  `.local/tmp/buff-npc-secondary-identity-discovery-20261006-v1.json`
- Revision-bound page evidence: `.local/tmp/buff-npc-infliction-capture-20261001-v5/pages/`
- Runtime artifact: `.local/tmp/buff-npc-secondary-identity-discovery-20261006-v1.json`
- Runtime artifact SHA-256: `sha256:1bfe882ff69fe1243d88b95d634a5bd53bed247a9d87190cabc852ae867f36f4`
- Scope candidate: `.local/tmp/buff-npc-secondary-candidate-20261006-v4.json`
- Scope candidate SHA-256: `sha256:8e9f9e7fa27ee235f616893683cd4c3ab676c2c54017833dfc1d9410174a97ea`

The target artifact is bound to the standardized NPC source hash and each
selected identity was checked against the raw page revision containing its
`auto` identity. A SELECT-only MySQL read verified the corresponding active,
non-deleted `maint_npcs` row on server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`.

## Result

- Input display-only facts: `114`
- Unique display names: `26`
- Facts with a unique page-target source ID and active maint identity: `94`
- Ambiguous variant facts retained: `20`
- Missing page-target IDs: `0`
- Maint identity mismatches: `0`
- Database writes: `false`

The `94` candidate facts are distributed across Buffs `395`, `397`, `398`,
`399`, and `400`. The remaining `20` facts are exactly the five occurrences
of each of four shared display names: `Lunatic Cultist`, `Martian Saucer`,
`Phantasm Dragon`, and `The Destroyer`. Their page targets expose multiple
stable variants, so no variant ID is inferred.

The v4 read-only candidate rederived the live relation baseline at `1549`
active rows and proposes `94` insert-only rows, preserving every existing row.
It is a scope preview only; its `scopeContract` is not accepted by the
consumed `canonical-buff-npc-secondary-apply` validator.

## Decision

The original `114`-fact deferment remains valid for the consumed operation.
The `94` newly resolved facts are evidence for a possible follow-up, but they
cannot be applied with the existing runner: its proposal validator is bound to
the already consumed `259` inserts and `114` deferred counts. Any publication
must use a new operation or an explicitly versioned scope contract, a fresh
candidate and locked baseline, a new owner decision, packet, permit, fences,
recovery journal, and independent after-set readback. The `20` ambiguous facts
remain deferred until a source contract identifies their variants.

## Validation

- Read-only identity discovery completed with `networkRequests=0` and
  `databaseWrites=false`.
- `node --check pipelines/relation/buff-npc-secondary-candidate.mjs` passed.
- `node --test pipelines/relation/buff-npc-secondary-candidate.test.mjs` passed
  `3/3`.
- `git diff --check` passed.
