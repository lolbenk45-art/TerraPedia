# Supplementary Domains L1 Automation Design

## Goal

Bring `shimmer`, `audio`, and `bosses` into the changed-only crawler automation
chain at `L1/ACTIVE`. A source change must produce monitor-visible progress and
an immutable preview bundle. A formal database write must use a single-use
System Owner approval and the existing canonical transaction/audit fences.
This is an L1 capability only; no L2 promotion is included.

## Scope

In scope:

- scheduler eligibility and preflight coverage for Shimmer, Audio, and Bosses;
- monitor-visible fetch/preview actions with stable action IDs and progress;
- frozen per-domain L1 evidence bundles and one-time approval execution;
- policy, baseline, evidence, mutation-generation, and result recording;
- focused unit/contract tests, scheduler preflight evidence, and one approved
  L1 acceptance run per domain.

Out of scope:

- L2 promotion or unattended production writes;
- Boss loot automation;
- changes to public pages or unrelated crawler domains;
- replacing the existing V2 scheduler/reconciler with another daemon.

## Domain Operations

| Domain | Preview/source operation | L1 apply target | Progress contract |
| --- | --- | --- | --- |
| Shimmer | `domain-source-shimmer` generation extraction | Existing canonical Shimmer import tables: item transforms, decraft rules, entity transforms, NPC transforms | `data/generated/domain-source-shimmer-progress.latest.json` |
| Audio | `wiki-audio-assets-refresh` bounded source refresh plus frozen import plan | `audio_assets` | Dedicated `wiki-audio-assets` progress path mirrored to the canonical monitor path |
| Bosses | `domain-source-bosses` bounded/resumable source crawl | Existing canonical Boss base-data import scope | `data/generated/domain-source-bosses-progress.latest.json` |

Each source action writes `running` progress before its first network request,
updates heartbeat/current/total during work, and ends atomically as
`completed` or `failed`. The bundle records the exact source/output hashes and
never consumes a mutable `latest` file during apply.

## Architecture

`CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS` becomes the single
eligibility source for the three added domains. The V2 changed-only sweep
detects source changes and dispatches only preview/source work. It never calls a
database import action directly.

Each domain adapter implements the existing L1 runner contract:

1. read and validate current owner, policy, policy-set hash, mutation
   generation, and source readiness;
2. freeze a domain-specific import plan and logical diff;
3. persist an evidence/run chain with baseline and bundle hashes;
4. require one current, unconsumed `APPROVED_OWNER_L1` authorization;
5. apply only the frozen plan inside the existing database ownership and
   transaction protocol;
6. persist committed result or rollback/failure evidence.

The shared runner owns authorization, identity fences, snapshot/rollback,
result recording, and failure handling. Domain adapters own only source
normalization, owned-table definitions, diff calculation, and import calls.

## Policy And Scheduler Activation

The three domains are bootstrapped or promoted to `L1/ACTIVE` through explicit
canonical policy decisions. `SHADOW` is not used for this task because it is
read-only and cannot satisfy automatic database ingestion.

The scheduler preflight is regenerated after eligibility changes. A fresh
canonical scheduler activation request/authorization updates the exact eligible
operation set. No L2 promotion or L2 scheduler decision is created.

## Failure Handling

- Missing/stale source evidence blocks preview and records a domain-local reason.
- Bundle, baseline, policy, or authorization identity drift fails closed before
  any write.
- A failed domain enters its own circuit/failure state; other domains may still
  produce previews.
- Apply never retries automatically after a partial or ambiguous write.
- All progress, run, evidence, and result paths remain monitor-visible and
  retain exact domain/action/run identity.

## Validation

- TDD tests for registry eligibility, operation mapping, progress defaults,
  bundle identity, approval fencing, and domain-owned table boundaries.
- Existing focused crawler and monitor tests for Bosses, Shimmer, and Audio.
- Scheduler activation preflight/proposal tests proving the exact three domains
  are eligible and no unrelated domain is added.
- One real changed-only preview and one Owner-approved L1 apply per domain,
  with database counts, mutation generations, audit rows, and terminal progress
  readback recorded.

## Acceptance

The task is complete when all three domains can be detected by the V2
changed-only scheduler, produce valid frozen L1 bundles, and complete an
approved L1 database apply without cross-domain or cross-table leakage. The
result remains L1/ACTIVE and explicitly requires a new decision before any L2
promotion.
