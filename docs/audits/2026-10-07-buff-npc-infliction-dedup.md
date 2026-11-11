# Buff NPC Infliction Dedup Request

Date: 2026-10-07. Status: COMPLETED.

This request covers only five active duplicate pairs in
terria_v1_relation.npc_buff_relations where relation_type='inflicts'. The
keeper is selected by the current maint_buffs.raw_json.inflictingNpcs source
order and the relation generator's existing npc_buff_relation record-key
contract, not by relation ID ordering.

| NPC | Buff | Retain | Soft-retire |
| --- | --- | ---: | ---: |
| QueenBee | Poisoned | 904 | 1219 |
| DukeFishron | Bleeding | 444 | 393 |
| DukeFishron | Rabies | 471 | 627 |
| Deerclops | Slow | 773 | 232 |
| Deerclops | Frozen | 575 | 457 |

The revision-bound Wiki source facts come from
.local/tmp/buff-npc-infliction-verified-20261003-v6.json, file hash
sha256:0a166d9006780720b85c93a8447e400a774bcaa57cf80b8125d49406a91a4cbc,
manifest hash
sha256:70a243c593efd8429de230bc8fe394a3a39aafc5ae858656b787f7f9dee6676b.
That capture is revision-bound evidence, not a new Wiki fetch; keeper selection
uses the fresh 2026-10-07 maint snapshot below.
The proposal binds the five active maint source rows with snapshot hash
sha256:fcecb7572806a574f6c8857f26f500018f3c9bce2e1c125415d4690f1f997655.
For QueenBee/Poisoned, the first source occurrence produces the retained key
for row 904; the second source occurrence is row 1219. The other four
retained rows match their current source-order keys. During execution, the
runner locks and compares those maint rows and the full relation baseline
before consuming the dispatch permit. Source or relation drift rolls back
before permit consumption and mutation.

## Superseded Request

Task 19 v1 is superseded and must not be authorized. Its request
canonical-buff-npc-infliction-dedup.task19-v1.request.json remains
AWAITING_OWNER for historical integrity, but its proposal chose keepers by
lower ID and would retire 444, 575, 627, 773, and 1219. No packet, permit,
fence, journal, or database write was created for v1. Its request hash is
sha256:310331eccc7e5707a01ba3159002a6044953c5573ebb06791e1c2927c1535842;
its proposal file hash is
sha256:05b964c09ef08fc00f19bf9017f90db73774b46dea5446075eae95e564912c1a.

## Current Request

The v2 proposal is
reports/authorization/canonical/canonical-buff-npc-infliction-dedup.task19-v2.proposal.json.
Its file SHA-256 is
sha256:28fb8fb48e643169e71747f8287c6ad81b7c4e96ff97db11936acddf0ffbe15e;
its internal proposal hash is
sha256:9f94653e7d14d435840cee4caa299be3909dc688503387cec4aa1d01cb4fad34;
its scope hash is
sha256:5aa42ce41393d63de4ddb5f8f33bd367da3cd277fbc84eb34bae88e37a13398b.
The active relation baseline is 1708 rows and the exact proposed after-set is
1703; only status and deleted change for the five retirement rows.

The owner request is
reports/authorization/canonical/canonical-buff-npc-infliction-dedup.task19-v2.request.json,
with request hash
sha256:3e5be3b7ee01ba3b2238686e1139f2f1aaddfd3e0acec9254037e99fcf547576.
It was generated at 2026-10-07T04:01:54.892Z, expires at
2026-10-08T04:01:54.892Z, and has no missing technical fields. Owner fields
remain unfilled pending approval. The bound execution-manifest hash is
sha256:0398d70bbc14723fb1f97e08f2ec5cc0cc23d8cd6b59f85cdf5113335b17d005.

Fresh START TRANSACTION READ ONLY snapshots verified server
b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306, the five current maint rows, and
the active relation baseline; both transactions were rolled back. Proposal
flags remain executable=false, applyAllowed=false, and databaseWrites=false.
No packet, permit, fence acquisition, journal, or database write has occurred
for v2.

## Validation

node --test pipelines/relation/buff-npc-infliction-dedup.test.mjs pipelines/relation/run-buff-npc-infliction-dedup.test.mjs pipelines/automation/buff-npc-infliction-dedup-registration.test.mjs passes
17/17. The broader Buff fetch/relation/automation regression passes 421/421.
Changed JavaScript modules pass node --check, and git diff --check passes.

The next step requires approval of the exact v2 request and proposal hashes.
Then the runner must repeat server, policy, source, relation, and fence
preflight before packet/permit creation or any apply.

## Execution Addendum

Owner approval for the original v2 request and proposal hashes was received in
this session. The first dispatch consumed decision
`canonical-buff-npc-infliction-dedup-20261007-admin-01` before discovering that
the runtime fence was not held; it performed no business mutation. Retry-02
held the fence and reached the transaction, but rolled back because MySQL's
`updated_at ON UPDATE CURRENT_TIMESTAMP` drifted from the exact after-set. An
independent read confirmed all ten target rows were unchanged after that
rollback.

The executor and regression were repaired with `updated_at = updated_at` in
the fixed UPDATE statement. The proposal remains byte-identical to the
approved v2 file (SHA-256
`sha256:28fb8fb48e643169e71747f8287c6ad81b7c4e96ff97db11936acddf0ffbe15e`).
Because the execution code bundle changed, retry-03 uses a new manifest and
request bound to the same proposal and the original expiry window. The retry
request hash is `sha256:3f1bbdddd4523116af7d2ceef5b5d7968ed9b1b99a9c53cfb83703b972fd3e2d`;
the manifest file hash is
`sha256:81d2bf879eaa69c16b51d910f2bbcdeb73dd47a9d505ab7825a0c4057d9bbb0d`.

Fresh preflight revalidated server UUID
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, policy hash
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
source artifact hash `sha256:0a166d9006780720b85c93a8447e400a774bcaa57cf80b8125d49406a91a4cbc`,
maint source hash `sha256:fcecb7572806a574f6c8857f26f500018f3c9bce2e1c125415d4690f1f997655`,
and the active relation baseline `1708` /
`sha256:f0b7a7721639b64f71a3ff5a7d096f174d52142ce4ed40dcd017477e04f9172f`.

Retry-03 executed with decision
`canonical-buff-npc-infliction-dedup-20261007-admin-03` and packet hash
`sha256:ab756641db304f2cc4354acc8f9a5310f8f3cacae888ac6847f1cff1fbb5747f`.
The committed result reports five retirements and after-set hash
`sha256:750a5bc878f128f0d342a448002572d5dc38986c8dcaf644ea8bc876c8f5abf9`.
The journal is `COMMITTED`; the result file hash is
`sha256:6c034da81b3b8af9e6ae2a2643db273dfa3ceb2b2d3830a40b9e8d531f010fc2`.
The independent readback file hash is
`sha256:56d3161d0674d7e5b48e44d37b280d6159a0644fb0711c0f699433c5e8155b7e`.

Independent SQL readback confirmed `1703` active rows, retained IDs
`904/444/471/773/575` as `status=1, deleted=0`, retired IDs
`1219/393/627/232/457` as `status=0, deleted=1`, exact after-set equality,
and unchanged `updated_at` values for all ten target rows. The exact runtime
fence was released after readback; active fences for this scope are `0`.

Validation after the repair: focused relation/runner/registration tests pass
`17/17`, the real rollback reproduction preserved `updated_at`, both changed
modules pass `node --check`, and `git diff --check` passes. No v1 packet or
decision was authorized. Item `1340` and unrelated Buff/NPC work remain out of
scope.
