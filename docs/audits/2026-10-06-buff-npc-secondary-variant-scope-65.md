# Buff NPC Secondary Variant Scope 65

Date: 2026-10-06
Status: `COMPLETED`
Operation: `canonical-buff-npc-secondary-apply`

## Scope

This is a new versioned follow-up to the consumed `259/114` and completed
`identity-scope-94` decisions. It resolves the four shared display-name groups
using stable, revision-bound Npcinfo identities. The prepared proposal does
not reuse a consumed decision; the execution artifacts and runtime evidence
are recorded below.

## Source Evidence

- Evidence: `.local/tmp/buff-npc-secondary-variant-identity-evidence-20261006-v1.json`
- Evidence file SHA-256: `sha256:c47efe3c15ae96f3a8dce99fbb363a31ad5980451f5db452649dc1399c0c01e5`
- Npcinfo page: `Module:Npcinfo/data`, page `18065`, revision `1022313`
- Npcinfo raw SHA-256: `sha256:0c3a474f7b0f0034bc62183b2a0ae1b00c13f47527f109f24e8e8a536fec2a3a`
- Semantic expansion source includes revision-bound `Module:Npcinfo/doc`,
  `Module:Npcinfo/datagen`, `Template:GetBuffInfo`, and `Whips`; the expansion
  is limited to Buff IDs `395`, `397`, `398`, `399`, and `400`.

The source proves all five Buff facts for these stable variants:

| Display name | Stable IDs | Expansion | Facts |
| --- | --- | --- | ---: |
| Lunatic Cultist | `439`, `440` | all-not-whips / all | 10 |
| Martian Saucer | `392`, `395` | all / all-not-whips | 10 |
| Phantasm Dragon | `454-459` | all-not-whips | 30 |
| The Destroyer | `134-136` | all-not-whips | 15 |

The resulting scope is `65` stable NPC identity facts and `0` deferred facts.

## Candidate And Authorization

- Candidate: `.local/tmp/buff-npc-secondary-candidate-20261006-v5.json`
- Candidate internal SHA-256: `sha256:5e7af5d1419747196e2bea3f0f96e3101a1c5eb9732b013a52fc568da8cb3984`
- Candidate file SHA-256: `sha256:99e1ea9f8b165cc4b3a013940e853c49a959362f353a0e8be17036500a37c75e`
- Proposal: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.variant-scope-65.proposal.json`
- Proposal SHA-256: `sha256:88aa18f3701e3eda37be2bc510225bd1828c8fada81856ba7d25afae81fb66d9`
- Scope SHA-256: `sha256:7029c22d1778c4058f3ba6a55793c805b5d1aa1a5c2614df85961d6f49ec8d04`
- Request: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.variant-scope-65.request.json`
- Request hash: `sha256:fa106bdaa793c565358c8d4783b7c80f7f507f10698ffe0a25f169347f331cd3`
- Request status: `AWAITING_OWNER`; expires `2026-10-07T15:01:38.564Z`
- Execution manifest hash: `sha256:7a041d48ccaa26fd5aaa216c2ec80fc8ce301c55192f1411c6a39a6bee92fef9`

The proposal is insert-only for `relation.npc_buff_relations.immune` and is
bound to the existing canonical operation with a new result label
`variant-scope-65`. It plans `1643 -> 1708` active rows, exactly `65` inserts,
zero updates, zero deletes, and preserves the current baseline hash
`sha256:8ed1d4e5999c46c04b8f4819f13d4d1c32d7170b0ae41855d0fb026fe0984614`.
The planned after-set hash is
`sha256:dbc0834c1df54ac24404fd1a2b57799b07196970f6b0f67cea69f70232e3a1c2`.

## Runtime Readback

The read-only snapshot observed MySQL server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, owner `admin/ACTIVE`, live run
attempts `0`, active reservations `0`, and active write fences `0`. Redis DB14
returned `PONG`. No runtime mutation occurred.

## Validation

- Revision-bound Npcinfo verifier and secondary candidate/apply/runner tests:
  `15/15` passed.
- Candidate/proposal validator passed with exact baseline and after-set hashes.
- `node --check` passed for the new preparation script and touched secondary
  modules.
- `git diff --check` passed.

## Execution

The original `variant-scope-65` packet attempt was admitted through the
canonical runner but failed before journal preparation because the runtime
fence had not yet been acquired. It consumed its single-use decision and
created no journal, result, fence, or business-table mutation; that decision
was not replayed.

The approved scope was retried with a fresh operation binding and decision:

- Retry request: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.retry-02.request.json`
- Retry request hash: `sha256:6f43c9bf074c52a5f800376ccdf27517b91fc005acb9d424059739d01a14c0a5`
- Retry proposal: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.retry-02.proposal.json`
- Retry proposal file hash: `sha256:88aa18f3701e3eda37be2bc510225bd1828c8fada81856ba7d25afae81fb66d9`
- Retry execution-manifest hash: `sha256:0d42045e8e455ffd4978757ff187c7be7d39961faac592f9da74f2d7313b7619`
- Decision identity: `canonical-buff-npc-secondary-apply-20261007-variant-scope-65-retry-02-admin-01`
- Packet: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.retry-02.packet.json`
- Packet hash: `sha256:ae5a7af6775bb2483fa2ffcc6e9b9bc41e15ab5b66c1b1cd39805dc9192f2393`
- Run/fence: `buff-npc-secondary-20261007-variant-scope-65-retry-02` /
  `fence:buff-npc-secondary-20261007-variant-scope-65-retry-02`

The retry runner committed the recovery journal
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.retry-02.journal.json`
as `COMMITTED` and wrote exactly `65` insert-only active `immune` rows. The
result is
`reports/authorization/canonical/canonical-buff-npc-secondary-apply.retry-02.result.json`
with before hash
`sha256:8ed1d4e5999c46c04b8f4819f13d4d1c32d7170b0ae41855d0fb026fe0984614`
and after hash
`sha256:dbc0834c1df54ac24404fd1a2b57799b07196970f6b0f67cea69f70232e3a1c2`.

Independent readback
`.local/tmp/buff-npc-secondary-independent-readback-20261007-variant-scope-65-retry-02.json`
(`sha256:5da3832f7592d72c027ad1ea6a9ac8429baacc54945e624af3e41d5f549a4766`)
proves `1643 -> 1708` active rows, `65/65` new keys present, zero missing,
wrong, or duplicate keys, server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, owner `admin/ACTIVE`, and zero
live attempts or reservations. Fence acquisition and release evidence are
`.local/tmp/buff-npc-secondary-fence-20261007-variant-scope-65-retry-02.json`
and `.local/tmp/buff-npc-secondary-fence-release-20261007-variant-scope-65-retry-02.json`;
release readback reports `activeFencesAfter=0`. Redis DB14 returned `PONG`.

## Validation

- Independent exact after-set readback passed: `1708` rows, after hash match,
  `65/65` exact inserts, zero missing/wrong/duplicate.
- Final runtime counts passed: active fences/live attempts/reservations `0/0/0`.
- The retry result and journal are `COMPLETED`/`COMMITTED`; the retry decision
  is consumed once and no permit artifact remains.
- The original proposal-only request remains immutable historical evidence;
  retry-02 is the executed binding for this approved scope.
