# Item Image Source Verification — retry-04 readiness review

Read-only. This artifact requests nothing and reaches no network. It exists so
the Owner can authorize an exact request under Task 3 Step 6 of
`docs/superpowers/plans/2026-07-30-item-image-source-closure.md`.

## Why a fourth round is needed

Round retry-03 completed `877 = 868 verified + 9 ambiguous + 0 unresolved +
0 failed`. The 9 remainders were fail-closed because more than one candidate file
survived identity filtering, and no preference rule existed. `D-2026-08-01-01`
settles that rule set and it is now implemented and tested.

The rule cannot be applied to the frozen retry-03 report offline: an `ambiguous`
record carries only `candidateFileTitles`, no `imageinfo`. The URL, size and MIME
of the winning file — and of each retained secondary format — exist nowhere in
the repository. One more bounded round over exactly these 9 identities is the
only way to obtain them.

## Frozen input

| Field | Value |
| --- | --- |
| Path | `reports/authorization/canonical/canonical-item-image-source-verification.retry-04.input.json` |
| SHA-256 | `sha256:df5eac15c156727929c0b4a0cbde9fd7808fbbf926c4c1f3890ddfea72244c75` |
| Mode | `0600` |
| Identity count | 9 |
| Request cap | 9 |
| Batch size | 8 |
| Identity set SHA-256 | `sha256:7a4f8d4d7aa5727641dbd52f2aa92dc583f2a675d71ce910eb12b24b19a0aec1` |
| Raw evidence files | 9 |
| Derived from | `reports/audit/item-image-source-promotion-review-2026-07-31.json` (ambiguous 9, unresolved 0, duplicate 0, conflict 0) |
| Candidate report | `reports/audit/item-image-source-candidates-2026-07-30-v2.json` |

The cap equals the identity count, so one identity can cause at most one real
HTTP attempt under the existing single-attempt Wiki request profile. Nine
requests total, against four distinct host pages.

## The exact 9 identities

| itemId | internalName | itemName | pageId | file title probes |
| --- | --- | --- | --- | --- |
| 71 | CopperCoin | Copper Coin | 11456 | `Copper Coin.gif`, `Copper Coin.png` |
| 72 | SilverCoin | Silver Coin | 11456 | `Silver Coin.gif`, `Silver Coin.png` |
| 73 | GoldCoin | Gold Coin | 11456 | `Gold Coin.gif`, `Gold Coin.png` |
| 74 | PlatinumCoin | Platinum Coin | 11456 | `Platinum Coin.gif`, `Platinum Coin.png` |
| 2436 | BlueJellyfish | Blue Jellyfish | 12391 | `Blue Jellyfish.gif`, `Blue Jellyfish.png` |
| 2437 | GreenJellyfish | Green Jellyfish | 12391 | `Green Jellyfish.gif`, `Green Jellyfish.png` |
| 2438 | PinkJellyfish | Pink Jellyfish | 12391 | `Pink Jellyfish.gif`, `Pink Jellyfish.png` |
| 2611 | Flairon | Flairoon | 4631 | `Flairon.png`, `Flairoon.gif`, `Flairoon.png` |
| 5358 | Shellphone | Shellphone (Home) | 58818 | `Shellphone (Home).gif`, `Shellphone (Home).png`, `Shellphone.png` |

Every probe is bounded by the frozen `fileTitles` and by the identity keys of the
item, exactly as in rounds 1-3. Probes for files that do not exist simply return
nothing; they are not failures.

## Expected outcome

Under `D-2026-08-01-01`, if the wiki still hosts what retry-03 observed:

| itemId | primary image | retained secondary |
| --- | --- | --- |
| 71 | `Copper Coin.png` | `Copper Coin.gif` (`sortOrder` 1) |
| 72 | `Silver Coin.png` | `Silver Coin.gif` (`sortOrder` 1) |
| 73 | `Gold Coin.png` | `Gold Coin.gif` (`sortOrder` 1) |
| 74 | `Platinum Coin.png` | `Platinum Coin.gif` (`sortOrder` 1) |
| 2436 | `Blue Jellyfish.png` | `Blue Jellyfish.gif` (`sortOrder` 1) |
| 2437 | `Green Jellyfish.png` | `Green Jellyfish.gif` (`sortOrder` 1) |
| 2438 | `Pink Jellyfish.png` | `Pink Jellyfish.gif` (`sortOrder` 1) |
| 2611 | `Flairoon.png` | none |
| 5358 | `Shellphone (Home).png` | none |

Items 2611 and 5358 take a single source by display-name precedence.
`Flairon.png` stays the image of item 5526 and `Shellphone.png` stays the image
of item 5437; neither is claimed here.

Anything else — two `.png` candidates, or none — still classifies `ambiguous` and
the bundle stays unwritten. The round cannot silently resolve an identity the
rules do not cover.

## What this unblocks

`ambiguous` reaches zero, so `generate-item-image-source-promotion.mjs` publishes
the bundle for the first time, and item-image subplan Tasks 4-7 plus Task 8
Steps 3-6 become executable. Counters after promotion should read
`total 6131 = existing 2119 + promoted 4012 + unresolved 0 + ambiguous 0 +
duplicate 0 + conflict 0`.

## Out of scope

The 20 legacy `.gif`-primary items with `.png` siblings are not in this input.
They need their own frozen input and their own Owner authorization.
`StrangePlant1..4` remain the documented exception and are not touched.

## To authorize

The Owner must supply, for a new one-time decision identity:

- actor
- reason
- authorizationReference
- expiry
- decision identity (suggested: `canonical-item-image-source-verification-20260801-01`)

The canonical operation binds `dataBundleSha256` to the frozen input, so the
input above must be installed at
`reports/authorization/canonical/canonical-item-image-source-verification.input.json`
before the request is generated. That path currently holds the consumed 877-identity
input from rounds 1-3 and is write-once; replacing it is a deliberate step, and
the three decisions already consumed against it are burned either way.

Run the round detached with `setsid`. Retry-02 was lost to session interruption
and burned a decision for nothing.
