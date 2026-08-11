# NPC T1 Governed Operation Request Design

## Goal

Register the isolated canonical NPC T1 acceptance as a governed operation that
can later produce a hash-bound Owner request without running the acceptance.

## Scope And Boundary

The operation ID is `canonical-npc-t1-acceptance`. Its command may read the
formal local, maint, and relation databases only through the existing scrubbed
snapshot path, and may create only run-key-isolated temporary databases,
temporary accounts, and an explicit Redis DB from 1 through 14. It cannot
write formal data, crawl, start services, or bypass the canonical authorized
dispatcher.

## Contract

The execution manifest freezes the exact CLI arguments, code bundle, owner
completion input/completion artifacts and crawler evidence bundle, a private
ordinary local config path plus its SHA-256 hash, one Redis DB, and a run ID.
The request uses the normal server fingerprint, data bundle, and execution
manifest technical identity fields; it intentionally does not require a schema
bundle or automation-policy decision because the operation performs no formal
schema/data mutation and does not promote policy.

Before a packet can be authorized, manifest validation re-reads the private
config bytes and fails on a path, type, permission, symbolic-link, or hash
mismatch. The T1 CLI validates the same hash and requires an authorized packet
plus one-time dispatch permit before creating its temporary directory or any
isolated resource. The existing pre-read and post-cleanup owner-completion
checks remain unchanged.

## Evidence And Follow-up

Tests prove the catalog registration, exact command/config binding, request
technical-field set, config drift rejection, and unauthorised CLI rejection.
The repair produces no request or packet in this task. A later read-only
preflight can obtain the current server fingerprint and generate the exact
request; only then may the Owner supply actor, reason, authorization reference,
and decision identity.
