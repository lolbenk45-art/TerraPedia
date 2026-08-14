# Dual-Path Domain Ingestion Acceptance Execution Plan

> This file is reviewed together with the Review Plan. Do not run a crawler, scheduler mutation, or database write until both plans are explicitly approved.

**Goal:** Validate real manual and automatic ingestion for six small domains in WSL `terria_v1_local`, and validate local-data plus real-probe dry-runs for Items and Projectiles.

**Architecture:** First implement activation-gated automatic apply and remove the supplementary per-run Owner-approval dependency. Manual and automatic paths share frozen bundles, owned-table fences, transactions, and audit evidence. All domains run serially.

**Stack:** Node.js ESM, Spring Boot V2 crawler monitor, Redis V2, WSL MySQL/InnoDB.

---

## Task 0: Authorization, snapshots, and writer baseline

**Evidence:** `reports/authorization/canonical/`, `data/generated/`, `reports/`

- [ ] Confirm both Review/Execution plan pairs are approved and the user has authorized enabling the canonical activation for this run.
- [ ] Confirm WSL only: `pwd` is `/home/lolben/TerraPedia`, MySQL listens on `127.0.0.1:13306`, and the database is `terria_v1_local`.
- [ ] Confirm there is no crawler, Node fetch, Java backend refresh, or importer writer:

```bash
ps -eo user,pid,etimes,cmd | rg 'crawl|fetch-wiki|run-wiki-sync|run-backend-data-refresh|import-.*-to-db|java' | rg -v 'rg ' || true
```

- [ ] Record Git status. Do not touch existing dirty `data/generated/wiki-bosses.latest.json`, armor data, or authorization artifacts.
- [ ] Record the database baseline:

```bash
mysql --protocol=TCP -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -e \
"SELECT DATABASE(); SELECT 'items',COUNT(*) FROM items UNION ALL SELECT 'npcs',COUNT(*) FROM npcs UNION ALL SELECT 'projectiles',COUNT(*) FROM projectiles UNION ALL SELECT 'buffs',COUNT(*) FROM buffs UNION ALL SELECT 'armor_sets',COUNT(*) FROM armor_sets UNION ALL SELECT 'boss_groups',COUNT(*) FROM boss_groups UNION ALL SELECT 'audio_assets',COUNT(*) FROM audio_assets;"
```

If a table is missing, stop and record a schema blocker; do not create tables ad hoc.

## Task 1: Add the automatic activation gate

**Modify:**

- `scripts/data/automation/run-supplementary-domain-l1-operation.mjs`
- `scripts/data/automation/supplementary-domain-l1-contract.mjs`
- `scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs`
- `scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs`
- `scripts/data/pipeline/independent-entity-sync-args.mjs`
- `scripts/data/pipeline/independent-entity-sync-args.test.mjs`
- Corresponding `*.test.mjs` files

- [ ] Write RED tests: disabled/stale/domain-set-mismatched activation fails before `BEGIN` and writes no `crawler_automation_approval`, owned table, or generation row.
- [ ] Write RED tests: current activation uses its decision identity and writes run/evidence/apply/audit but does not insert a per-run Owner approval; explicit manual context remains supported.
- [ ] Write RED tests: automatic bundle decision/mode no longer claims `APPROVED_OWNER_L1`, while activation hash, bundle hash, policy-set hash, baseline, and write fences remain mandatory.
- [ ] Run:

```bash
node --test scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs scripts/data/automation/supplementary-domain-l1-contract.test.mjs
```

- [ ] Implement the smallest change: validate activation context, preserve transaction/rollback/generation fences, remove automatic insertion and hard requirement for `crawler_automation_approval`/`approvalId`, and keep explicit `apply=true` protection on the manual path.
- [ ] Also make the independent-entity pipeline accept and strictly validate single-domain selections such as `--entity=armor_sets`, `--entity=buffs`, and `--entity=projectiles`; preserve the default behavior and reject unknown or empty selections.
- [ ] Rerun the same tests and then:

```bash
node --test scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs
```

- [ ] Run focused Maven registry/monitor tests:

```bash
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
```

- [ ] Commit only this task's code/tests after `git diff --check`, `git status --short`, and `git diff --cached --stat`.

## Task 2: Verify activation preflight without writes

- [ ] Start or reuse WSL MySQL and verify `SELECT 1`.
- [ ] Start the local stack:

```bash
bash ./scripts/dev/start-local-stack.sh
```

- [ ] Login in memory to `http://127.0.0.1:18191/api/auth/login`; only read:

```text
GET /api/admin/crawler-monitor/overview
GET /api/admin/crawler-monitor/v2/automation/preflight
```

- [ ] Preflight must show `enabled=true`, `mode=changed-only`, eight domains, and no unexpected domain. Stop on failure; do not call dispatch or apply.
- [ ] Do not call `PUT /admin/crawler-monitor/v2/automation` unless the activation packet has been checked and this execution phase records exactly one enablement operation; do not call any domain start endpoint.

## Task 3: Items/Projectiles local data plus real probes

- [ ] Run real source-probe/manifest checks for Items and Projectiles; do not perform a full network fetch.
- [ ] Manual dry-run:

```bash
node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync
node scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs --apply=false
```

- [ ] Automatic dry-run: use the V2 monitor changed-only plan/preview entry point, verify action/domain/source-key mapping and active-attempt dedupe, and never pass `--apply=true`.
- [ ] Prove both database counts are unchanged and retain probe hashes, dry-run reports, terminal progress, and dedupe evidence.

## Task 4: Armor Sets real manual path

- [ ] Record `armor_sets` and related owned-table counts and mutation generations.
- [ ] First add and test an `--entity=armor_sets` single-domain filter to the independent-entity pipeline so the default cannot refresh buffs/projectiles together; then run the bounded source refresh:

```bash
node scripts/data/fetch/fetch-wiki-armorsetbonuses.mjs \
  --progress-path=data/generated/domain-source-armor-sets-progress.latest.json \
  --manifest-path=data/generated/wiki-source-manifest.latest.json
```

- [ ] Generate the frozen input and run `node scripts/data/pipeline/run-independent-entity-sync-pipeline.mjs --apply=true --entity=armor_sets`; never run buffs/projectiles concurrently.
- [ ] Verify terminal progress, report, post-write counts, samples, and unrelated-table counts. Roll back and stop on any failure.

## Task 5: Bosses real manual path

- [ ] Run `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=boss-sync` and confirm Boss loot is absent.
- [ ] Use isolated output/report paths for the real manual fetch/import:

```bash
node scripts/data/fetch/fetch-wiki-bosses.mjs \
  --output-json=data/generated/wiki-bosses.acceptance.latest.json \
  --report-json=reports/wiki-bosses-acceptance.json
node scripts/data/import/import-wiki-bosses-to-db.mjs \
  --input=data/generated/wiki-bosses.acceptance.latest.json \
  --apply=true \
  --report-json=reports/wiki-bosses-import-acceptance.json
```

- [ ] Do not run `run-boss-loot-sync-pipeline.mjs`; verify `boss_groups`/owned-NPC scope, samples, generations, and audit evidence.

## Task 6: Shimmer real manual path

- [ ] Run real Shimmer extraction with canonical progress:

```bash
node scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs \
  --progress-path=data/generated/domain-source-shimmer-progress.latest.json
```

- [ ] Read the verified canonical Shimmer input contract and run the existing import pipeline against the local database; only the four Shimmer transform/decraft/entity/NPC-transform tables are allowed.
- [ ] Verify generations, terminal progress, four-table counts/samples, and audit evidence; rollback immediately on schema/import failure.

## Task 7: Buffs and NPCs real manual paths

- [ ] Buffs:

```bash
node scripts/data/fetch/fetch-wiki-buffs.mjs \
  --progress-path=data/generated/fetch-wiki-buffs-progress.latest.json \
  --manifest-path=data/generated/wiki-source-manifest.latest.json
node scripts/data/import/import-buffs-to-db.mjs --apply=true
```

- [ ] NPCs: run `run-backend-data-refresh.mjs --mode=plan --steps=wiki-npcs-refresh`, then run the existing independent-entity importer against its bounded real input; do not run concurrently with Buffs.
- [ ] Verify each domain's input scale (388/762), terminal progress, post-write counts/samples, generations, audit evidence, and unrelated-table counts.

## Task 8: Audio complete catalog and real manual import

- [ ] Run the complete governed catalog directly through the shared Audio helper with explicit limits:

```bash
node scripts/data/fetch/fetch-wiki-audio-assets.mjs \
  --mode=all \
  --allow-full-audio-corpus=true \
  --max-api-pages-per-prefix=100 \
  --max-total-files=600 \
  --progress-path=data/generated/wiki-audio-assets-progress.latest.json
```

- [ ] Only after all four prefixes are exhausted, accepted files are <=600, and the manifest/bundle is readable, run:

```bash
node scripts/data/import/import-wiki-audio-assets-to-db.mjs --apply=true
```

- [ ] Verify `audio_assets` and `audio_asset_links` counts/samples, reports, source acknowledgement, and proof that no binary request occurred before catalog completion.

## Task 9: Automatic entry acceptance per domain

- [ ] Do not call a domain-start endpoint; use the enabled canonical V2 scheduler activation and one controlled changed-only sweep.
- [ ] For every real domain, confirm changed source fingerprint, matching action ID, one attempt, running-to-completed progress, activation-gated transaction, audit/result, and acknowledgement.
- [ ] For Items/Projectiles, confirm local-input dry-run only and no database mutation.
- [ ] For domains already current after manual import, automatic apply must still enter a real transaction/audit terminal result; zero affected rows is valid, but it must not redispatch indefinitely.
- [ ] A second read-only overview/preflight must show the acknowledged fingerprint, no new attempt, and no active duplicate.

## Task 10: Failure-path and infinite-run validation

- [ ] In isolated fixtures/test harnesses, prove disabled activation, stale identity, probe error, pre/post drift, unreadable bundle, active duplicate, retry limit, and Audio page/file guards fail before mutation.
- [ ] Do not manufacture a partial write in the real database; use existing importer tests and isolated connections for rollback.
- [ ] Run the concentrated regression:

```bash
node --test scripts/data/monitor/supplementary-source-probes.test.mjs \
  scripts/data/monitor/check-source-updates.test.mjs \
  scripts/data/lib/wiki-sync-manifest.test.mjs \
  scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs \
  scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs \
  scripts/data/import/import-independent-entities-to-db.test.mjs \
  scripts/data/import/import-buffs-to-db.test.mjs \
  scripts/data/import/import-wiki-audio-assets-to-db.test.mjs \
  scripts/data/import/import-wiki-bosses-to-db.test.mjs \
  scripts/data/import/import-wiki-shimmer-to-db.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
git diff --check
```

## Task 11: Closeout

- [ ] Read all terminal progress, DB after-counts, audit/results, source manifest, and scheduler overview.
- [ ] Stop the local stack and confirm no crawler/importer writer; do not delete runtime artifacts.
- [ ] Update the dual-path devlog with manual/automatic attempt IDs, results, counts, and residual risks for every domain.
- [ ] Commit only code, tests, and docs; leave generated data, authorization artifacts, and armor data unstaged.
