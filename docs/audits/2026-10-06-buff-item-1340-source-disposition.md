# Buff Item 1340 Source Disposition

Date: 2026-10-06. Owner: Codex, Buff continuation.

## Scope

This is a read-only disposition for the deferred Item-Buff source fact linking
Buff `395` (`PotentAcid`) to Item source ID `1340`. It creates no packet,
permit, runtime fence, SQL mutation, alias, or payload rewrite. The four
shared-name NPC variant groups remain deferred separately.

## Evidence

The machine-readable proposal is
`reports/authorization/canonical/canonical-buff-item-1340-source-disposition.20261006-v1.proposal.json`.
Its proposal hash is
`sha256:24ab8cbb38b5aab98b47eccf412f92f2e87bc2928a6d878dad78be3d216c67ab`;
the request hash is
`sha256:e05ace819b1fd0ca565df5f9d326def0a108e111798b7d0c744aac151c923995`.

| Boundary | Observed identity |
| --- | --- |
| Buff page candidate | Buff `395`, `PotentAcid`; page source item `FlaskOfVenom` |
| Iteminfo semantic capture | source ID `1340`, `FlaskofVenom`, `Flask of Venom`, `buffType=71`, `buffTime=72000` |
| Maint row | `maint_items.source_id=1340`, `internal_name=FlaskofVenom`, active/non-deleted |
| Relation Buff raw payload | preserves page spelling `FlaskOfVenom` |
| Projection Buff payload | carries Item `1340` as `FlaskofVenom` |
| Secondary relation | no active `(item_source_id=1340, buff_source_id=395)` row; existing rows are `1341` and `1342` |
| Runtime snapshot | MySQL `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, snapshot hash `sha256:06e03262acae01c7d552a4275cbddaa1214e2b95955629a259795878f74084b3` |

The decisive conflict is semantic, not only spelling: Iteminfo says Item
`1340` applies Buff `71`, while the Buff page candidate assigns it to Buff
`395`. The stable source ID therefore does not authorize an Item-Buff row for
`(1340,395)`.

## Owner Decision

The request recommends `defer-semantic-conflict`: preserve the raw page fact,
the canonical Iteminfo/maint identity, and the existing database rows while
opening a source correction review. Accepting the relation despite
`buffType=71` would require a new governed Item-Buff operation and an explicit
Owner justification. Rewriting or aliasing the source payload requires a new
source capture and separate authorization.

The Owner recorded `defer-semantic-conflict` as actor `admin` using
authorization reference `buff-item-1340-review-20261006` and decision identity
`canonical-buff-item-1340-source-disposition-20261006-admin-01`. The immutable
records are:

- `reports/authorization/canonical/canonical-buff-item-1340-source-disposition.20261006-v1.owner-input.json`
- `reports/authorization/canonical/canonical-buff-item-1340-source-disposition.20261006-v1.decision.json`

Both records bind proposal hash
`sha256:24ab8cbb38b5aab98b47eccf412f92f2e87bc2928a6d878dad78be3d216c67ab`
and request hash
`sha256:e05ace819b1fd0ca565df5f9d326def0a108e111798b7d0c744aac151c923995`.
The original request remains `AWAITING_OWNER` and is not overwritten; the
owner records are create-only evidence. The disposition keeps the
`(1340,395)` Item-Buff relation absent, preserves both source spellings and
`buffType=71`, and defers source correction review. No scheduler or unrelated
Buff/NPC operation is affected.

## Validation

- Iteminfo semantic verifier and current source extraction completed with no network requests.
- MySQL `START TRANSACTION READ ONLY` readback completed on port `13306`; transaction rolled back.
- Candidate/request/proposal JSON parsed and hashes recorded above.
- Owner-input and decision JSON parse successfully and bind the exact proposal
  and request hashes above; no packet, permit, fence, or runtime execution was
  generated.
- A post-decision SELECT-only readback confirms Item-Buff relation count `14`
  and no active `(item_source_id=1340,buff_source_id=395)` row. Buff `395`
  retains only Item `1341` and `1342`; the local automation readback reports
  live attempts, reservations, and write fences `0/0/0`.
- Shared NPC variant groups remain the previously approved deferred `20` facts.
