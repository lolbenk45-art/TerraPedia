# Buff NPC Secondary Apply Audit - 2026-10-06

## Scope

The approved operation inserted only the `259` stable-NPC-identity `immune`
rows derived for Buff IDs `389-394` and `396`. The `114`
`display-only-npc-source-id-missing` facts remain deferred. The operation is
insert-only and does not update or delete existing relation rows.

## Authorization And Artifacts

- Operation: `canonical-buff-npc-secondary-apply`
- Actor: `admin`
- Decision identity: `canonical-buff-npc-secondary-apply-20261006-admin-03`
- Packet hash: `sha256:88db4061d7fac48d68d0e8f27339503ef7f8208f87054f75bae964f73b845bd1`
- Run ID: `buff-npc-secondary-20261006-admin-03`
- Candidate v3: `.local/tmp/buff-npc-secondary-candidate-20261006-v3.json`
- Candidate v3 hash: `sha256:7102c4a604f89f5e0fdb9c5c1539da893dafce41f30f1f18cac00695955fe835`
- Proposal hash: `sha256:df4105412e20e875ad1378439bcf1ecb53d0552adef15b7d51c47d8989389df7`
- Scope hash: `sha256:332d2d5c2261b1a2aa4d666bafa4968ce9f8545f7ff5a09f9632fb857f1d1169`
- Result: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.20261006-admin-03.result.json`
- Journal: `reports/authorization/canonical/canonical-buff-npc-secondary-apply.20261006-admin-03.journal.json`

## Execution

The first attempt failed closed before mutation because an ISO timestamp was
passed to a MySQL `DATETIME` column. The transaction rolled back, the journal
was `ROLLED_BACK`, the baseline remained `1290`, and its decision identity was
retired. A second attempt inserted inside the transaction but failed the
after-set ordering assertion; it also rolled back with no row change and its
decision identity was retired. Both fences were explicitly released.

The v3 candidate normalizes source revision timestamps to the target
`DATETIME` representation and binds the current live baseline. The third run
committed with journal state `COMMITTED`.

## Independent Readback

On MySQL server `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`:

- `npc_buff_relations` active rows: `1290 -> 1549`
- New rows: `259`
- New relation type: `immune` only
- New Buff IDs: `389-394` and `396`, `37` rows each
- Deletes: `0`
- Duplicate record keys: `0`
- Database after-set hash: `sha256:a00f5d5c9c4c7c165e1fc2b2e4e997386becf2ae0c9567a2ed1bc096c77fbe55`
- Proposal/result after-set hash: `sha256:a00f5d5c9c4c7c165e1fc2b2e4e997386becf2ae0c9567a2ed1bc096c77fbe55`
- Active write fences after release: `0`

The deferred `114` facts were not promoted and remain evidence-only.

## Validation

- Focused governed regression: `123/123` passed
- Node syntax checks: passed
- `git diff --check`: passed
- Independent SQL after-set readback: passed
