# Devlog: item-image-projection-apply-runtime

## Status

`closed`

## Context

- User goal: Continue automated ingestion through the governed item-image
  projection data closure, asking for authorization at each runtime boundary.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Parent: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`
- Predecessor:
  `docs/devlog/entries/2026-08-04-item-image-projection-apply-implementation.md`
- Operation: `canonical-item-image-projection-apply`

## Direction / Decisions

- The next checkpoint is read-only proposal materialization only. It may read
  the formal local/maint/relation database triplet and write private repository
  evidence, but it performs no database DML and consumes no formal apply permit.
- The proposal Owner artifact must bind exactly: schema/version and kind,
  operation/action, actor, reason, authorization reference, decision identity,
  authorization/expiry timestamps, the formal database triplet, `noWrite: true`,
  and the canonical authorization hash over those preceding fields.
- The canonical apply request hash is deferred until the separately authorized
  database snapshot, proposal, and input bytes exist.
- Owner authorization
  `canonical-item-image-projection-proposal-read-20260804-01` was accepted only
  for the no-write proposal checkpoint. The attempt is retained fail-closed;
  it cannot be widened into an image-sync, lineage repair, or projection apply.
- The initial image-sync packet expired unconsumed. A fresh separate Owner
  decision `canonical-image-sync-legacy-origin-repair-20260805-01` authorized
  only the worktree MinIO start and 331-item legacy-origin repair. Its success
  value is the origin-free
  `/terrapedia-images/items/...` bucket/object path; `localhost:9000` is only
  the legacy selector and `127.0.0.1:19100` is only the current probe origin.

## Scope

- Allowed after explicit Owner authorization: create the private read-only
  Owner artifact, read the exact shared database snapshot in a read-only
  transaction, and materialize snapshot/proposal/input evidence under the
  decision-derived attempt root.
- Still out of scope: formal request/packet/permit/apply, crawler, network,
  MinIO, source flip, L1/L2, scheduler, service lifecycle, push, merge, cleanup.

## Validation

- Predecessor code checkpoint: focused offline matrix `155/155`, 21 syntax
  checks, ownership scans, and `git diff --check` passed.
- Runtime validation: the private Owner artifact is `0600`, its canonical hash
  recomputes to
  `sha256:9d7340dafa008c3a9a132e58e198f28c8e44353d68eadf6bc17cb1e07f1f12ab`,
  and the authorized read-only proposal opened `START TRANSACTION READ ONLY`,
  read the exact relation/projection snapshot, rolled back, and closed.
- The proposal failed closed before writing snapshot/proposal/input evidence:
  `relation cachedUrl must be managed for AbigailsFlower`. A second targeted
  read-only transaction confirmed `6131` active primary relation rows consist
  of `5800` origin-free managed paths and `331` stale
  `http://localhost:9000/terrapedia-images/items/...` URLs. No DML ran.
- Legacy repair implementation is checkpointed at `3c93bcd1` and its exact CLI
  manifest binding at `fd3d92eb`. Fresh focused validation passes `53/53`, both
  changed scripts pass `node --check`, and the scoped diff check is clean.
- The authorized MinIO process is PID `2881550`, serves the configured
  `~/.local/share/terrapedia/minio/data` on `127.0.0.1:19100`, and passes both
  live health and a real candidate-object HEAD (`200`). No other service was
  started.
- Private `0600` request
  `sha256:d710ede350cf7398e351044905b759d4eb31bd1f329570af5b337f25920280dd`
  and packet
  `sha256:8c1795effa4371f122f4aa1c465fa9cce2a4f83228b03705aafefa98facbb3ca`
  re-verified against current code/data/server/policy identity before dispatch.
- Formal dispatch completed at exit `0`. Fresh post-run comparison against the
  exact pre-run Git bytes proves `6131` stable records, exactly `331` changed
  `imageUrl` fields, zero invalid path transformations, and zero changes to any
  other record field. The final standardized hash is
  `sha256:fdb1d2a73c9816dc7ac705e736a4525333f7805253d758fa76eb103643f4756c`.
- Result evidence is `completed` with `331` candidates, `331` changed, zero
  uploads, and zero failures. The decision occurs once in the durable ledger;
  no dispatch permit, process, `.lock`, `.tmp`, or `.part` residue remains.

## Result

- Current state: standardized source normalization is complete; the projection
  remains blocked only by the required refreshed lineage/proposal chain.
- Fresh-lineage materialization is also blocked by a contract gap: the existing
  `canonical-item-image-lineage-apply` catalog and execution manifest hard-code
  the consumed input path. A new immutable bundle and four-layer preview must
  use a distinct no-overwrite path, but the current authorization builder cannot
  bind that path. Do not create unbindable evidence or overwrite historical
  input; make the lineage input/manifest attempt-scoped, with focused tests,
  before requesting a new Owner decision.
- The private proposal authorization artifact exists under attempt
  `869d9b566e98532922667e82b115bb7f3952d0e2a6c769d355589a4ea77faa8b`.
  No snapshot, proposal, input contract, formal request, packet, permit, or
  result was created.
- All `6131` standardized item image URLs now use origin-free
  `/terrapedia-images/items/...` paths. The worktree MinIO remains healthy on
  `127.0.0.1:19100`; backend, crawler, projection, source flip, and scheduler
  were not started or executed.
- The attempt-scoped lineage repair is validated by the focused authorization
  suite. `canonical-item-image-lineage-apply-20260805-admin-03` completed with
  a bundle binding the prior full sync plus the completed 331-row repair overlay,
  and exact `6131/6131/6131/6131` landing/maint/relation/local parity. The fresh
  `ADMIN` read-only projection proposal then stopped before materializing output:
  active relation has 6131 keys, while active `projection_items` has 6146; five
  lineage keys are missing from projection and twenty projection-only keys are
  retained. The proposal's exact-key preflight conflicts with the declared
  image-only, no-INSERT/no-DELETE operation scope.

## Residual Risks

- After source normalization, a new immutable lineage bundle/four-layer apply
  and a fresh projection proposal decision are required; the current attempt
  cannot be reused. The current lineage authorization implementation must first
  support a new attempt-scoped input path rather than its consumed fixed path.
- Projection completion requires an Owner scope choice: update only the 6126
  matching rows and preserve the five missing projection rows, or authorize a
  separate bounded INSERT operation for those five keys. Do not widen the
  image-only projection operation implicitly.
- The approved bounded INSERT investigation stopped before DML. Fresh
  read-only evidence found all five keys have active managed
  `relation_item_images` rows but no active `maint_items` or `relation_items`
  rows; they exist only in local compatibility `items`. A projection INSERT
  would therefore manufacture derived entities without canonical base rows and
  is invalid. Restore the five upstream canonical entities before any
  projection operation; do not copy local compatibility rows into relation.
- The worktree contains unrelated dirty paths that must remain unstaged.
- The now-running worktree MinIO was explicitly authorized to start; stopping
  it or changing any other service remains outside this operation.

## Follow-up

- Owner: Codex. The approved upstream five-entity restoration is now active
  under `docs/superpowers/plans/2026-08-05-item-canonical-base-entity-restoration.md`.
  Its initial contract, read-only proposal boundary, single-transaction
  `maint_items -> relation_items -> projection_items` insert path, and distinct
  manifest registration pass focused offline tests `8/8`. It is not yet
  authorization-ready: bind standardized/proposal/snapshot/read-only Owner bytes
  into the new operation's authorization data bundle and add the authorized CLI
  context/terminal-result validation before consuming its fresh `ADMIN`
  read-only artifact. The Owner artifact is private `0600`, has decision
  `canonical-item-base-entity-restoration-proposal-read-20260805-admin-01`,
  hash `sha256:ac3e7e863cc861e1a8172b5382296f7170234fcc68578025416a35534fbd7d63`,
  and is limited to `read-only-proposal` / `noWrite: true`; it creates no
  packet or permit. Do not reuse failed proposal attempts, copy local
  compatibility rows into relation, or widen image-only projection authority.

## 2026-08-05 Read-Only Restoration Preflight

- The fresh `ADMIN` read-only authorization was used only to open a read-only
  proposal transaction. It rolled back and closed before materializing
  `snapshot.json`, `proposal.json`, or `input.json`; no DML, packet, permit,
  or ledger change occurred.
- The proposed standardized IDs collide with active canonical rows belonging to
  different entities in all three target layers: `5049` is `HeartArrow`, `5051`
  is `ValentineRing`, `5063` is `TurkeyFeather`, `5067` is `FestiveTopHat`, and
  `5074` is `Wiesnbrau`. The requested names are absent, but inserting their
  standardized IDs would violate active `maint_items.source_id`,
  `relation_items.source_id`, and `projection_items.id` ownership.
- This disproves the earlier five-row `INSERT` premise. The current design's
  no-UPDATE/no-DELETE/no-ID-remap boundary cannot close the restoration. The
  Owner must select a new source-identity reconciliation design before any
  proposal/apply attempt is retried.
- Full parity measurement finds `6126/6131` standardized ID/name pairs already
  agree with active maint. The canonical layer has twenty standardized-absent
  legacy rows; five of those (`HeartArrow`, `ValentineRing`, `TurkeyFeather`,
  `FestiveTopHat`, `Wiesnbrau`) occupy the five required source IDs. Read-only
  reference inspection finds only five corresponding `item_projectile_audits`
  rows, with no active loot/shop/recipe/buff consumer reference. The smallest
  viable next scope is therefore an immutable archive plus transactional hard
  deletion of those five stale base/projection/audit rows, followed by five
  standardized inserts. This is a new destructive Owner decision; the prior
  read-only authorization cannot authorize it.

## 2026-08-05 Approved Reconciliation Boundary

- The Owner selected the archival reconciliation design. The only permitted
  destructive scope is the five historical legacy occupants and their five
  `item_projectile_audits` rows: archive first; delete `5` each from
  `maint_items`, `relation_items`, `projection_items`, and
  `item_projectile_audits`; then insert `5` standardized rows each into
  maint/relation/projection. The other fifteen legacy-only records remain out
  of scope.
- The implementation contract now requires exact legacy ID/name pairs, the
  `legacy` version, `旧版:` source-page provenance, and
  `raw_json.legacyNpcShopItem = true`; it rejects protected downstream
  references before permit consumption. Focused contract, proposal, apply, and
  transaction tests pass `7/7`; syntax checks and `git diff --check` pass.
- Private `0600` ADMIN authorization is
  `canonical-item-base-entity-restoration-reconcile-20260805-admin-01`, at
  `reports/authorization/canonical/item-canonical-base-entity-restoration/f57c48e32994f8d37f3c69de2b4b39647ba5772c1fc849b0aa9b7b9ac7f4f5ac/reconcile.owner-input.json`,
  hash `sha256:6269ff875f85434c77ff41ccdb37b5de7240c3a5ad87cb63cf532d4beb8cedf1`.
  It permits only the exact archive/delete/reconcile operation. It does not
  authorize DML by itself: the new read-only proposal must freeze a current
  snapshot, then a separately bound manifest, packet, and one-time permit are
  required before dispatch.

## 2026-08-05 Reconciliation Runtime Result

- The upstream reconciliation completed once under decision
  `canonical-item-base-entity-restoration-reconcile-20260805-admin-04`, packet
  `sha256:12473c6a6cf78be15324d0ffdbbd99d9b6a8e8b911dabe94e1273a694b700a1b`,
  in immutable attempt
  `reports/authorization/canonical/item-canonical-base-entity-restoration/b8cd8be7a0c388dc8063bc92f6d5611f252fcab296e013e05730af13abd0e8e2/`.
  Its private `archive.json` and `result.json` prove exactly `5/5/5/5` legacy
  and audit deletes, followed by `5/5/5` standardized maint/relation/projection
  inserts in one committed transaction.
- Independent readback confirms the five source IDs now resolve to
  `RoninShirt`, `TimelessTravelerHood`, `TVHeadPants`, `AntlionEggs`, and
  `BoneWhip` in all three canonical layers. Their audit rows are zero; full
  source/name agreement is `6131/6131`; the retained `6146` active maint and
  projection rows still include the fifteen intentionally untouched legacy-only
  records.
- Attempts `canonical-item-base-entity-restoration-reconcile-20260805-admin-02`
  and `...-admin-03` failed before commit, each rollback was verified, and both
  decisions are consumed. They are immutable historical evidence and cannot be
  reused. No temporary dispatch permit remains.
- This clears the base-entity prerequisite only. The projection operation still
  needs a fresh, independent `ADMIN` read-only proposal followed by a separate
  `ADMIN` apply decision. Its scope remains exactly existing
  `projection_items.image` rows for the 6131 lineage keys: no INSERT, DELETE,
  local write, crawler, network, MinIO, source flip, scheduler, or lifecycle
  action is authorized.

## 2026-08-05 Projection Contract Repair

- Fresh ADMIN decision
  `canonical-item-image-projection-proposal-read-20260805-admin-03` was used
  once for a no-write proposal attempt under
  `reports/authorization/canonical/item-image-projection-apply/06b62bde7777842be38e028107c34eb2995e73a27c024ca79e78af1bd1b37757/`.
  It failed closed before materializing evidence with
  `projection relationRecordKey must match relation recordKey for
  AaronsBreastplate`; no DML, packet, permit, or ledger apply occurred, and
  this attempt is consumed historical evidence and cannot be reused.
- Root cause is a contract-model error, not an ID collision: projection
  `relation_record_key` references `relation_items.record_key`, while
  `relation_item_images.record_key` identifies the independent image evidence
  row. Read-only SQL evidence shows `6131/6131` projection-to-base matches and
  `0/6131` projection-to-image matches. The proposal contract now joins image
  evidence to projection rows by exact `internalName`, retains all projection
  identity uniqueness checks, and no longer compares those two unrelated
  record-key namespaces.
- RED/GREEN focused validation for the contract, proposal, DB adapter, and apply
  path is `26/26`. No database or service runtime was changed by the repair.
- ADMIN-04 then exposed a second contract defect while materializing its
  snapshot: the proposal attempted to sort a frozen three-prefix policy array
  in place. Its attempt
  `reports/authorization/canonical/item-image-projection-apply/001e971e2a02f220abe48ba2ee2da20b68e7804c18e7035a55cc7567d64b84dd/` contains only
  private owner and snapshot evidence; no proposal/input/permit/DML exists, and
  that attempt is consumed historical evidence. The immutable-array repair is
  covered by a regression test and the focused validation is now `27/27`.
- ADMIN-05 then completed the fresh no-write proposal, exact input/manifest,
  independent ADMIN packet, and one-time dispatch in attempt
  `reports/authorization/canonical/item-image-projection-apply/fab58a6c3ea633a959f7e1859dd4d03311e465429fdd349e933e0442dcc6ff4f/`.
  Result is `completed/apply=true` with `targetRowCount=6131` and
  `changedRowCount=6126`; packet hash is
  `sha256:fae02e7a954bfc5176792dcd96b933854c886bf2a7f2644e44e492198a410010`.
- The image lineage audit now reports items `contractReady=true`: maint,
  relation, and projection image rows are each `6131`, all governance-key
  projection images are managed, and the retained active projection total is
  `6146`. Direct read-only DB comparison finds `0` governed image mismatches and
  `0` missing governed projection rows. Cross-DB quick audit is `10/10 pass`
  with zero warnings or blockers.
- At the time of the projection closeout, the domain items `imageReadiness`
  panel was still blocked by the bounded legacy-origin repair's `331` versus
  `5800` accounting shape. That independent gate was repaired and revalidated
  below. Projection apply itself is closed; no INSERT/DELETE, local write,
  crawler, network, MinIO, source flip, scheduler, or lifecycle action ran.

## 2026-08-05 Image Readiness Gate Repair

- The image-sync report is a bounded legacy-origin repair: `331` candidates
  were normalized, while `5800` records were already managed. The readiness
  semantic gate now accepts this shape only when `candidates + alreadyManaged`
  equals `total`, `normalizedKeys.length` equals `candidates`, and the run has
  zero uploads, reuse, or unexplained changes. Regular full-run accounting is
  unchanged.
- RED/GREEN coverage is included in
  `scripts/data/audit/domain-readiness-audit.test.mjs`; the focused cross-module
  validation is `111/111`, with `node --check` and `git diff --check` clean.
- Regenerated `reports/domain/items/image-readiness-2026-08-05.json` is
  `status=pass`, with `0` blockers and `0` warnings. Item-image projection and
  lineage closure are therefore no longer the global gate blocker; shimmer
  remains the only warning before source-flip/L1/L2/scheduler work.

## Commits

Final closeout on 2026-08-06: image lineage remains
`6131/6131/6131/6131`, the governed projection apply targeted 6,131 rows and
changed 6,126 existing image values, and the item image gate is pass. The later
NPC T2/source-contract closeout and full repository gate introduce no image
write or lineage regression; domain acceptance is `45/0/0` and cross-DB quick
is `10/10 pass`. No INSERT/DELETE, crawler, network, MinIO write, scheduler
daemon, release, or deployment is authorized by this closure. No image-specific
follow-up remains. commit SHA pending in final response.

- Legacy-origin implementation: `3c93bcd1`.
- Manifest CLI binding: `fd3d92eb`.
- Standardized-data checkpoint: `0c8ef7c8`.
