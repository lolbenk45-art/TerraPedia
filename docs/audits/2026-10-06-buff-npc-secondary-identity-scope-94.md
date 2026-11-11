# Buff NPC Secondary Identity Scope 94

Date: 2026-10-06
Status: `COMPLETED`
Operation: `canonical-buff-npc-secondary-apply`

## Scope

The consumed `259/114` Buff NPC secondary decision is not reused. The v4
read-only candidate is bound to `buff-npc-secondary-identity-scope/v1`:

- Candidate: `.local/tmp/buff-npc-secondary-candidate-20261006-v4.json`
- Candidate SHA-256: `sha256:8e9f9e7fa27ee2353d88b95d634a5bd53bed247a9d87190cabc852ae867f36f4`
- Discovery SHA-256: `sha256:1bfe882ff69fe1243d88b95d634a5bd53bed247a9d87190cabc852ae867f36f4`
- Promotable facts: `94`
- Deferred shared-name variants: `20`
- Ambiguous names: `Lunatic Cultist`, `Martian Saucer`, `Phantasm Dragon`, `The Destroyer`

The current read-only relation baseline is `1549` active rows with hash
`sha256:13337f0da26adcff19ddb941d632ae33bc5fda0245b8e6a108fc32d1fedb10e3`.
The proposal preserves that baseline and plans `94` insert-only active
`immune` rows, producing `1643` rows with after hash
`sha256:2963edba59eae3cf11711bb145ffe1d4e60e8efc8419c371bee0d78c6cdd1e31`.

## Authorization Artifacts

- Proposal: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.proposal.json`
- Proposal SHA-256: `sha256:bd255f4fd5cf74f25e0500a33049e5494ac3cf63aa6ff862597637597b623378`
- Scope SHA-256: `sha256:e42faa66b1682b3de743e89034751fa51ebf76fe0f752c1e93c3960e52db301f`
- Execution manifest: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.execution-manifest.json`
- Execution manifest contract hash: `sha256:0055e1f1569b1d3aac406c988eb393d57dd9ab1644f91abe7a5b76b56e865070`
- Execution manifest file SHA-256: `sha256:d8ce10e73c6fb2fb9d02ce951c6f08d029ddc785202242ce635a7c49241b2111`
- Request: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.request.json`
- Request hash: `sha256:c344998a2bac901f4440783fe3813d1c41fbf1116e16bd5f2173a3c8f6d92d09`
- Request file SHA-256: `sha256:874de1eeeaa2914e8c02b3bcd1b8edd1bb2769ce8b6c28456d9b291954b11d66`
- Request status at preparation: `AWAITING_OWNER`; superseded for execution by the approved packet below.
- Request expiry: `2026-10-07T09:43:58.422Z`

The request binds the loopback MySQL server fingerprint, current ten-domain
policy set, proposal data bundle, and current code execution manifest. The
owner approved this exact request as `admin` with decision identity
`canonical-buff-npc-secondary-apply-20261006-identity-scope-94-admin-01`.

## Execution

- Packet: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.packet.json`
- Packet SHA-256: `sha256:b9052970347908fb9550a3a4a4612e587f80ef587b992c3c7e1add0c50f552e4`
- Owner input SHA-256: `sha256:1c19ec50393aab2e31f08266c44ed96788128571cd5186f3d47defcf246a7ad5`
- Run ID: `buff-npc-secondary-20261006-identity-scope-94`
- Journal: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.journal.json`
- Journal state: `COMMITTED`
- Result: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.result.json`
- Result SHA-256: `sha256:1c31f9f1f5531f1043eb7929d4469ff8cbfe0fbccd2df7ae6ed47c2dcf3097ff`
- Inserted: `94` active `immune` rows; no updates or deletes.
- Runtime fence evidence: `.local/tmp/buff-npc-secondary-fence-20261006-identity-scope-94.json`
- Fence token: `fence:buff-npc-secondary-20261006-identity-scope-94`; released with `activeFencesAfter=0`.
- Dispatch permit was consumed once; no permit artifact remains.

## Independent Readback

The independent MySQL readback is
`.local/tmp/buff-npc-secondary-independent-readback-20261006-identity-scope-94.json`
(`sha256:5f90aabfc711b6e7cf4ce2c8f079957ec6cdc43019e961f722114a4077908ecf`).
It confirms:

- active rows: `1549 -> 1643`, with `94` inserted;
- after-set hash: `sha256:2963edba59eae3cf11711bb145ffe1d4e60e8efc8419c371bee0d78c6cdd1e31`, matching the proposal and result;
- new rows: `94/94` present, `0` missing, `0` wrong, and `0` duplicate keys;
- deferred shared-name variants: `20`, unchanged and not promoted;
- live attempts, reservations, and active fences: `0/0/0`;
- decision ledger: consumed, with no remaining permit artifact.

## Validation

- `node --test pipelines/relation/buff-npc-secondary-candidate.test.mjs pipelines/relation/buff-npc-secondary-apply.test.mjs pipelines/relation/run-buff-npc-secondary-apply.test.mjs` - `6/6` passed.
- `node --check` passed for the candidate, apply, and runner modules.
- `git diff --check` passed.
- The proposal used one MySQL `START TRANSACTION READ ONLY` snapshot and rolled it back before authorization.
- The independent SQL readback passed with exact after-set and row-level checks.

The twenty ambiguous shared-name facts remain deferred and are out of scope
for this completed request. No scheduler activation or unrelated domain write
was performed.
