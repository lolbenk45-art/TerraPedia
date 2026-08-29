# Two-Item Wiki Image Evidence Refresh

## Status

`closed`

## Goal And Scope

The owner explicitly authorized a bounded Wiki evidence refresh for exactly two
quarantined Item identities: `FallenStar` (`75`, `Fallen Star`) and
`SeveredHandBanner` (`3398`, `Severed Hand Banner`). Success means collecting
their own Wiki page source through the maintained item-page crawler and
classifying whether each page supplies verifiable image provenance.

Out of scope: all other item pages, image-byte download or upload, MinIO
transfer, database writes, provenance/projection apply, permit or packet
creation, crawler source changes, staging, commit, cleanup, and discard.

## Authorization And Contract

- Owner authorization: direct user instruction in this session on 2026-08-21,
  limited to these two Wiki pages.
- Crawler entrypoint: `pipelines/fetch/fetch-wiki-item-pages.mjs`.
- Action ID: `two-item-wiki-image-evidence-20260821-042354`.
- Progress paths: a task-specific generated progress file mirrored by the
  maintained crawler to `data/generated/wiki-sync-progress.latest.json`.
- Output family: two raw Item-page JSON files and one fetch report. The crawler
  does not write a database or fetch image bytes.
- Scope artifact:
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/042354/two-item-wiki-evidence-scope.json`
  (`sha256:b386914e31c70935678a58655caa655c188070276aa4d475e94fbdb4d21a6ecd`).
  It was generated from a fresh `START TRANSACTION READ ONLY` snapshot and
  binds two local, two maint, two relation, and two projection rows. Its hash
  was recomputed successfully before the first external request.

## Baseline

- Parent freeze:
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/034800/fresh-db-freeze.json`
  (`sha256:a86cfd103710a9933472ebade26c3e832584dc4dcf1526312351aff76ae92bb8`).
- Existing raw target files: absent at task start.
- Active crawler writers: none observed before execution.
- Entry-point test: `node --test pipelines/fetch/fetch-wiki-item-pages.test.mjs`
  passed `16/16` before execution.
- The task-specific raw target files were still absent when the scope was
  verified. The canonical progress file belongs to a completed historical
  `npc-coverage-audit` action; no active crawler writer may be observed before
  this action starts.

## Next Action

The parent task has now received explicit user authorization to repair these
two identities. A fresh read-only database probe was attempted before mutation;
it exposed duplicate historical `local.item_images` rows for both targets, so
the canonical local image row must be selected by the existing lineage contract
before any write. The correct `Severed Hand Banner` bytes were downloaded and
verified locally (`PNG`, `12x28`, sha256
`e76db18a490951c159c826f66b3abd5579138e69e6c039bedfbf5983abd38860`).
Upload and SQL mutation remain blocked because the running backend at
`127.0.0.1:18091` rejects the tested admin credentials for the upload helper
and the repository has no local config/credential file. No object or database
write was performed.

## Result

- The fresh exact scope artifact is
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/042354/two-item-wiki-evidence-scope.json`
  (`sha256:b386914e31c70935678a58655caa655c188070276aa4d475e94fbdb4d21a6ecd`).
  It binds the two identities and their two local, maint, relation, and
  projection rows before the external request.
- `FallenStar` returned its own `Fallen Star` page (page ID `12496`). Its
  infobox item sprite is `22x24` at
  `https://terraria.wiki.gg/images/Fallen_Star.gif?9dd2b1`; the stored
  `Fallen Star.png` provenance title is therefore stale or incorrect.
- `SeveredHandBanner` redirected to `Banners (enemy)` (page ID `14563`). The
  exact row has the `Severed_Hand_Banner` anchor, displayed name, and Item ID
  `3398`; its `12x28` item sprite is
  `https://terraria.wiki.gg/images/Severed_Hand_Banner.png?3d491b`. The stored
  `32px-First Fractal.png` provenance title is a wrong-entity association.
- Durable classification:
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/042354/two-item-wiki-evidence-classification.json`.
  It is `verified_source_urls_apply_unauthorized`: no source image bytes were
  downloaded, no cache object was transferred, and no database row changed.

## Validation And Closeout

- `node --test pipelines/fetch/fetch-wiki-item-pages.test.mjs` passed `16/16`
  before execution.
- The maintained fetcher completed `2/2`, `0` failures; both the task-specific
  and canonical monitor progress files record terminal `completed`, `2/2`.
- The source scope hash was recomputed from the stored canonical scope before
  the external requests and matched exactly.
- The crawler's optional Redis heartbeat tried `127.0.0.1:6379`, while the
  live local Redis listener is `6380`; it emitted a non-blocking warning. The
  atomic JSON progress contract remained monitor-visible and completed.
- No commit is requested or created. The raw source and runtime reports remain
  generated evidence; source/provenance mutation is explicitly deferred to the
  parent task under a new authorization.

## Mutation Closeout (2026-08-21)

The owner-authorized mutation-only operation
`canonical-two-item-image-quarantine-repair` completed through
`run-authorized-canonical-operation.mjs`.

- Scope hash: `sha256:878a2b3b825a63c618039a531c02e7c363000fa26b6dc6fa9afbf3d294c1c29c`.
- Decision identity: `canonical-two-item-image-quarantine-repair-20260821-admin-retry-05`.
- Packet hash: `sha256:de356e4b81dd6a38481583fe11920fcb44ee65f2ba02962faf5349dfd21ebea3`.
- Result: `reports/authorization/canonical/canonical-two-item-image-quarantine-repair.result.json`.
- Affected: maint `2`, relation `2`, local `2`, projection `1`, local item `1`.
- `FallenStar` provenance now points to `Fallen Star.gif` / `Fallen Star` and
  retains its existing cached PNG.
- `SeveredHandBanner` provenance now points to `Severed Hand Banner.png` /
  `Banners (enemy)` and all three caches, projection image, and local item image
  use the managed PNG URL. The uploaded/read-back object is PNG `12x28`,
  SHA-256 `e76db18a490951c159c826f66b3abd5579138e69e6c039bedfbf5983abd38860`.
- Four earlier attempts failed before commit and rolled back; no partial state
  remains. The final database readback and `/api/items/75`, `/api/items/3398`
  responses agree.
