# Supplementary Domain Source-Probe Design

**Date:** 2026-08-15
**Status:** pending written-spec review
**Scope:** Changed-only source detection and consumption acknowledgement for
`audio`, `bosses`, and `shimmer`.

## Goal

Restore the three supplementary L1 preview actions to automatic scheduling only
when their complete upstream source snapshot has changed. A completed action
acknowledges that snapshot only when it processed a stable source generation.
This prevents repeated full refreshes for unchanged data and prevents a source
that changes during a refresh from being marked as consumed.

## Boundaries

- The scheduler remains `L1/ACTIVE` and creates preview/source work only.
- No automatic database apply, L2 action, Redis reset, Boss loot, or NPC loot
  automation is introduced.
- Existing V2 attempt identity, lease, active-attempt deduplication, and the
  three-attempt resume policy remain authoritative.
- Probes make bounded Wiki API requests only. They never download audio bytes,
  render a Boss-page corpus, run a Shimmer generation, or access the database.
- A probe error is fail-closed: it reports `error`, `changed=false`, and creates
  no action.

## Source Snapshot Contract

Create one reusable Node module for supplementary source probes. Each probe
returns a canonical, sorted snapshot with `sourceKey`, `locator`,
`entityFamily`, `sourceKind`, provider identity, and a SHA-256
`contentHash`. The hash is over the complete normalized snapshot, not local
output bytes or a clock value.

The shared source manifest at `DEFAULT_WIKI_SOURCE_MANIFEST_PATH` is the only
consumption authority. A probe is changed when its `contentHash` differs from
the manifest record for its exact `sourceKey` and locator. Worktree-local
manifest paths are rejected.

| Domain | Source key | Snapshot inputs | Probe work excluded |
| --- | --- | --- | --- |
| Audio | `wiki.audio_assets.catalog` | Complete governed Audio catalog: allowed-audio file identity, MIME type, size, SHA-1/revision timestamp for the four existing `Music`, `NPC_Hit`, `NPC_Killed`, and `Item_` prefixes; plus the Chinese Music-page revision used for BGM display names | Binary media download and asset metadata generation |
| Bosses | `wiki.bosses.catalog` | `Bosses` overview section identity; discovered Boss-page revisions and Chinese langlink targets; Chinese intro-page revisions for those targets | Boss HTML parsing, per-record extraction, and image/network media fetches |
| Shimmer | `wiki.shimmer.page_and_langlinks` | Chinese `微光` source-page revision/content identity and the revision/langlink identity of every candidate title derived from that source page | Shimmer extraction, generation publication, preview bundle creation, and DB work |

All paginated or batched requests use fixed limits. The Audio source is complete
only when all four prefixes reach pagination exhaustion with no more than the
existing L1 maximum of `600` allowed audio files. Probe and action share one
discovery helper, so they consume the same accepted catalog. The helper stops
and fails before download when it sees audio file 601, an unfinished page
sequence, or its `100`-page-per-prefix guard. It excludes non-audio rows using
the action's existing MIME allowlist. Boss and Shimmer retain their declared
bounded list/batch limits. Every probe fails rather than silently truncating a
fingerprint.

## Detection And Acknowledgement Flow

1. `check-source-updates.mjs` calls the domain probe and compares its
   `contentHash` with the shared manifest. It emits the three supplementary
   source records alongside the existing five automatic domains.
2. The V2 sweep considers an action only when the probe reports `changed=true`.
   A probe failure remains non-dispatching.
3. The supplementary preview wrapper captures a probe snapshot before source
   work. It executes the existing L1 preview action without changing its
   authorization or progress contract.
4. After a terminal successful source/preview result, the wrapper captures the
   same probe again. It advances the shared manifest with the original probe
   record only when the two hashes are identical and the frozen preview output
   is readable.
5. If the hashes differ, the preview remains valid evidence for its own
   captured source, but it is explicitly `sourceAcknowledged=false` and does
   not advance the manifest. The next monitor tick observes the changed hash
   and schedules one new attempt through the existing V2 deduplication fences.
6. Failed, cancelled, timed-out, incomplete, or probe-error actions never
   acknowledge a source. Repeating an acknowledgement for the same stable
   snapshot is idempotent.

The pre/post comparison avoids the unsafe alternative of treating a later
probe as proof that an earlier full refresh processed that later source.

## Integration

`check-source-updates.mjs` owns source observation. The new probe module is
the shared implementation for the monitor and the supplementary preview
wrapper, so the two paths serialize the same source identity. The manifest
helper gains an explicit probe-record acknowledgement path that preserves the
probe `contentHash`; it must not derive a replacement hash from generated
output.

The Audio fetch entrypoint must delegate its full-corpus discovery to the same
helper and pass the explicit `--max-api-pages-per-prefix=100` action argument.
It cannot write a partial manifest or begin a download when pagination remains
or the `600`-file boundary is exceeded. This replaces the historical one-page
per-prefix behavior, whose generated manifests proved `continuationComplete`
was false for all four prefixes.

After focused tests prove the contracts, `AUTO_DISPATCH_DOMAINS` returns to all
eight source-probed domains: `items`, `npcs`, `projectiles`, `armor_sets`,
`buffs`, `audio`, `bosses`, and `shimmer`. `boss_loot` remains absent.

## Verification Contract

Tests must demonstrate:

1. Each probe is deterministic for reordered API responses and changes when a
   covered upstream field changes.
2. Audio tests prove no binary download request is issued; Boss and Shimmer
   tests prove no full crawler/extraction entrypoint is called.
3. Audio tests prove a complete catalog at or below 600 is shared verbatim by
   the probe and action, while audio file 601, unfinished pagination, and
   non-audio rows respectively fail before download, fail before download, and
   do not change the fingerprint.
4. The source monitor reads the shared manifest and reports unchanged after a
   stable successful acknowledgement for each new source key.
5. A failed preview, unreadable output, failed second probe, or changed
   pre/post fingerprint leaves the manifest bytes unchanged.
6. A stable completed preview writes exactly its declared source record and
   becomes unchanged on the following monitor pass.
7. The registry enables exactly the eight source-probed domains and excludes
   `boss_loot`.
8. Existing five-domain resume and no-duplicate V2 tests continue to pass.

Focused validation includes the new Node probe/manifest/preview tests, the
existing source-monitor suite, the supplementary preview suite, the action
registry test, and the focused V2 monitor suite. Runtime acceptance is a
post-restart, authenticated, read-only scheduler observation; it must not
manually start a crawl or apply database data.

## Rollout

1. Land the contract and tests while the current backend process remains
   untouched.
2. Restart only after focused validation and review are complete, following the
   V2 cutover runbook.
3. Observe the next scheduled check with authenticated read-only evidence.
4. Confirm unchanged fingerprints produce no new action and leave the three
   domains fail-closed again if the observation cannot be obtained.
