# Buff New-ID Source Capture - 2026-10-05

## Scope and Boundary

This is a bounded, authenticated-preflight-gated, read-only source capture for
the five Buff IDs that were missing from the earlier page capture: `395` and
`397-400`. It writes only revision-bound raw page evidence, progress, and
diagnostic artifacts. It does not write landing, maint, relation, projection,
Redis, scheduler state, or business tables.

## Runtime Gate

Preflight artifact:
`.local/tmp/buff-new-id-preflight-20261005T130518Z.json`
(`sha256:f61dafe65320f6638b9d1111359835bb8026c6da02c39c0d1fb3ed7c5a02a961`).
The authenticated response was HTTP `200`; scheduler control was disabled,
live attempts and sweep claims were `0/0`, the reconciler was healthy, and the
V2 epoch and H8 matched the active handoff. The two process matches recorded by
the probe were the probe's own shell and Node command; no Buff writer was
running.

## Capture

The bounded command used `pipelines/fetch/capture-buff-page-evidence.mjs` with
the existing 400-Buff input, explicit IDs `395,397,398,399,400`, a fresh output
directory, and a custom progress path. The monitor-visible progress reached
terminal `completed` before the command exited.

- Capture report: `.local/tmp/buff-new-id-page-capture-20261005T130604Z/capture.json`
  (`sha256:a7fceaa8792b78c2e7a979dae550b435d2700d9b4371fccb65949555eeba8695`).
- Progress: `.local/tmp/buff-new-id-page-capture-20261005T130604Z.progress.json`
  (`sha256:d9c54c3ab299e2ab959e999af9c51f611a8aabc9ce966bff26aec7f17b745688`).
- Four raw revisions cover five targets: Potent Acid, Chlorophyte Saber,
  Catalyst Band, and Zapped (shared by IDs `399` and `400`).
- Capture `databaseWrites=false`; no crawler attempt or scheduler operation was
  created.

## Diagnostic Result

The merged read-only replay is
`.local/tmp/buff-new-id-insert-contract-diagnostic-20261005-v3.json`
(`sha256:8c3f5756785193690912b84d44d0d1433d5f867f0aa471c0e8e8b63c6d43ca9b`).
Across IDs `389-400`, all `12/12` records normalize, all `12/12` source-item
groups are complete, and all `12/12` `inflictingNpcs` groups remain
`section_missing`. No empty infliction group is certified.

The first NPC scope audit is
`.local/tmp/buff-new-id-infliction-scope-audit-20261005-v2.json`
(`sha256:76d66347da91ac77a58ba928b6280f441935c4a6f4b9bb5866d49754a220a2be`).
It contains zero positive infliction facts for IDs `389-400`, but it predates
the final repeated-ID scope replay and is superseded for the current decision.

The current source-complete insert-only diagnostic is
`.local/tmp/buff-new-id-insert-contract-diagnostic-20261005-v4.json`
(`sha256:89a5ad5316b4bfcfb3a20b6844c5d47237c467a40cae4b071cd5e42559b8258a`).
The v3 scope contract now proves 68 `variant-owned-complete-empty` rows and
zero unknown rows, allowing all 12 new Buff infliction groups to be derived as
complete-empty. The baseline fence and independent owner/full-chain/lineage
gates remain active; no insert-only candidate, packet, or apply operation is
authorized.

## Validation

- Capture contract tests: `18/18`.
- Buff parser, NPC infliction, and variant scope-contract tests: `40/40`.
- `node --check` for touched capture modules and `git diff --check`: passed.
- Artifact assertions confirmed terminal progress, `databaseWrites=false`,
  disabled scheduler, `0/0` live attempts/claims, and a healthy reconciler.
- Postflight `.local/tmp/buff-new-id-postflight-20261005T132537Z.json`
  (`sha256:1cb6f535e0dbd4e17f1db6be8bcaeeaa9f6bdb2f50d784d28d9beb11236133fa`)
  returned HTTP `200` with the same disabled/healthy/zero-live state and an
  unchanged epoch/H8.
