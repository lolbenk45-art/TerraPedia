# Buff New-ID Insert-Only Candidate Audit

Date: 2026-10-05

## Scope

This audit covers the bounded canonical candidate for Buff source IDs `389-400`.
It is derived from the revision-bound 400-Buff source input and the current
loopback MySQL snapshot. It does not authorize landing, maint, relation,
projection, Redis, scheduler, or crawler writes.

## Evidence

- Candidate artifact: `.local/tmp/buff-insert-only-candidate-20261005-v1.json`
- Candidate SHA-256: `sha256:203ea633d0a845f5b424b1b89cbb13fd87a9d366024dc7ac0ca36ee9e9decf45`
- Contract SHA-256: `sha256:71cd963be35b18412b5c1258b7eec38b58bede6f1c1382e735c13af10ffdc6dd`
- Source payload SHA-256: `sha256:80fa86969d3eb97d91d65333ca976f386e11e39a8cc2238bde395b54ad466e9b`
- Source input SHA-256: `sha256:76492e8414f58a66a23751a24e1ebd99079ee513513c14f49a9464b83f9ad751`
- Scope contract SHA-256: `sha256:98b396fc62ec039e5c3e1bbfa7280d286356efb13bfc80bf50c8df4c38a735c2`

The authenticated preflight immediately before the read-only snapshot was
HTTP `200`, scheduler `enabled=false`, live attempts/claims `0/0`, and
reconciler `healthy`; evidence is
`.local/tmp/buff-insert-candidate-preflight-20261005T-latest.json`. Final
postflight evidence is `.local/tmp/buff-insert-candidate-postflight-20261005T150310Z.json`;
its one process-scan match is the probe shell/Node command itself, not a Buff
writer.

## Candidate Shape

The candidate is `status=blocked`, `executable=false`, `applyAllowed=false`,
and `databaseWrites=false`. It binds a deferred insert-only landing plan and a
deferred maint plan for exactly 12 new Buffs. The relation/projection snapshot
preserves all current rows and proposes 12 relation Buff inserts and 12
projection Buff inserts. It proposes six item-Buff secondary inserts whose
facts have exact name identity; no relation image rows or NPC-Buff secondary
rows are inserted.

Current read-only baseline counts were maint Buff `388`, relation Buff `388`,
projection Buff `388`, NPC-Buff relation `1290`, item-Buff relation `0`, and
relation Buff images `388`. The candidate preserves `2454` downstream rows.

## Blocking Findings

Nine source-item secondary facts are not publication-ready:

- Buffs `389`, `390`, `393`, and `394` reference Iteminfo IDs `6148`, `6149`,
  `6161`, and `6164`, which have no current `maint_items` identity.
- Buffs `399` and `400` retain page-only `LightningStrike` and `ArcSurge`
  facts without stable item IDs.
- Buff `395` has a current-item identity spelling drift for source item ID
  `1340` (`FlaskOfVenom` source versus `FlaskofVenom` maint identity).
- No stable NPC identities were available for the new Buff immunity lists, so
  the candidate emits zero NPC-Buff secondary inserts. The zero inflicting-NPC
  result is source-complete and does not infer any positive fact.

The missing-baseline fence for `389-400`, deferred landing/maint ID binding,
independent owner decision, and full-chain authorization remain active. No
packet, permit, scheduler control, database, Redis, landing, maint, relation,
or projection write was performed.

## Validation

- `node --check .local/tmp/build-buff-insert-only-candidate-20261005-v1.mjs`
- `node --test pipelines/relation/buff-insert-only-candidate.test.mjs` (`3/3`)
- Read-only candidate driver completed and hash was recomputed from the final artifact.
- Final read-only row-count check remained maint Buff `388`, relation Buff
  `388`, projection Buff `388`, NPC-Buff `1290`, and item-Buff `0`.

The next safe action is a separately authorized item/NPC identity resolution
review or a new owner decision that explicitly accepts the blocked secondary
scope. This artifact must not be converted into an executable packet as-is.
