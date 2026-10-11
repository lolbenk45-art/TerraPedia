# Current Devlog

Last updated: 2026-10-11 20:24 CST by Codex

Active branch: `feat/supplementary-domains-readiness`
Active focus: Armor and Buff automation code is integrated. Production automatic-ingestion acceptance remains disabled until each domain has a real source delta and fresh exact authorization. Buff's latest current-Wiki replay passed on isolated Redis DB18 with `production_source_delta=false`; Armor remains owner-isolated on `18104/DB14` with its source/binding gates closed. No production scheduler or formal table write was performed by this merge.

## Automation domain merge checkpoint - 2026-10-11 20:24

- Armor integration commit: `67536d30` (`chore(automation): integrate Armor domain lane`); focused Node `1140/1140`, Maven `742/742`, Admin typecheck, and Admin unit `417/417` passed after conflict resolution.
- Buff integration commit: `4e8ebbb3` (`chore(automation): integrate Buff domain lane`); it retains the runtime/API repair, source replay, isolated T1, and scheduler read-only contracts. Focused validation after merge is Buff Node `541/542` (the only failure is the pre-existing backfill test's missing `mysql2/promise` dependency), local automation/contracts `90/90`, and backend Maven `507/507`. The Buff production gate remains `changed=false` with disabled control and zero live work; automatic DB ingestion is still the only unfinished acceptance boundary.

## Buff runtime startup/API repair - 2026-10-11 19:15 CST

- Rebuilt the current Buff backend JAR and reproduced the missing-runtime startup failure on `18105`: the local example token secrets were 30/29 characters while backend validation requires at least 32. Extended both example values and added a local-stack regression test for the minimum length.
- A read-only HTTP probe then found `GET /admin/crawler-automation/overview` returning `500`: MyBatis constructor mapping could not map MySQL `DATETIME` plus SQL `NULL` columns into `CrawlerAutomationOverviewDTO.DomainSummary`. The mapper now formats `completed_at` as an ISO-like string, and the DTO has a boundary constructor that normalizes MyBatis `Object` null projections to empty lists. Added focused DTO/service tests.
- Current rebuilt runtime is healthy on `18105`/Redis `6380/DB15` with `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=true`, scheduler control disabled, and queue cutover disabled. Health, automation overview/profile, V2 automation, preflight, and monitor overview all returned HTTP `200`; Buff control remains `enabled=false` and read-only.
- Read-only state remained unchanged: DB15 Redis has the existing 8 state keys, no Redis live-attempt/index/lease keys, SQL automation attempts/reservations are `0/0`, active write-fence query is `0`, and formal Buff counts remain `388/400/400/400`. No scheduler/control endpoint, `/v2/automation/sweep`, formal table, or production Buff data write was performed.
- Validation: `node --test platform/local/local-stack.test.mjs` (`39/39`), `mvn -Dtest=CrawlerAutomationServiceImplTest,CrawlerAutomationOverviewDTOTest test` (`7/7`), backend package, `node --check`, and `git diff --check` pass. The focused commit contains only this startup/API repair and its evidence.

## Fresh current-Wiki re-crawl #3 and isolated replay on DB18 - 2026-10-11 17:14 CST

- Command: `bash ./platform/local/run-buff-current-source-replay.sh --redis-db=18`. Artifact `.local/tmp/buff-current-source-replay-buf_d029209e7dba685c.json`, SHA-256 `sha256:2d6be608db16a51415ddae032501ddddcdaae19245610121251e6842b58a54b5`, `status=passed`, run ID `buff-source-replay-20261011091357-c0372206`, run key `buf_d029209e7dba685c`.
- This run made fresh network requests for `Template:GetBuffInfo@1023278`, `Module:Iteminfo/data@1023241`, `Shadowflame@1027510`, and `Acid Venom@1027618`. Source snapshot hash is `sha256:78ff3f0427594d80f6f9d902261fc97720a0bcd45c7204d1302ea59eeacf62f2`; module/item/page raw hashes are retained in the artifact. Revision IDs remain unchanged, so this is fresh retrieval evidence and not a semantic production Buff delta.
- Parsed facts are ShadowFlame `5` source items / `1` inflicting NPC / `30` immune NPCs and Venom `8` / `3` / `26`. T1 acceptance passed with Buff import `2/2`, maint inserts `2`, relation/projection Buff rows `2/2`, source-item relations `13`, inflicting-NPC relations `4`, unresolved `0`, and consumer readback Venom `8/26` plus ShadowFlame `5/30`.
- Source replay now requires explicit Redis `6380/DB18`; DB18 preflight and postflight were both `0`, the three run-derived schemas were `terria_v1_automation_acceptance_buf_d029209e7dba685c_{local,maint,relation}`, and cleanup passed. The fixture scheduler test window remains separate on DB13. DB14, DB15, DB16, and DB17 remain rejected for this source replay.
- Focused validation after the change is `34/34`; `node --check`, `bash -n`, and `git diff --check` pass. Production Buff `18105/DB15` remains disabled, no formal runtime table or production Redis write occurred, and the artifact remains `manual_source_replay=true`, `production_source_delta=false`, and `databaseWritesToFormalRuntime=false`.

## Fresh current-Wiki re-crawl #2 and isolated replay - 2026-10-11 16:15 CST

- A new invocation of `bash ./platform/local/run-buff-current-source-replay.sh` completed with run key `buf_b7d4e3418962ccfc`, artifact [`.local/tmp/buff-current-source-replay-buf_b7d4e3418962ccfc.json`](.local/tmp/buff-current-source-replay-buf_b7d4e3418962ccfc.json), `status=passed`, and artifact SHA-256 `sha256:72fe44cd073a5c98a939213f028d6af92d040f55f4c0e65ba64c1f9df23df8d8`.
- This run fetched Wiki sources again over the network. It captured `Template:GetBuffInfo@1023278`, `Module:Iteminfo/data@1023241`, `Shadowflame@1027510`, and `Acid Venom@1027618`; the new source snapshot hash is `sha256:d9c70a95a1ac96c2466a82edffd8d883c1020269f42f6c78485f5d5df797d547`. The revision IDs are unchanged, while the page raw hashes are new for this capture, so this is fresh retrieval evidence but still not a semantic Buff delta.
- Parsed facts are ShadowFlame `5/1/30` and Venom `8/3/26` for source items/inflicting NPCs/immune NPCs. Isolated T1 passed with Buff import `2/2`, source-item rows `13`, maint inserts `2`, relation/projection Buff rows `2/2`, inflicting-NPC rows `4`, unresolved `0`, and consumer readback Venom `8/26` plus ShadowFlame `5/30`.
- The runner recorded Redis `6380/DB13` preflight/postflight `0`, run-derived databases `terria_v1_automation_acceptance_buf_b7d4e3418962ccfc_{local,maint,relation}`, and `cleanupPassed=true`. The independent check immediately afterward observed a new Armor reservation `arm_db58a3f20b51d757` in DB13 because the Armor isolated runner had started concurrently; no key was deleted or flushed. After that run ended, another Armor run `arm_05aa800dcb5aa189` reclaimed DB13; six read-only samples over ten seconds all showed its two keys. DB13 cannot be treated as globally idle while that Armor automation is running.
- A preceding attempt `.local/tmp/buff-current-source-replay-buf_126d7ce6c385472a.json` failed closed before capture for the same DB13 contention and was not reused. The Armor contention is environmental concurrency, not a Buff source or T1 failure.
- The artifact remains explicitly `manual_source_replay=true`, `production_source_delta=false`, and `databaseWritesToFormalRuntime=false`; production Buff `18105/DB15` remains disabled and no formal runtime write occurred.

## Fresh current-Wiki re-crawl and isolated replay - 2026-10-11 10:10 CST

- `bash ./platform/local/run-buff-current-source-replay.sh` completed with fresh run key `buf_c45236dfe43a5cfe`, artifact [`.local/tmp/buff-current-source-replay-buf_c45236dfe43a5cfe.json`](.local/tmp/buff-current-source-replay-buf_c45236dfe43a5cfe.json), `status=passed`, SHA-256 `sha256:10cf2768131f01a9091b78fbf2d1229696a69f03ef7c1449c42e17b7bb0180dd`.
- The run fetched the current revision-bound sources again: `Template:GetBuffInfo@1023278`, `Module:Iteminfo/data@1023241`, `Shadowflame@1027510`, and `Acid Venom@1027618`. The parsed records remain ShadowFlame `5/1/30` and Venom `8/3/26`; page wikitext/sections and parsed facts match the prior replay. Only rendered HTML cache-time bytes changed, so the snapshot hash is new but this is not a semantic Buff source delta.
- Isolated acceptance passed with input `current_wiki_source_replay`: Buff import `2/2`, maint writes `2`, relation/projection `2/2`, source-item relations `13`, inflicting-NPC relations `4`, unresolved `0`, and consumer readback Venom `8/26` plus ShadowFlame `5/30`. DB13 was empty before and after, and cleanup passed for the run-derived three databases/accounts.
- The replay artifact's own DB13 postflight is `0` and its run-derived schema/account cleanup passed. However, the independent read-only artifact `.local/tmp/buff-current-source-replay-production-readback-20261011T020948Z.json` records `db13Size=2` (`terrapedia:automation:t1:arm_49ef5d6676df6d06:namespace` and `...:reservation`) at `2026-10-11T02:10:18Z`; its `db13Empty` check is therefore `false`. A later confirmation at `2026-10-11T02:12:02Z` also observed size `2`. At this continuation's check Redis `6380` was no longer listening, so the keys' subsequent state could not be verified. The readback still confirms HTTP `200`, production scheduler disabled, DB15 `PONG`, zero API/SQL/DB15 live work, healthy reconciler, and formal Buff counts `388/400/400/400`.
- Because the independent DB13 cleanup readback is not stable, this evidence does not claim the environment was fully clean after the run. No cleanup, `FLUSHDB`, or process termination was performed against the unknown keys.
- The artifact explicitly records `manual_source_replay=true`, `production_source_delta=false`, and `databaseWritesToFormalRuntime=false`. This is fresh source-capture and isolated-chain evidence; it is not production automatic-ingestion acceptance. No production marker, manifest, scheduler, permit/decision, DB15, or formal-table write occurred; the isolated replay did use DB13 and its own postflight reported zero keys.

## Automatic acceptance Phase 0 recheck - 2026-10-11 10:00 CST

- Fresh manifest-bound Wiki source probe completed `9/9`, all healthy. Buff `wiki.page.template_getbuffinfo` current, previous, and ingested fingerprints all remain `a512db8c...`; `changed=false`. Other-domain changes do not trigger Buff.
- Fresh production reads on `18105` returned HTTP `200` for health, automation, preflight, and overview. Process identity is Buff `18105`/Redis DB15 with automation read-only and queue cutover disabled; Armor remains `18104`/DB14. Scheduler is disabled, reconciler healthy, API/SQL/Redis live work is zero, Redis DB15 is `PONG`, and formal Buff counts remain local/maint/relation/projection `388/400/400/400`.
- Evidence: source state `.local/tmp/buff-source-monitor-phase0-20261011T015547Z/state.json` (`sha256:0ef83ec3d060b766db84b1bfc6e40486205d5cb8a73e69b5868f297240daedae`), report `.local/tmp/buff-source-monitor-phase0-20261011T015547Z/reports/source-update-check-2026-10-11T01-55-47.269Z.json` (`sha256:323c3259a4845ee72f13f00334bcae3c2772012c2873ae0a10972491188ea460`), and readback `.local/tmp/buff-automatic-acceptance-phase0-readback-20261011T0200Z.json` (`sha256:cf8c08aaf50cacd14f11258968a2ce66d958be06cf0976a77dc66113e10fddb2`).
- No scheduler mutation, authorization/permit/decision creation or replay, crawler dispatch, Redis write, or formal-table write occurred. Automatic acceptance remains open at the source-delta gate. Next: on a genuine Buff fingerprint change, rerun fresh Phase 0, bind a new authorization to the exact source/runtime state, then observe the natural tick and complete terminal full-chain plus multi-cycle/expiry/restart readback.

## Current-source replay passed - 2026-10-11 09:20 CST

- The current-source replay uses canonical shared Buff progress, requires loopback MySQL/Redis, retains preflight/capture failure artifacts, verifies the exact run-derived T1 identity, and requires Redis DB13 empty before and after execution.
- Final artifact `.local/tmp/buff-current-source-replay-buf_75c52bd119f505f6.json` is `status=passed`, mode `0600`, SHA-256 `sha256:3272684ae794724c645b136e0f566bc1ad2f79569de096e201c2d53bfe71ad38`; run ID `buff-source-replay-20261011011455-02dfb939`, run key `buf_75c52bd119f505f6`, source snapshot hash `sha256:fe5ba385c18588df1f28bc61346ffb37e8d2587a237e4666bb24ddc048375939`.
- Captured sources: Template revision `1023278` (`sha256:a512db8c...`), Iteminfo revision `1023241` (`sha256:df8a7219...`), Shadowflame revision `1027510` (`sha256:2bc8f031...`), and Acid Venom revision `1027618` (`sha256:981ca0c0...`). Parsed counts are Buff 153 `5/1/30` and Buff 70 `8/3/26` for source items/inflicting NPCs/immune NPCs.
- Isolated T1 acceptance passed with `current_wiki_source_replay` input: Buff import `2/2`, maint writes `2` inserts, relation/projection Buff rows `2/2`, source-item relations `13`, inflicting-NPC relations `4`, unresolved `0`, and consumer readback Venom `8/26` plus ShadowFlame `5/30`. DB13 preflight/postflight are `0`; independent schema/account readback is `0/0`.
- Production read-only artifact `.local/tmp/buff-current-source-replay-production-readback-20261011T011834657Z.json` is SHA-256 `sha256:ff9b26f302ba495d1420e934c50efb2fc9dcfcd3f7b20f5ff5919d42df932aa4`. It confirms all API reads HTTP `200`, scheduler `enabled=false`, DB15 process identity with read-only/cutover flags, API/SQL/Redis live work `0`, healthy reconciler, and formal Buff counts `388/400/400/400`.
- Final focused validation is `51/51`; `node --check`, `bash -n`, and `git diff --check` pass. This manually verifies the current Wiki source through the isolated T1 chain without waiting for a new fingerprint. It does not authorize production automatic ingestion; the Buff fingerprint remains unchanged and the production scheduler remains disabled.

## Real Buff snapshot isolated replay - 2026-10-11 08:57 CST

- The manifest-bound raw source is `/home/lolben/TerraPedia/data/terraPedia/raw/wiki/template__getbuffinfo.latest.json`; its `moduleContent` SHA-256 is `a512db8cc60378dcefed3e3f7905480fe6a60cb9e04ef3adf947cd5205d5aa57`, exactly matching `data/generated/wiki-source-manifest.latest.json`. The parsed payload was checked against all 400 raw identities and the same revision timestamp (`2026-08-22T05:46:54Z`), so this replay did not use the 388-record standardized file.
- A fresh run `buff-real-snapshot-20261011005120986-b6a05632d5` / `buf_2ba594c0857e0f44` completed in isolated Redis `6380/DB13` and run-derived schemas only. Artifact `.local/tmp/buff-real-snapshot-replay-buff-real-snapshot-20261011005120986-b6a05632d5.json` is mode `0600`, SHA-256 `bf2341be1fef3105b07bb89d1338e62acd1f6b8c3c41bc82a9392b66bb1f14dc`, and `status=passed`.
- The replay copied formal Items `6152` and NPCs `762` through the temporary read-only/provisioner boundary, inserted one real Buff landing payload, and ran landing -> maint -> relation/projection. Maint produced `400` Buff rows (`398` inserted, `2` updated); relation produced `400` `relation_buffs`, `400` `projection_buffs`, `165` item-Buff relations, and `1264` NPC-Buff relations. Independent consumer readback: Venom `70` has `8` source items / `26` immune NPCs; ShadowFlame `153` has `5` / `30`.
- This is a structural chain pass, not semantic dependency completeness: the 184 source-item and 130 inflicting-NPC facts include strict identity gaps (`34` and `27`) and name fallback gaps/ambiguities. The targeted readback is `.local/tmp/buff-real-snapshot-replay-buff-real-snapshot-20261011005120986-b6a05632d5-dependency-readback.json` (SHA-256 `b4028253348bdfe70f6a254070283da04c3ff033d85ed9dd9a6a197de19c8d9d`). These existing source/dependency gaps remain unresolved and are not promoted by this replay.
- Cleanup readback is zero for all three run-derived schemas, Redis DB13 keys, temporary accounts, and cleanup errors. The first retry failed only on ISO-to-MySQL `DATETIME` formatting (`ERROR 1292`) and was retained as `.local/tmp/buff-real-snapshot-replay-buff-real-snapshot-20261011004914233-a13f6891e2.json`; it also cleaned to zero. No formal table, DB15, DB14, DB16, authorization, permit/decision, scheduler, marker, or `/v2/automation/sweep` write occurred.
- This proves the current real 400-record Buff snapshot can traverse the isolated full chain. It does not open production automatic-ingestion acceptance: the source fingerprint has not changed, and production Buff remains disabled on `18105`/DB15 pending a fresh source delta and authorization chain.

## Fresh source probe - 2026-10-11 05:06 CST

- A valid 9/9 source probe bound to `data/generated/wiki-source-manifest.latest.json` confirms Buff current/previous/ingested fingerprint `a512db8c...` with `changed=false`; the four changed sources are Biomes, Audio, Bosses, and Shimmer. Buff automation remains gated.
- Authenticated production reads on `18105` returned HTTP `200`; scheduler is disabled, live attempts/claims are `0/0`, reconciler is healthy, and DB15 epoch is unchanged. MySQL live attempts/reservations/fences are `0/0/0`; DB15 Redis is `PONG` with live attempts `0`.
- Detailed hashes and artifacts are in the active Buff entry. The first probe used the default shared-data manifest, which lacks the Buff record; it is diagnostic only and is superseded by the explicit worktree-manifest run.

## Fresh DB15 read-only gate - 2026-10-11 05:07 CST

- Verified source and readback artifacts: `.local/tmp/buff-source-monitor-verified-20261010T210248Z/state.json` and `.local/tmp/buff-db15-readonly-preflight-20261010T210732994Z-verified-source.json`. Buff remains `a512db8c...` with `changed=false`; health, automation, preflight, and `/admin/crawler-monitor/overview` are `200`, scheduler disabled, live work `0/0`, reconciler healthy, DB15 process identity confirmed, and DB13 empty.
- The initial `/admin/crawler-monitor/v2/overview` probe returned `404` because the maintained controller route is `/admin/crawler-monitor/overview`; the corrected readback is `200`. No mutation occurred. Production authorization remains blocked until a genuine Buff source delta.

## Final five-minute window - 2026-10-11 02:27 CST

- Planned command passed: [artifact](.local/tmp/buff-automation-test-window-buf_af1a32a9649740f9.json) `status=passed`, run key `buf_af1a32a9649740f9`, natural attempt `attempt-1358bd60-3bd7-4245-a18b-a5bd89ba0020`, Buff T1 acceptance `passed`, confirmed disable, and cleanup counts all zero. DB13, all three run-derived schemas, and temporary accounts are empty/absent after cleanup.
- Production readback remains clean: Buff `18105` health/automation/preflight/overview all HTTP `200`, scheduler `enabled=false`, mode `changed-only`, canary `buff-page-immunity-refresh`, API/SQL/Redis live work `0`, reconciler `healthy`, DB15 epoch unchanged; Armor DB14 remains reachable with live index `0`. Formal Buff counts remain unchanged and no formal, DB15, or DB14 business write occurred.
- Repairs included mysql CLI compound-trigger delimiter compatibility, Buff-mode Recipe isolation, fixture-only canary normalization, temporary worktree config cleanup, and post-preflight deadline enforcement. Validation: Node focused suite `74/74`, wrapper/quality-gate contracts `3/3`, Java `305/305`, scheduler lifecycle `33/33`, adapter `16/16`, Buff window `5/5`, `bash -n`, three `node --check` commands, and `git diff --check`.
- Historical diagnostics remain preserved and non-replayable: `buf_a96e2ace26275c28`, `buf_73a0b91a920106f2`, `buf_91f94f92c59972c8`, and `buf_98784e4bac8f1639`.
- Production automatic-ingestion acceptance remains gated on a genuine nonzero Buff fingerprint delta and fresh authorization; the fixture run does not authorize unattended ingestion.

## Final patched artifact - 2026-10-11 02:35 CST

- Added and test-covered the required artifact boundary fields: `manual_isolated_acceptance=true`, `production_source_delta=false`, and `databaseWritesToFormalRuntime=false`.
- The first post-patch 1-minute window `.local/tmp/buff-automation-test-window-buf_9765b47ab10f6117.json` failed closed on terminal-progress timeout after the natural tick; disable was confirmed and all cleanup readback fields were zero. It is retained as diagnostic evidence.
- The final post-patch 5-minute window `.local/tmp/buff-automation-test-window-buf_7a645579f2b395f4.json` has SHA-256 `2cf27947a24a4867f17578affb7aec37e5225fb5f4ec59071dcf8641ca2992ac` and `status=passed`. It observed one natural fixture tick, completed attempt `attempt-cd885377-d97e-42a5-bb54-bc01686f1592`, confirmed disable, passed Buff T1 acceptance, and read back zero backend/child/Redis/credential/file/permit/port/schema resources.
- The final acceptance readback is two Buff imports, 11 source-item relations, 4 NPC dependencies, two relation/projection Buff rows, and exact Venom/ShadowFlame consumer counts. Redis DB13 is empty and temporary MySQL accounts/schemas are absent. Current focused Node validation remains `59/59`; `git diff --check` passes.

## Prepare handoff - 2026-10-11 01:47 CST

- Worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`, branch `feat/automation-domain-buff`, HEAD `42f49ede99a147ce3e42fe163b26249f3f8ba3e9`; no upstream is configured. Git reports 68 tracked modified paths, 1597 untracked paths, and 0 staged paths. Existing dirty state is intentional handoff context; do not clean or reset it.
- The manual Buff test-window implementation and plan are present but uncommitted: `pipelines/automation/buff-automation-test-window.mjs`, its test, `platform/local/run-buff-automation-test-window.sh`, its test, the fixture driver/backend changes, and `docs/superpowers/plans/2026-10-10-buff-manual-automation-test-window.md`. Design: `docs/superpowers/specs/2026-10-10-buff-manual-automation-test-window-design.md`.
- Focused validation recorded in the active entry: Node/window/wrapper/scheduler/Buff fixture tests `39/39`, Java focused tests `292/292` plus `13/13` and `1/1`, syntax checks, and `git diff --check` pass. No production runtime or formal database write was performed.
- The latest isolated run artifact `.local/tmp/buff-automation-test-window-buf_73a0b91a920106f2.json` is `status=blocked`, run ID `buff-window-20261010161822-a75867a2`, Redis DB13, and schemas `terria_v1_automation_acceptance_buf_73a0b91a920106f2_{local,maint,relation}`. It failed during local T1 snapshot SQL with MySQL `ERROR 1064`; cleanup readback also reported `ERROR 1396` while checking the temporary provisioner account. No test backend remained running; the next session must verify account/schema/Redis cleanup before retrying.
- Superseded next action: the isolated T1 snapshot/credential path was rerun successfully in the section below. Keep Buff `18105`/Redis DB15 disabled, Armor `18104`/DB14 owner-isolated, and DB16 historical-only. Do not use `/v2/automation/sweep`, FLUSHDB, direct marker edits, old permits/decisions, or formal-table writes.

## Isolated T1 window passed - 2026-10-11 02:20 CST

- The isolated run artifact `.local/tmp/buff-automation-test-window-buf_1ab569ee1b8ed200.json` has SHA-256 `faab82009418f2d014c69a37139c208e10a123756841a30692b7bcdd98010c6c` and `status=passed`. Run `buff-window-20261010181642-a6bf8c87` used Redis `6380/DB13` and the run-derived schemas `terria_v1_automation_acceptance_buf_1ab569ee1b8ed200_{local,maint,relation}`.
- The window observed one natural fixture tick and one completed terminal attempt (`attempt-8a0b8a14-1127-433d-af83-0840800a3c0e`). Enable/disable payloads were both `fixture-changed-only` with canary `crawler-queue-v2-fixture`; disable was confirmed. Buff T1 acceptance passed with two imported Buff rows, 11 source-item relations, 11 item dependencies, 4 NPC dependencies, two relation/projection Buff rows, and consumer readback for Venom `70` and ShadowFlame `153`.
- Independent cleanup readback is zero for backend/child processes, Redis keys, credentials, files, permits, ports, and databases. Redis DB13 and the temporary MySQL accounts/schemas were empty/absent after cleanup. No production DB15/Armor DB14/DB16 resource was used by this window.
- A direct current adapter snapshot probe verified all 132 bounded source-table samples on MySQL 9.2 with the configured read-only grants. The historical `ERROR 1064` did not reproduce; the current migration path passes compound trigger SQL through the MySQL CLI delimiter rewrite. The exact historical failing statement remains unisolated, so this result is recorded as current-path evidence rather than a definitive historical root-cause claim. The prior `ERROR 1396` left no account residue.
- Current focused validation is Node `59/59` across the window, wrapper, scheduler lifecycle, adapter, and Buff T1 suites; syntax checks and `git diff --check` pass. Production Buff remains disabled on `18105`/DB15 pending a real source fingerprint delta; this fixture pass does not authorize production automation or unattended-ingestion completion.

## Manual test-window handoff - 2026-10-11 00:25 CST

- Implementation is present but uncommitted on `feat/automation-domain-buff` at HEAD `42f49ede`; the worktree already contains substantial pre-existing tracked and untracked Buff changes. No paths are staged.
- New paths: `pipelines/automation/buff-automation-test-window.mjs`, its test, `platform/local/run-buff-automation-test-window.sh`, its test, and `docs/superpowers/plans/2026-10-10-buff-manual-automation-test-window.md`.
- Existing fixture system-driver and backend changes are in `pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs`, `CrawlerMonitorServiceImpl.java`, its focused test, and `platform/local/quality-gate.sh`. Fixture mode is accepted only with `TERRARIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED=true`; the test window reserves Redis DB13 and rejects DB14/DB15/DB16.
- Validation: Node contract/wrapper/scheduler/Buff fixture tests `39/39`; Java focused suite `CrawlerMonitorServiceImplTest` `292/292` plus `CrawlerMonitorActionRegistryTest` `13/13`; focused fixture method `1/1`; syntax checks and `git diff --check` pass.
- Runtime attempt: the first invocation was blocked by an older backend JAR before resource setup. After `mvn -DskipTests package`, a second invocation reached T1 provisioning but failed closed on the local MySQL snapshot/privilege path (`ERROR 1064` during snapshot SQL). The artifact is `.local/tmp/buff-automation-test-window-buf_73a0b91a920106f2.json` with `status=blocked`; no backend `18189` started, no formal DB or Buff DB15 write occurred, Redis DB13 remained empty, and temporary accounts were explicitly removed. The command now resolves a primary-worktree local config when running from `.worktrees`.
- Next safe action: inspect/fix the local T1 snapshot provisioning prerequisite or provide a compatible isolated test MySQL credential, then rerun the window. Do not enable production Buff automation or use DB14/DB15/DB16 for the fixture run.

DB15 runtime correction (2026-10-10 19:32 CST): an erroneous DB16 owner had overwritten the durable marker after the earlier DB15 repair. The DB16 process was stopped; the existing DB15 reset identity was replayed only through `/cutover/recover-state-store-reset` with the coordinator lock and returned HTTP `200`/epoch `epoch-ecad...`. The final service was restarted with `CUTOVER_ALLOWED=false`, `SPRING_TASK_SCHEDULING_ENABLED=true`, `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=true`, and `MANAGEMENT_HEALTH_MAIL_ENABLED=false`. No marker hand-edit, FLUSHDB, permit/decision replay, or business-data write occurred.

Latest source probe (2026-10-10 19:42 CST): `.local/tmp/buff-source-monitor-db15-final-20261010-1938/state.json` is `probeHealthy=true` with `9/9` healthy sources. Buff `Template:GetBuffInfo` remains `changed=false` with current/previous/ingested hash `a512db8c...`; the four changed sources are Biome, Audio, Bosses, and Shimmer and do not trigger Buff ingestion. No new authorization or scheduler action is permitted from this probe.

Fresh continuation evidence (2026-10-10 20:54 CST): the isolated DB15 source probe `.local/tmp/buff-source-monitor-db15-continue-20261010T125030Z/state.json` is `probeHealthy=true` with `9/9` healthy sources and the same unchanged Buff fingerprint. Correct authenticated health path is `/api/actuator/health`; `.local/tmp/buff-db15-continue-preflight-20261010T1254Z-v2.json` (`sha256:27512b76cd109b4b5f321a19408fb81478628a79fc7c56a646b32b89b407ca57`) records HTTP `200` for health, automation, preflight, and overview, `enabled=false`, Buff canary `buff-page-immunity-refresh`, `liveAttempts/sweepClaims=0/0`, healthy reconciler, DB15 `PONG`, and epoch agreement. The first probe artifact used the wrong `/api/health` path and is diagnostic only; no runtime failure occurred. No authorization, permit, scheduler mutation, crawler dispatch, or business-table write was created.

Natural scheduler confirmation (2026-10-10 21:25 CST): `.local/tmp/buff-db15-natural-baseline-20261010T1305Z.json` and `.local/tmp/buff-db15-natural-post-20261010T1329Z.json` show the latest natural sweep completed at `2026-10-10T13:07:14.000Z`. Buff was detected with `changed=false`, `dispatched=[]`, and no live work. Across the observation window, local Buff/source rows stayed `388/380`, maint/relation/projection stayed `400/400/400`, Item-Buff stayed `15`, NPC-Buff stayed `1708` total / `1703` active, and Redis DB15 epoch/live index stayed unchanged. All 7 observation checks passed; no automatic Buff ingestion occurred.

Latest read-only continuation (2026-10-10 21:21 CST): explicit worktree-manifest probe `.local/tmp/buff-source-monitor-db15-continue-20261010T132109Z/state.json` (`sha256:849a36389ab9f567e7fe7c3fd84da7f56e59f571ce6cb16ebb0a1559b24d3aaa`) is `9/9` healthy. Buff `Template:GetBuffInfo` current, previous, and ingested fingerprints remain `a512db8c...` with `changed=false`; only four non-Buff sources changed. Authenticated Redis DB15 readback is `PONG`, epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b`, live attempts/claims `0/0`. No new authorization, packet, scheduler enablement, natural tick, or business-table write is justified.

Final read-only verification (2026-10-10 21:32 CST): Buff process `18105` environment confirms Redis DB15, scheduling enabled but scheduler control disabled, and cutover disabled; Armor remains on `18104`. Authenticated `/api/actuator/health`, `/api/admin/crawler-monitor/v2/automation`, `/api/admin/crawler-monitor/v2/automation/preflight`, and `/api/admin/crawler-monitor/overview` returned `200`; overview queue is empty and queue/reconciler health is `healthy`. Authenticated DB15 Redis returns `PONG`, epoch agreement, and live attempt/claim indexes `0/0`. `git diff --check` exits `0`; no paths are staged.

Retry-77 acceptance evidence is recorded in `.local/tmp/buff-automation-retry-77-post-window-readback-v2.json` (`sha256:cf7e30e0ba725389ef10d2464e848cf22da6bc89fce9f17ecbac2b1cb3316b46`): the one natural window completed at `2026-10-10T13:07:14Z` with Buff `changed=false` and `dispatched=[]`, scheduler was restored to `enabled=false`, and final API/SQL/Redis live work was `0/0/0`. The six serial L2 reauthorizations `retry-119` through `retry-124` (Armor, Buffs, Audio, Bosses, Projectiles, Shimmer) and scheduler decision `retry-77` are consumed once and must not be replayed.

Retry-74 is consumed and must not be replayed. Evidence `.local/tmp/buff-automation-retry-74-pre-enable-final-20261010T053213Z.json` passed `18/18`; `.local/tmp/buff-automation-retry-74-natural-tick-20261010T053306Z.json` records the blocked natural tick and authenticated disable. AUTH-04 reauthorization for the eight expired L2 decisions is deferred until a genuine Buff fingerprint delta exists; after that delta, refresh them serially with unique retry labels and decision identities, then rebuild scheduler authorization from a fresh Phase 0.

Retry-73 continuation cleared the stale readiness blocker by regenerating all 32 eight-domain acceptance panels at `2026-10-10T04:42:59Z`, then created the fresh preflight `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-73.preflight.json` (`preflightHash=sha256:23a11ceafec75b30dcea7e7c2c6a907825341021164d2d1bc88d05a1d1c31629`). The first authenticated attempt used an expired token (`401`); a new `0600` token was obtained through local login. A first report refresh used a future timestamp and was rejected by preflight; it was regenerated from current UTC before retry. Neither failed attempt wrote a preflight artifact or runtime state.

Historical retry-73 readback `.local/tmp/buff-automation-retry-73-phase0.json` (`sha256:14b00688e56f80cad801fa3e6093a5403fef16c32725a5e81b0db65faf563ea0`) passes `26/26` checks. The explicit worktree-manifest source probe is `.local/tmp/buff-source-monitor-retry-73-044355/state.json` (`sha256:712ae2f88a360064c5bd6a85c80f31604db06b1d64b03014a243653dd4417169`), with completed progress, `9/9` healthy sources, and Buff `changed=false` at `a512db8c...`. That run used DB16 before the DB15 correction; it is audit evidence only. No proposal, request, packet, permit, decision, scheduler mutation, crawler dispatch, or business-table write was created.

Historical DB16 Phase 0 readback: `.local/tmp/buff-automation-phase0-db16-20261010-rerun-v2.json` (`sha256:02bdf4b412e8fa9a0f689d9b2ca79f6d9dd10fbb678bec16fe7748e99585464e`). All checks passed before the DB15 correction; this artifact is retained for audit only and is not a current runtime target. No writes occurred.

Historical DB16 source probe: `.local/tmp/buff-source-monitor-db16-manifest-bound-20261010T042814Z-3078124/state.json` (`sha256:fa479aeff83852c8212b3996c7b74f7d13e4519643db6ba0f2f2c079aac8584a`), report SHA-256 `sha256:cfa1a2767472121ae57a407e68104407c2c6b193860f134483d461f12dbca8cf`. It is retained for audit only; the current DB15 probe is the source gate.

The historical DB16 namespace was verified from the API/fixed code contract as `terrapedia:crawler:wiki-monitor:v2:`. It is retained for audit only; active Buff runtime is DB15. Since the real Buff fingerprint is unchanged, no proposal, request, Owner packet, permit, decision, scheduler enablement, or natural tick was generated. Next: wait for an actual Buff fingerprint delta, rerun fresh Phase 0, then create one new request/packet for Owner approval and observe a bounded natural tick.

Historical 2026-10-10 DB16 source probe: `.local/tmp/buff-source-monitor-phase0-db16-20261010-105717-retry/state.json` (`sha256:6f01f86fc77e1993e9d79183b4b6099d38544db76c954ce34bfa3d9638971215`), retained for audit only. It observed no Buff change and created no runtime or business write.

Historical DB16 recovery evidence confirms DB16 `PONG`, engine `v2`, epoch `epoch-275d5cda-a966-4e6c-8e07-f69aac972d3f`, first mutation `2026-10-08T02:26:55.241138411Z`, live attempts `0`, and live sweep claims `0`. It is retained for audit only. The active Buff runtime is DB15 as recorded in the current DB15 focus above; DB14 remains Armor-owned. Only a real Buff fingerprint delta can justify a new scheduler request.

## Latest Resume Checkpoint

The entries below are historical checkpoints retained for traceability. The active runtime and next action are the DB15 facts at the top of this file; DB16 is not a Buff runtime target.

- Task 19 v2 Owner approval bound request hash `sha256:3e5be3b7ee01ba3b2238686e1139f2f1aaddfd3e0acec9254037e99fcf547576` and proposal hash `sha256:28fb8fb48e643169e71747f8287c6ad81b7c4e96ff97db11936acddf0ffbe15e`. After the transient MySQL outage, retry-03 regenerated the code-bound authorization, committed five soft retirements, independently read back the exact after-set, and released the fence. Result/journal are `COMPLETED`/`COMMITTED`; active relation count is `1703`; no further action is pending for Task 19. The repair and artifact hashes are recorded in the Task 19 audit addendum.

- Observed worktree/branch/HEAD: `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`, `feat/automation-domain-buff`, `0a23fab31914aa0a6d79779c758243d74f342f74`; no upstream, `0` staged, `50` tracked/indexed dirty entries, and `1284` untracked files at the 05:46 CST checkpoint. Existing dirty paths and generated runtime evidence are retained. This is the prepare-handoff checkpoint for later Buff automatic ingestion.
- Retry-68 evidence: decision identity `automation-crawler-v2-scheduler-activation-20261009-retry-68-admin-6512c9c7-afb5-439b-9ef1-d7d53c487351`, packet hash `sha256:47098eeb5834c3a689e5d82a16802e4f050adf06bd9d2b642bf818edf47d2b5b`, natural attempt `attempt-aa158c4f-3791-43b3-9c1b-6e7aadb912a4`, run `buffs_l1_auto_0b98f7575a54596d6c09357e800cbb55`. Source coverage and terminal progress completed; the owned-table run read back generations `6/6`, zero inserts/updates/relationship deletes, and zero classified/unauthorized mutations. Evidence: `.local/tmp/buff-backend-restart-soak-post-fence-release-readback-20261009.json` and `.local/tmp/buff-automatic-fence-release-20261009.json`.
- Retry-71 natural tick evidence: packet hash `sha256:0404d05290e1f92dfb0324fe56a4c48ffad55e392b7f22127d5fee4be2d888ee`; sweep checked at `2026-10-08T21:31:41.235627020Z`, source monitor completed with Buff `changed=false`, and no automatic attempt was dispatched. Disable response, post-disable preflight, restart preflight, and overview are `.local/tmp/buff-automation-retry-71-disable-response-20261009.json`, `.local/tmp/buff-automation-retry-71-post-disable-preflight-20261009.json`, `.local/tmp/buff-automation-retry-71-restart-preflight-20261009.json`, and `.local/tmp/buff-automation-retry-71-restart-overview-20261009.json`. The current source/manifest equality is recorded in `data/generated/source-update-monitor.latest.json`.
- Fresh Phase 0 evidence at 2026-10-09 07:24 CST is historical and used Redis DB14 before the domain split. The current runtime evidence is recorded below under the DB16 isolation checkpoint.
- Post-restart API preflight is HTTP `200`, scheduler `enabled=false`, unchanged H8 `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`, epoch `epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, namespace `terrapedia:crawler:wiki-monitor:v2:`, healthy reconciler, Redis DB14 `PONG`, live V2 attempt index `0`, and server `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`. The current Buff backend is PID `3320670`; Armor remains a separate session/worktree process. Actuator `health` is `503 DOWN` only because local SMTP credentials are empty (`MailHealthIndicator`); this is recorded as an environment warning, not a V2/API failure.
- Current chain readback is `local buffs/buff_source_items=388/380`, `maint/relation/projection=400/400/400`, `item_buff_relations=15`, `local npc_buff_relations=1270`, relation NPC rows `1708` total and `1703` active. Public/API checks show Buff `71 -> Item 1340` and Item `1341/1342 -> Buff 395`; public Buff `395` remains `404` because the 12 Buff identities are absent from local `buffs`. Relation compatibility reports Buffs `blocked` with 12 projection-only extras; this remains a separate follow-up.
- Task 16 audit: [Buff Item maint readiness](../audits/2026-10-06-buff-item-maint-readiness.md). Runtime artifact `.local/tmp/buff-item-maint-readiness-20261006-v3.json`, SHA-256 `sha256:3ae55341eb4655fd9387cb642c52e26c9aad65efa8ec983f942e4a5b9941bd8f`; thirteen unique Item dependencies have six exact maint matches, six missing maint rows, and one page/canonical spelling drift. Six previews preserve game IDs `6148/6149/6155/6161/6164/6173` with null landing/maint insert identities.
- Fresh authenticated preflight is HTTP `200`, disabled control, `0/0` live attempts/claims, healthy reconciler, unchanged H8/epoch. SELECT-only MySQL snapshots confirm unchanged server UUID/port and Buff counts `388/388/388/1290/0`. No business-table, scheduler/control, crawler, or packet/permit write occurred.
- Validation: new classifier `11/11`; related regression `99 pass / 1 existing skip / 0 fail`; Node syntax checks, exact artifact/code-hash assertions, and `git diff --check` pass. Full gate/browser suite not run for this diagnostic contract.
- Task 17 proposal/core artifact `.local/tmp/buff-item-maint-insert-proposal-20261006-v1.json` is read-only, `executable=false`, `applyAllowed=false`, `databaseWrites=false`; contract hash `sha256:b80c88374270561b6c22b942bb95cefb9a2875d7a045d712de96f466143a47e9`, artifact SHA-256 `sha256:7c8561f23abcbf918e9a26d69a4b2d174417189721d67c0167c37e05ab422785`. It binds a non-current `canonical.buff-item-dependency.<runId>` landing, exact six source IDs, six maint inserts, locked rederivation, exact baseline preservation, and uncertain-commit journal states. Fresh preflight remains HTTP `200`, disabled scheduler, `0/0` live work, healthy reconciler, unchanged H8/epoch; Buff counts remain `388/388/388/1290/0`.
- Task 18 registered `canonical-buff-item-maint-insert` with frozen source/proposal/code bundles, two distinct ownership predicates, immutable transaction and fence-hold journal outputs, and independent committed readback. The packet-validity review fix rechecks `authorizedAt`/`expiresAt` after locks, before permit consumption, immediately after permit consumption, and before COMMIT. Unknown COMMIT/ROLLBACK and failed readback now retain both fences at the maximum MySQL DATETIME deadline; confirmed rollback releases them only after terminal journal evidence, even if the packet has just expired. Focused maint/core/runner tests pass `33/33`; current governance/manifest/authorization tests pass `113/113`, Item-operation registration tests pass `3/3`; syntax and `git diff --check` pass.
- The draft proposal remains `AWAITING_SCOPE_CONFIRMATION`; that draft artifact and its historical evidence are read-only and produced no packet, permit, fence acquisition, hold, landing, maint, Redis, scheduler, relation, projection, or business-table write. The prior draft evidence `buff-item-maint-task18-draft-evidence-20261006-v2.json` predates the expiry/hold code changes and is historical only; the later authorized run uses its own fresh proposal, manifest, packet, and evidence bundle.
- Fresh read-only resume evidence `.local/tmp/buff-item-maint-task18-resume-evidence-20261006-v3.json` binds proposal `reports/authorization/canonical/canonical-buff-item-maint-insert.20261006-task18-resume-v3.proposal.json` (`sha256:d4a04e9130dd5439531249bf34aa2b93213c6d412b42559f7f639af1bcd2816c`) to the current source/code. It confirms server `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, attempts/reservations/fences `0/0/0`, exact source IDs `6148/6149/6155/6161/6164/6173`, and expected inserts `1/6`; its status remains `AWAITING_SCOPE_CONFIRMATION`, with `databaseWrites=false`.
- Authorized execution completed with decision `buff-item-maint-20261006-admin-01`, run `buff-items-20261006-task18-exec-v1`, and packet hash `sha256:1da203d2619affe02acde7a2e9195eaecf076b37ef89d501a88ae4cbef657139`. Result/readback artifacts are `reports/authorization/canonical/canonical-buff-item-maint-insert.20261006-task18-exec-v1.result.json` and `.readback.json`; landing `12546` is non-current and maint receipts are `6162/6163/6164/6165/6166/6167`. Independent SQL readback confirms `maint_items=6152`, `items_raw landing=2`, all six rows active/non-deleted and linked to the new landing; attempts/reservations/fences remain `0/0/0`. API preflight is HTTP 200 with scheduler disabled and reconciler healthy. No local Item, relation, projection, scheduler, or Redis business write occurred.
- Task 19's pre-Task-20 read-only candidate `.local/tmp/buff-insert-only-candidate-20261006-v2.json` (`sha256:b3b1232a21eabbbaaeb365bc369fd57a7df7d4d3f63b353b9a5e8d6895693af0`) remains historical evidence only. Task 20 subsequently completed the approved `389-400` zero-baseline/full-chain publication; the only unresolved source disposition is Item `1340` `FlaskOfVenom`/`FlaskofVenom` with conflicting `buffType` evidence.
- Task 17 focused contract/executor tests pass `20/20`; proposal replay passed with MySQL READ ONLY + rollback and API preflight before/after. No Item landing/maint row, packet, permit, Redis, scheduler, relation, projection, or Buff write occurred. Next gate is explicit registered operation/catalog and fresh packet/Owner/server/fence/permit; independent `1340`, NPC immunity, and Buff full-chain gates remain.
- Task 20 v13 completed the authorized Buff zero-baseline/full-chain publication as actor `admin`, preserving the explicit Item `1340` spelling drift disposition and deferring NPC-Buff secondary rows. Result [canonical-buff-full-chain.task20-zero-baseline-v13.result.json](../../reports/authorization/canonical/canonical-buff-full-chain.task20-zero-baseline-v13.result.json) is `completed`; journal is `COMMITTED`. Run ID is `buff-full-chain-20261006-task20-v13`, packet hash is `sha256:d32d489bce2d3dc1eec947b947a08115adbb29bb25d72472ade92835188b0473`, and execution-manifest hash is `sha256:291e3affc6657ca46d580eab9a1bdef9357fe97a7cf036931196eefe72b8e3a4`.
- Independent read-only MySQL readback on server `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306` confirms active `maint_buffs/relation_buffs/projection_buffs=400/400/400`, Buff IDs `389-400=12/12/12` in those layers, `item_buff_relations=14`, `npc_buff_relations=1290` with `0` new NPC-Buff rows, and live fences/attempts/reservations `0/0/0`. The envelope preserves `388` relation/projection rows and `1290` NPC-Buff rows; no deletes were planned.
- Final combined regression after the manifest fixture repair passed `303/303`: landing, full-chain, governance, recovery journal/store, transaction executor, canonical runner, Buff sync, authorization binding, authorization builder, execution manifest, and authorized-operation runner tests. The fixture now supplies the required `buffFullChainBinding`; no production behavior was changed by that test-only repair. `node --check` and `git diff --check` also pass.
- Buff follow-up candidate `.local/tmp/buff-npc-secondary-candidate-20261006-v1.json` is read-only and non-executable: it proposes `259` stable-ID `immune` rows for Buffs `389-394` and `396`, preserves the current `1290` NPC-Buff rows, and defers `114` display-only immunity facts. Candidate SHA-256 is `sha256:6c51c7be7b2c76a3d40ef01d1e15dbaa1659ea1252356f3003518340ba75d91e`; durable audit: [Buff NPC secondary candidate](../audits/2026-10-06-buff-npc-secondary-candidate.md). No packet, permit, fence, or database write was performed.
- Buff NPC secondary apply completed under the separate `canonical-buff-npc-secondary-apply` operation. The v3 candidate `.local/tmp/buff-npc-secondary-candidate-20261006-v3.json` is bound to proposal `reports/authorization/canonical/canonical-buff-npc-secondary-apply.20261006-admin-03.proposal.json` (`sha256:df4105412e20e875ad1378439bcf1ecb53d0552adef15b7d51c47d8989389df7`) and decision `canonical-buff-npc-secondary-apply-20261006-admin-03`; packet hash is `sha256:88db4061d7fac48d68d0e8f27339503ef7f8208f87054f75bae964f73b845bd1`. Result/journal are `COMPLETED`/`COMMITTED`; independent readback is `1290 -> 1549` with `259` new `immune` rows, after-set hash `sha256:a00f5d5c9c4c7c165e1fc2b2e4e997386becf2ae0c9567a2ed1bc096c77fbe55`, and active fences `0`. Two earlier attempts rolled back and were not replayed. Durable audit: [Buff NPC secondary apply](../audits/2026-10-06-buff-npc-secondary-apply.md). Focused governed regression passes `123/123`; `114` display-only facts remain deferred.
- A follow-up read-only identity discovery binds `94/114` previously deferred facts to unique revision-bound NPC page targets and active `maint_npcs` identities. The runtime artifact is `.local/tmp/buff-npc-secondary-identity-discovery-20261006-v1.json` (`sha256:1bfe882ff69fe1243d88b95d634a5bd53bed247a9d87190cabc852ae867f36f4`); durable audit: [Buff NPC secondary identity discovery](../audits/2026-10-06-buff-npc-secondary-identity-discovery.md). The remaining `20` facts are four multi-variant display names. This is evidence only (`networkRequests=0`, `databaseWrites=false`); the existing `259/114` runner scope cannot be reused.
- The v4 read-only scope candidate `.local/tmp/buff-npc-secondary-candidate-20261006-v4.json` (`sha256:8e9f9e7fa27ee2353d88b95d634a5bd53bed247a9d87190cabc852ae867f36f4`) rederives the `1549` active-row baseline and proposes `94` inserts with `20` ambiguous facts deferred. It is not accepted by the consumed runner and has no execution authority.
- Task 23 created a versioned `buff-npc-secondary-identity-scope/v1` binding so variable scopes cannot reuse the consumed `259/114` decision. The read-only proposal `reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.proposal.json` has SHA-256 `sha256:bd255f4fd5cf74f25e0500a33049e5494ac3cf63aa6ff862597637597b623378`, scope hash `sha256:e42faa66b1682b3de743e89034751fa51ebf76fe0f752c1e93c3960e52db301f`, and plans `1549 -> 1643` with `94` inserts and `20` deferred facts. The execution-manifest contract hash is `sha256:0055e1f1569b1d3aac406c988eb393d57dd9ab1644f91abe7a5b76b56e865070`; request `reports/authorization/canonical/canonical-buff-npc-secondary-apply.identity-scope-94.request.json` is `AWAITING_OWNER` with request hash `sha256:c344998a2bac901f4440783fe3813d1c41fbf1116e16bd5f2173a3c8f6d92d09` and expires `2026-10-07T09:43:58.422Z`. Focused candidate/apply/runner tests pass `6/6`; syntax and `git diff --check` pass. No packet, permit, runtime fence acquisition, journal, result, or database write exists for this scope.
- Task 24 applied the exact `identity-scope-94` request as `admin` under decision `canonical-buff-npc-secondary-apply-20261006-identity-scope-94-admin-01`. Packet hash is `sha256:b9052970347908fb9550a3a4a4612e587f80ef587b992c3c7e1add0c50f552e4`; journal is `COMMITTED`; result is `completed` with `94` inserts. Independent readback proves `1549 -> 1643`, after-set hash `sha256:2963edba59eae3cf11711bb145ffe1d4e60e8efc8419c371bee0d78c6cdd1e31`, `94/94` present, zero missing/wrong/duplicate keys, and live attempts/reservations/fences `0/0/0`. The `20` shared-name variants remain deferred. Durable audit: [Buff NPC secondary identity scope 94](../audits/2026-10-06-buff-npc-secondary-identity-scope-94.md).
- Task 25 generated the read-only Item `1340` source disposition request. Proposal `reports/authorization/canonical/canonical-buff-item-1340-source-disposition.20261006-v1.proposal.json` has hash `sha256:24ab8cbb38b5aab98b47eccf412f92f2e87bc2928a6d878dad78be3d216c67ab`; request hash is `sha256:e05ace819b1fd0ca565df5f9d326def0a108e111798b7d0c744aac151c923995`. Iteminfo binds `1340/FlaskofVenom` to `buffType=71`, while the Buff `395` page uses `FlaskOfVenom`; the recommended disposition is `defer-semantic-conflict`. No Item-Buff row, packet, permit, fence, or source rewrite was created. Durable audit: [Buff Item 1340 source disposition](../audits/2026-10-06-buff-item-1340-source-disposition.md).
- Task 34 supersedes that prior deferral for the corrected semantic ownership. The failing-first fetch regression now proves complete Iteminfo `buffType` ownership overrides a conflicting Buff-page item row; the Buff fetch/relation/automation suite passes `422/422`. A read-only correction candidate has four bounded changes: one Buff 395 relation update, one `(1340,71)` `item_buff_relations` insert, and two projection updates. Candidate hash is `sha256:dc500963e7722d1f368fb8fe1a7fae1e2a756f0e993f1409ab9faed8263431af`; source candidate file hash is `sha256:0f8bbd19c9e994451e56c939a7cd7da2992a33a832fd5ad6d97653730873145b`.
- Task 34 exact Owner request is `reports/authorization/canonical/canonical-buff-full-chain.item-1340-ownership-correction-20261007-v1.request.json`, request hash `sha256:dc8e8ca5aac462485a18ed973092bb6843e57fbe34d4a336e13ab51c45c58785`; proposal is `reports/authorization/canonical/canonical-buff-full-chain.item-1340-ownership-correction-20261007-v1.proposal.json`, file hash `sha256:98f3d9b0057bad224b73d4c6660f406bb4ce342f9ae46a19a6a5f955b6a1aba7`. Manifest hash is `sha256:6e6e4c089e7942a2ed27a9418a087e3e8dbf272eaaaceffc96700ff642a05c79`; the approved request was applied as decision `canonical-buff-full-chain-item-1340-ownership-correction-20261007-admin-01`. Packet hash is `sha256:5876a2e7162a04bfc53c1aa12d1bdde9570e384e8bff6377f7e1dcfb45efa392`; permit hash is `sha256:fbc3c97207d1b42b14ec13fd632924bac70cea6d74599cb131549be4ec834014`; result/journal are `COMPLETED`/`COMMITTED`. Independent readback `.local/tmp/buff-source-correction-independent-readback-20261007-v1.json` (SHA-256 `sha256:46a7f3e0c21c10df9eab9b5e00eb9ea0885b40303530d692ed868916e5543cf6`) confirms Buff 71 has only Item 1340, Buff 395 has only Items 1341/1342, `(1340,71)` exists exactly once, `(1340,395)` is absent, and active counts are `400/400/15/1703` for relation Buffs/projection Buffs/Item-Buff/NPC-Buff. The fence is released; active fences are `0`.
- Post-Task-34 source-chain review found a remaining mismatch outside the consumed scope: `terria_v1_maint.maint_buffs.id=419` (`source_id=395`) still has `major_value=3` and `raw_json.sourceItems` containing `FlaskOfVenom`/Item `1340`, while relation/projection carry the corrected two-item set. `buildBuffEntityRelations` mirrors `maint_buffs.raw_json`, so a future broad maint-to-relation sync could reintroduce `(1340,395)`. No repair was attempted because Task 34's exact owner reason excluded landing/maint writes. A new source/maint-bound proposal and approval are required; Task 34 authorization cannot be reused.
- The same source-layer review found provenance drift: the current 395 relation/projection source-item entries retain legacy `buff-page-causes` markers, and the preserved 71 evidence does not carry the Iteminfo semantic capture. A future source-layer correction should regenerate 71/395 from the verified complete Iteminfo scope (`iteminfo-revision-bound`) instead of only changing counts and membership.
- Owner approved the Item `1340` disposition as `defer-semantic-conflict`, actor `admin`, authorization reference `buff-item-1340-review-20261006`, and decision identity `canonical-buff-item-1340-source-disposition-20261006-admin-01`. The create-only owner-input and decision records bind the exact proposal/request hashes without modifying the original `AWAITING_OWNER` request. The `(1340,395)` Item-Buff row remains absent; no packet, permit, fence, SQL write, or payload rewrite was generated. The `20` shared-name NPC variants remain deferred. Durable audit: [Buff Item 1340 source disposition](../audits/2026-10-06-buff-item-1340-source-disposition.md).
- Task 28 prepared a new read-only revision-bound variant scope for the four former shared-name groups. Npcinfo revision `1022313` plus its semantic expansion proves `65` stable-ID facts for Buffs `395/397/398/399/400` (Lunatic Cultist `439/440`, Martian Saucer `392/395`, Phantasm Dragon `454-459`, The Destroyer `134-136`). Candidate `.local/tmp/buff-npc-secondary-candidate-20261006-v5.json` has file SHA-256 `sha256:99e1ea9f8b165cc4b3a013940e853c49a959362f353a0e8be17036500a37c75e`; proposal `reports/authorization/canonical/canonical-buff-npc-secondary-apply.variant-scope-65.proposal.json` has SHA-256 `sha256:88aa18f3701e3eda37be2bc510225bd1828c8fada81856ba7d25afae81fb66d9`; request hash is `sha256:fa106bdaa793c565358c8d4783b7c80f7f507f10698ffe0a25f169347f331cd3`. It planned `1643 -> 1708`, with `65` inserts and `0` deferred. The original packet admission failed before fence acquisition with no business write; retry-02 completed the same scope. Durable audit: [Buff NPC secondary variant scope 65](../audits/2026-10-06-buff-npc-secondary-variant-scope-65.md).
- Task 29 completed the approved variant scope on retry-02. Retry request hash is `sha256:6f43c9bf074c52a5f800376ccdf27517b91fc005acb9d424059739d01a14c0a5`, packet hash `sha256:ae5a7af6775bb2483fa2ffcc6e9b9bc41e15ab5b66c1b1cd39805dc9192f2393`, and execution-manifest hash `sha256:0d42045e8e455ffd4978757ff187c7be7d39961faac592f9da74f2d7313b7619`. Result/journal are `COMPLETED`/`COMMITTED` with `65` inserts. Independent readback `.local/tmp/buff-npc-secondary-independent-readback-20261007-variant-scope-65-retry-02.json` confirms exact after-set `1708`, after hash `sha256:dbc0834c1df54ac24404fd1a2b57799b07196970f6b0f67cea69f70232e3a1c2`, `65/65` present, zero missing/wrong/duplicate, and final fences/attempts/reservations `0/0/0`; Redis DB14 is `PONG`. The retry decision is consumed once and no permit remains.
- The Item maint recovery-hold review found an unknown hold-transaction commit path that could leave finite-TTL fences if the hold transaction actually rolled back. A failing TTL/competing-acquisition test was added, then the runner gained an independent reconciliation callback, a `FENCE_HOLD_RECONCILED` journal phase, and per-fence authorization rechecks. The complete changed-surface Item/governance suite passes `189/189`; the Buff-only sweep passes `498/498` after excluding the pre-existing backfill test that cannot load `mysql2/promise` in this worktree. Node syntax checks and `git diff --check` pass; no runtime state or business data was changed. P1 is closed for this recovery path. Remaining P2 is environmental/integration follow-up only: install the missing dependency and rerun the excluded backfill test plus any broader repository gate.
- Task 30 fresh read-only Buff snapshot on MySQL `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306` confirms maint/relation/projection `400/400/400`, IDs `389-400` `12/12/12`, Item-Buff `14`, NPC-Buff `1708` (`immune=1559`, `inflicts=149`), and active fences `0`. Five duplicate inflicts pairs collapse to `144` distinct NPC/Buff/type identities; four are absent from current maint source lists, and one Queen Bee pair also appears twice upstream. Public Buff output counts returned relation rows, so it exposes these duplicates. Audit: [Buff runtime state after NPC secondary applies](../audits/2026-10-07-buff-runtime-state-after-npc-applies.md). The `403/403` Buff fetch/relation/authorization suite and `git diff --check` pass. No writes occurred; duplicate cleanup remains separately gated.
- Task 31 adds a source-generation guard: identical resolved NPC/Buff/effect facts now produce one relation while distinct effects remain separate. Existing source-order `record_key` values stay stable for sync matching. The focused processor suite passes `13/13`; the Buff fetch/relation/authorization suite passes `403/403`; syntax checks pass. Existing runtime rows were not changed. The five legacy duplicate pairs still need source/data disposition and a separate governed cleanup; Item `1340` remains deferred. The audit above records the generation behavior and no-write boundary.

## Historical DB15 runtime checkpoint - 2026-10-10 14:12 CST

- The stale DB16 listener was stopped after read-only confirmation of its wrong Redis assignment and `409 FIRST_MUTATION_OUTCOME_UNCERTAIN` response. No DB16 cleanup or replay was performed.
- Fresh managed restart evidence is `.local/tmp/buff-db15-managed-restart-preflight-20261010T061042174Z.json`: two HTTP 200 samples, DB15 process environment, disabled Buff control, zero live attempts/claims, healthy reconciler, and marker/Redis epoch agreement.

This was an interim runtime reassignment. Later user direction and the current recovery target reserve Buff for DB16; do not restart Buff on DB15.

## Superseded DB16 recovery continuation - 2026-10-10 14:24 CST

- Current runtime inspection found only Armor's JVM on `18104/DB14`; no process listens on Buff port `18105`. DB16 Redis is reachable with `engine=v2`, epoch `epoch-275d5cda-a966-4e6c-8e07-f69aac972d3f`, and existing reset record `buff-db16-forward-repair-20261009T054100Z`. No DB14 Redis command was issued in this continuation.
- The durable marker still has the interim DB15 epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b` while retaining the irreversible first-mutation timestamp. Reuse the existing DB16 reset identity and verify its returned epoch; never create a third epoch or manually edit the marker.
- Pending: build current backend, start only Buff at `18105/DB16`, perform authenticated idempotent recovery, verify marker/API/Redis agreement, scheduler disabled and zero live work/fences, then refresh Phase 0 and continue AUTH-04 decisions serially. Natural source change and data-visible ingestion remain unproven.

## Open work

- Owner: Codex coordinator, deferred Buff source-contract follow-ups and any newly scoped work.
- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`.
- Active entry: [Buff automation domain continuation](entries/2026-09-29-automation-domain-buff.md), `active`; parent plan is `docs/superpowers/plans/2026-09-30-buff-relation-no-loss.md`.
- Task 19 v2 is closed with independent readback; no further action is pending for that exact five-row scope. Do not approve or replay Task 19 v1. Task 20's `389-400` zero-baseline/full-chain publication and Task 34's Item `1340` semantic correction are complete. Remaining Buff work is limited to separately scoped follow-ups; do not reuse the consumed Task 19 or Task 34 decisions.
- The v5 Buff source-layer correction is complete under the exact Owner approval. Independent readback `.local/tmp/buff-source-layer-independent-readback-20261008-v5.json` confirms landing/current source hash `6893c2c8...`, maint/relation/projection source items `[1340]` for Buff 71 and `[1341,1342]` for Buff 395, Item-Buff `1340 -> 71` only, active counts `400/400/400/15/1703`, and correction fence `0`. The v5 decision is consumed once; do not replay it.
- Handoff next action: after a real Buff source fingerprint change and repaired source-readiness/manifest evidence, perform a fresh read-only Phase 0/preflight for the scheduler-owned Buff automatic path on Redis DB15, including current server UUID/port, V2 epoch/namespace, policy H8, source readiness, Buff operation/code bundle hashes, owner state, live attempts/claims, and active fences. Then determine whether a new scheduler request/Owner packet is needed. Do not use the consumed v5 source-layer decision or any historical scheduler decision. Keep scheduler control disabled until the fresh authorization and natural-tick gates pass.
- Handoff acceptance boundary: the v5 one-shot full-chain write is complete, but automatic-ingestion acceptance is still unknown/not complete. A future session must prove a scheduler natural tick, a real nonzero Buff-owned change through landing -> maint -> relation/projection -> API/readback, terminal reconciliation, and the required multi-cycle/expiry/restart soak before claiming unattended automation.
- Branch matrix context: [automation domain worktree matrix](entries/2026-09-29-automation-domain-worktree-matrix.md); other domain branches remain separate context and are not modified here.
- Separate-session context only: Armor entries [source semantics](entries/2026-09-28-armor-source-semantics-continuation.md), [image continuation](entries/2026-09-27-armor-image-cache-continuation.md), and [secondary projections](entries/2026-09-26-armor-secondary-projection-continuation.md) remain active in the other session's worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`, branch `feat/automation-domain-armor`; they are not owned by or modified from this Buff worktree.
- Authority: [standing register](entries/2026-09-19-automation-scheduler-authorization-list.md); approved scoped implementation/registration and fresh serial execution, subject to technical gates.
- Plan: `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md` (A2–A6, B1, S1, then M/D/S acceptance).
- Contract handoff: H8 `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`, Buff V2 epoch `epoch-ecad0546-cc45-40f7-b374-a115e4b3067b`, namespace `terrapedia:crawler:wiki-monitor:v2:`, Redis DB15. Armor independently owns DB14 and epoch `epoch-29a8486b-b3df-45a7-a496-28286e5da91b`; DB16 retains historical epoch `epoch-275d5cda-a966-4e6c-8e07-f69aac972d3f` and is not a Buff runtime target.
- Latest bounded Buff new-ID source capture completed read-only for IDs `395` and `397–400` after authenticated preflight `.local/tmp/buff-new-id-preflight-20261005T130518Z.json` (HTTP `200`, scheduler disabled, live attempts/claims `0/0`, healthy reconciler). Capture `.local/tmp/buff-new-id-page-capture-20261005T130604Z/` reached terminal `completed` across four revision-bound raw pages. The superseded v3 diagnostic found zero direct infliction facts; current scope contract v3 proves all 68 shared-page variants `variant-owned-complete-empty`. Derived diagnostic `.local/tmp/buff-new-id-insert-contract-diagnostic-20261005-v4.json` (`sha256:89a5ad5316b4bfcfb3a20b6844c5d47237c467a40cae4b071cd5e42559b8258a`) reports `12/12` normalized, complete source-item/infliction/immunity groups, and zero preserved groups. Postflight `.local/tmp/buff-new-id-postflight-20261005T132537Z.json` reconfirms scheduler disabled, live attempts/claims `0/0`, and a healthy reconciler. No landing/maint/relation/projection candidate, owner decision, or database write is authorized.
- Read-only insert-only candidate `.local/tmp/buff-insert-only-candidate-20261005-v1.json` is `status=blocked`, `executable=false`, `applyAllowed=false`, and `databaseWrites=false` (SHA-256 `sha256:203ea633d0a845f5b424b1b89cbb13fd87a9d366024dc7ac0ca36ee9e9decf45`; contract `sha256:71cd963be35b18412b5c1258b7eec38b58bede6f1c1382e735c13af10ffdc6dd`). It binds deferred landing/maint insert plans for exactly `389–400`, proposes relation/projection inserts while preserving the current `2454` downstream rows, and records six item secondary candidates. Nine source-item identity issues remain and no NPC-Buff secondary rows are publishable; durable findings are in `docs/audits/2026-10-05-buff-new-id-insert-candidate.md`. No owner packet, permit, scheduler, Redis, landing, maint, relation, projection, or database write was performed.
- New read-only lineage audit `.local/tmp/buff-secondary-identity-lineage-audit-20261005-v1.json` (`sha256:4282ef4723d06812867918458ef2bc7793d3a944294f66156be0ce578e6d9a99`) proves all 15 source-item facts have stable Iteminfo IDs. Missing `maint_items` identities are now narrowed to `6148`, `6149`, `6155`, `6161`, `6164`, and `6173`; ID `1340` is present but has `FlaskOfVenom`/`FlaskofVenom` source-name drift requiring owner review. Npcinfo binds 259/373 immunity facts; 114 remain display-only without stable NPC IDs. The pure resolver/test is `pipelines/relation/buff-secondary-identity-lineage.mjs` with `4/4` focused tests. This narrows diagnosis only; the candidate remains blocked and no NPC secondary insert path or database write was added. Durable audit: `docs/audits/2026-10-05-buff-secondary-identity-lineage.md`.

- Runtime handoff at 2026-10-10 12:35 CST: MySQL is available; Armor is running on `18104/DB14`, Buff on `18105/DB16`; scheduler control is disabled and reconciler healthy. Fresh readback and probe evidence are summarized above. Older outage and Armor-canary observations below are historical checkpoints and are superseded by the 2026-10-10 12:35 CST runtime evidence.
- Fresh AUTH-04 L2 reauthorization retry-46 through retry-50 completed serially through `run-authorized-canonical-operation.mjs`: Armor Sets `2026-10-05T12:08:56.808Z`, Buffs `2026-10-05T12:14:23.480Z`, Audio `2026-10-05T12:21:39.683Z`, Bosses `2026-10-05T12:22:33.735Z`, and Shimmer `2026-10-05T12:23:23.760Z`. Packet hashes are Armor Sets `sha256:a58c9ef1380a300a6ab8f1144893866e74e55e318a985daaf863e96efe89666f`, Buffs `sha256:a5998814f06755d83f74383e8e86f981ea1121670f1e4ebce40567e612cbbb2d`, Audio `sha256:de192c4210475b2ab23ea5c62f40913ed51a599794ef0a1ae4662456f2a22eb0`, Bosses `sha256:2705555f512b57a074d847909730b92f12361d9e5b15364106cc2198f8ef6ef7`, and Shimmer `sha256:f18c219951adbb89a6248f90b84bcf59d6db37e194bdf17ce121bd4601e7dca8`. Each result has a `pending` result plus an authoritative committed marker, and all five identities are consumed in `reports/authorization/canonical/used-decisions.json`.
- The fresh authenticated preflight `.local/tmp/l2-reauth-preflight-20261005-retry50-20261005T122701Z.json` returned HTTP `200` with scheduler `enabled=false`, live attempts/claims `0/0`, healthy reconciler, epoch `epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, and unchanged H8. Read-only aggregate readback `.local/tmp/l2-reauth-readback-20261005-retry46-50-20261005T123228Z.json` confirms five matching MySQL `L2_PROMOTION` rows, server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, active attempts/reservations/fences `0/0/0`, Redis DB14 `PONG`/engine `v2`, the same epoch, and an absent live-attempt index. No scheduler, crawler, Redis, landing, maint, relation, projection, or business-table write was performed by this phase.
- Scheduler activation proposal `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-48.proposal.json` is proposal-only with proposal hash `sha256:f02fc2b20a04c519d61e6ba768401b664ae8da8ff20edd2b72dc01d7c41e10a3`; its request is `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-48.request.json` with request hash `sha256:16f1a08c61c230c09fdc90ab7c9650d8669c1e913618eca310961c9707ac8ed7`, `AWAITING_OWNER`, and null owner fields. No packet, permit, decision, scheduler control write, or crawler/data write exists.
- Retry-56 scheduler activation used fresh proposal/request/manifest/packet artifacts and a new decision identity `automation-crawler-v2-scheduler-activation-20261005-standing-npcs-56-ddf76e82-7b99-4e75-b63a-8e62d84a5cf1`; packet hash is `sha256:5380ea90426af07cb77c9d3276dc3db1aa9f8635d74b937e0562c6d791e3a278`. Retry-53 was not replayed because all eight source hashes changed when fresh report bytes were generated. Governed execution inserted exactly one MySQL `SCHEDULER_ACTIVATION` decision and consumed the retry-56 identity in `used-decisions.json`.
- Retry-56 natural tick was observed at `2026-10-05T09:36:11.498667770Z`: source monitor ran to terminal `completed`, but the scheduler sweep recorded `status=error`, `reason=source_update_check_failed`, with `detected=[]` and `dispatched=[]`. No crawler attempt was created. Authenticated disabled readback is `.local/tmp/buff-automation-scheduler-disable-retry-56.json`; final epoch/H8/reconciler remained unchanged and live attempts/claims were `0/0`. No manual sweep or direct Redis write occurred.
- Retry-57 canonical preflight `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-57.preflight.json` has internal hash `sha256:8e8a2a9147c7500e495c4dccbf09434af8b650a0511ec20d58645b8e7baa9029`; all eight source-readiness reports were `eligible` at `2026-10-05T09:55:16Z`. Governed result `reports/authorization/canonical/automation-crawler-v2-scheduler-activation.retry-57.result.json` is `completed` for decision identity `automation-crawler-v2-scheduler-activation-20261005-standing-npcs-57-2a1f6c2e-8d3b-4cc3-ae19-6e1cf8e9a7d4`; packet hash is `sha256:a5cd458d4e35b0002cfce1280c41d661e8f9af586b308735df21c2a47bec2b98`. MySQL has exactly one matching decision row and `used-decisions.json` has one consumption entry. Fresh pre-enable checks at `2026-10-05T10:37:42.996Z` matched H8, epoch, namespace, queue contract, disabled control, `0/0` live attempts/claims, and a healthy reconciler.
- Retry-57 enabled one authenticated `wiki-npcs-refresh` canary at `2026-10-05T10:37:43.002Z`. The natural tick at `2026-10-05T10:38:24.669Z` was `status=blocked`, `reason=scheduler_activation_required`, `reasons=[L2_PROMOTION_DECISION_STALE]`, with `detected=[]` and `dispatched=[]`; no crawler attempt was created. It was restored disabled at `2026-10-05T10:38:25.188Z`; final preflight kept epoch/H8 unchanged, `0/0` live attempts/claims, and a healthy reconciler. Evidence: `.local/tmp/buff-automation-scheduler-canary-retry-57-20261005T103742Z.json`. MySQL readback reports active attempts/reservations/fences `0/0/0`; Redis DB14 has no live-attempt index and only terminal attempt records.
- Owner authorization: Task 15 v12 completed the manifest-bound additive relation lane as actor `admin` with decision identity `buff-additive-relation-20261004-admin-08`; the single-use decision is consumed, and active fences are `0`.
- Latest serial automation actions: Items retry-31 and Projectiles retry-32 L2 reauthorizations completed at `2026-10-05T07:54:28.427Z` and `2026-10-05T08:00:44.338Z` under H8 `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`; both have unique MySQL decisions, three predecessor L1 runs, and no live attempts/reservations/fences. Fresh historical dispositions are Items `.../items/2e8bed7d8007e949d49c0a2d565e81061ad67dac36493d6db33c6131a34886c0/disposition.json` and Projectiles `.../projectiles/c79e259045a3872166fbf92b094f05a4cf467251a7252bf9ae0f177ed7a5905e/disposition.json`. Retry-29 and retry-30 remain unconsumed; retry-30 was abandoned for a worktree evidence-root binding.

## Latest Task 15 execution

- v12 result `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261004-task15-authorization-v12.result.json` is `COMPLETED`; its journal is `COMMITTED` with `prepared -> committed`, and the after-set hash matches the proposal.
- MySQL readback confirms relation and projection Buff `37` each contain `WallofFlesh (113)`, the reverse table contains `113 -> 37, inflicts`, and `/api/public/buffs/37` reports `inflictingNpcCount: 1`.
- The executor canonicalizes only known database-generated snapshot representations and the Buff journal permits a valid direct `PREPARED -> COMMITTED` transition. Focused relation/recovery/full-chain/sync tests pass `117/117`; authorization/manifest/runner tests pass `141/141`; syntax and whitespace checks pass.
- v10 and v11 failed closed before commit; v12 committed SQL before the journal-transition defect was exposed. Post-commit readback matched the exact proposal after-set, then repaired journal/result evidence without replaying SQL.
- Crawler V2 state-store recovery is complete; scheduler remains disabled. Landing, maint, general Buff ingestion, and unresolved variant/new-ID replacement remain blocked and were not touched by this relation-only lane.

## Variant empty-scope evidence checkpoint — 2026-10-05

- Added the pure `buff-npc-variant-empty-scope-evidence` builder and strict
  contract validation. It binds stable NPC identity, requested/resolved page,
  page/revision identity, raw/capture SHA-256 values, complete parsed field
  names, and an explicit empty `debuffFieldNames` list. Page-wide positive
  debuff owners are diagnostics only; incomplete or ambiguous target blocks
  stay unknown.
- Read-only replay of the frozen 511-target/443-raw-page capture inspected all
  68 shared-page gaps. The v2 artifact
  `.local/tmp/buff-npc-variant-empty-scope-evidence-20261005-v2.json` has file
  SHA-256 `sha256:9831c6201e92d719b3a17c864bb4c2497440889ec1c1b02862152291c19dbff4`;
  all 68 rows are `variant-owned-complete-empty`. Retinazer `125` is certified
  only because all three complete `auto=125` blocks on the bound The Twins
  revision are empty; no block is selected and no positive fact is copied.
- Scope-contract replay remains `executable=false`, `applyAllowed=false`, and
  `databaseWrites=false`; Buff IDs `389–400` remain missing-baseline. Scheduler,
  crawler, landing, maint, relation, projection, Redis, and database writes
  remain disabled. Audit:
  `docs/audits/2026-10-05-buff-variant-repeated-id-empty-scope.md`.
- Focused evidence/scope tests are `16/16`; the required page/verifier suite is
  `36/36`, the maintained NPC parser suite is `36/36`, and the combined Buff/
  NPC/parser/relation regression is `448/448`. New and touched `.mjs` files
  pass `node --check`, and `git diff --check` passes.

## Variant empty-scope candidate checkpoint — 2026-10-05

- Added the pure read-only candidate builder
  `pipelines/relation/buff-npc-variant-empty-scope-candidate.mjs` and focused
  regressions. It requires exact stable NPC identity, complete-empty
  replacement eligibility, a read-only scope contract, and the unchanged
  `389–400` missing-baseline fence. Unknown and display-only facts are
  preserved; relation/projection target scope drift fails closed.
- Fresh MySQL read-only baseline replay covered 388 active relation Buff rows,
  388 active projection Buff rows, and 1,290 active NPC-Buff rows. Candidate
  `.local/tmp/buff-variant-empty-scope-candidate-20261005-v4.json`
  (`sha256:6d38ae21c05b540a89db0dd12d3f427055b3dbe160728103b76b7c92f61cf403`)
  identifies 10 exact reverse `inflicts` retirements, zero relation/projection
  JSON updates, zero inserts, and zero database writes. The unkeyed display-only
  `Slimer` fact remains diagnostic and is not removed by name.
- Durable audit: `docs/audits/2026-10-05-buff-variant-repeated-id-empty-scope.md`.
  The preview remains non-executable and has no scheduler, Redis, landing,
  maint, relation, projection, packet, permit, or database side effect.
- Validation: candidate tests `6/6`, candidate syntax check, frozen replay,
  and `git diff --check` pass. Canonical ingestion remains blocked by the
  missing Buff baselines `389–400`, and the independent owner/full-chain gates.

## Buff checkpoint and next action

- Revision-bound Buff source composition now keeps NPC-page positive `inflicts`
  facts separate from Buff immunity, and the partial-fact plan preserves
  unknown `sourceItems`/`inflictingNpcs` groups against the active baseline.
- Corrected offline replay `.local/tmp/buff-partial-contract-replay-20261001-v4.json`
  directly reads relation baseline fact columns; it reports 388 partial
  plans and `400 parsed / 0 unknown` applicability. Its `33/400` normalizer
  admission is historical, before the complete Iteminfo semantic source.
  The full-chain partial-fact fence remains active.
- v6 diagnostic grouping showed 365 records fail strict normalization on
  `sourceItems`, and two fail on `immuneNpcs,sourceItems`; no empty source-item
  list was inferred.
- The bounded Iteminfo semantic capture
  `.local/tmp/buff-iteminfo-semantic-capture-20261001-v2/` is now verified:
  three revision-bound pages produce 249 positive assertions across 167 Buffs
  and 233 complete-scope empty groups. The source-item group is now replaceable
  in the read-only partial contract; missing item rows are no longer the active
  strict-normalizer bottleneck.
- Replay `.local/tmp/buff-partial-contract-replay-20261001-v9.json` reports
  `388` baseline-bound plans, all `388` source-item and immunity replacements,
  `360` preserved inflicting-NPC groups, and `400/400` strict normalizer
  admission. The target-mismatch immunity alternate is now accepted only when
  independently complete; twelve new IDs `389–400` still have no historical
  baseline.
- NPC-page continuation now strips numeric debuff suffixes while retaining raw
  evidence, ignores HTML-comment pipes, merges repeated stable auto IDs without
  display-name loss, and preserves per-fact page/revision identity. The current
  verifier `.local/tmp/buff-npc-infliction-verified-20261002-v4.json` has SHA-256
  `sha256:f8a8b9e7f721b9b976c8c335bd9cbc654a7ea25b65b91bb325b3fe7d96a61923`;
  it covers 112 positive facts and 70 unresolved shared-page variant gaps across
  511 target pages, 443 unique raw pages, 753 page-backed NPC rows, and 9
  explicit exclusions, with raw-hash-bound `factSources` descriptors.
- Latest read-only replay `.local/tmp/buff-partial-contract-replay-20261002-v19.json`
  has SHA-256
  `sha256:042af9250675b17073bd5a77c7373370dcd93edd16b8be01bec9ba9d5f17debb`;
  it retains `112/112` NPC facts, has `400/400` strict normalizer admission and
  388 baseline-bound plans, preserves 360 inflicting groups, and adds six
  revision-bound positive facts to six expected-preservation groups. Buff `37`
  carries `WallofFlesh (113) -> Horrified (37)` as an additive candidate fact;
  the plan remains non-executable and IDs `389–400` still have no baseline.
- The complete NPC-page verifier now emits raw-hash-bound `factSources`, and
  additive stable-identity collisions or missing active reverse relation rows
  fail closed. A unique unkeyed named top-level infobox is now bound to its
  primary entity only when no ambiguity exists; ambiguous rows still fail
  closed. Verifier `.local/tmp/buff-npc-infliction-verified-20261003-v7.json`
  has 114 facts and 68 unresolved gaps; replay
  `.local/tmp/buff-partial-contract-replay-20261003-v20.json` retains 114/114
  facts. Current continuation page/verifier tests are `24/24`, the full
  Buff/NPC/parser/relation set is `370/370`; all touched modules pass
  `node --check` and `git diff --check`. Canonical ingestion remains blocked.
- Governed additive relation lane now has a read-only proposal for the verified
  positive facts. After accepting legacy infliction JSON with `internalName`
  but no numeric NPC ID, focused additive tests pass `9/9`. Proposal
  `reports/authorization/canonical/canonical-buff-additive-relation-apply.20261003-wall-of-flesh.proposal.json`
  has SHA-256
  `sha256:bf72e9aade7057e273a3ff0f4c02b6df317898324d3ae59408aa9cdb042124fd`;
  it contains 114 facts across 30 existing Buff baselines, 19 relation updates,
  20 reverse `inflicts` inserts, and 30 projection updates. Wall of Flesh
  `113 -> 37` is included exactly once, Buff IDs `389–400` are absent, and no
  immutable fact group changes. The proposal remains
  `executable=false/applyAllowed=false/databaseWrites=false`; no packet,
  permit, or database write was executed.
- Task 15 now gates additive apply behind an authorized canonical write
  manifest while preserving the proposal's read-only flags. The runner checks
  exact operation, ownership keys, artifact paths, proposal bundle hash, and
  relation-only target scope before opening MySQL. The authorization resolver
  now binds the additive proposal into `dataBundleEntries` (previously it
  returned an empty bundle). Focused authorization/additive/manifest tests
  pass `126/126`; the broad Buff/NPC/parser/relation/auth suite passes
  `494/494` when the dependency-missing backfill test is excluded; the fresh
  read-only proposal is unchanged at SHA-256
  `sha256:bf72e9aade7057e273a3ff0f4c02b6df317898324d3ae59408aa9cdb042124fd`.
  The prior v3 request expired and the first v4 request was superseded after a
  read-only policy capture found global policy drift. Current Task 15 artifacts
  use `20261004-task15-authorization-v5`; request hash is
  `sha256:a44af8f1ffcc67857a169c4eb30569d991992c2265f37ebad98cd08ef557596d`
  with expiry `2026-10-04T16:50:54.229Z`, current full policy hash
  `sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
  and exactly one proposal data-bundle entry matching the proposal hash.
  Historical v5 runtime readback was server UUID
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, zero live
  attempts/reservations, active owner `admin`, and zero active write fences;
  it found no `WallofFlesh (113)` entry before v12. The v12 result above is the
  authoritative post-apply readback.
- Added variant-immunity regression coverage. The Npcinfo verifier preserves
  same-display-name NPCs by stable ID and `internalName`; a synthetic
  `LavaSlime`/`JungleSlime` fixture with different `buffImmune` sets passes.
  Read-only audit `docs/audits/2026-10-03-buff-npc-variant-immunity.md` binds
  revision `1022313` and raw SHA-256
  `sha256:0c3a474f7b0f0034bc62183b2a0ae1b00c13f47527f109f24e8e8a536fec2a3a`.
  The captured source shows Lava Slime `59` includes On Fire!/Hellfire while
  Jungle Slime `-10` does not. Focused Npcinfo tests pass `9/9`; no runtime
  relation/projection write was performed.
- Read-only scope-gap classification
  `.local/tmp/buff-npc-infliction-scope-gap-classification-20261001-v1.json`
  (`sha256:e7c46726eb70a0344a898ae606b9363992879e59900a8c6f41e34ec40e0183e2`)
  groups the 70 unresolved variants into 25 raw pages (7 redirected/shared and
  18 same-page groups). Every group has a positive fact for another infobox but
  no variant-owned debuff field; no empty or copied infliction list is allowed.
- Refreshed scope-gap classification
  `.local/tmp/buff-npc-infliction-scope-gap-classification-20261003-v2.json`
  (`sha256:0c5cb51838426d626e9312ee352fb571c21983212a43ab5cf2b3108cb104d9b5`)
  now reflects the resolver replay: 68 gaps across 25 raw pages, with every
  group retaining a positive owner and no promoted empty set.
- Bounded Wiki API discovery
  `.local/tmp/buff-npc-variant-page-discovery-20261001-v2.json`
  (`sha256:01dd761f3d6e64e6fd0e0cf8b75fbaf1344534420c5c1dee26fcf2b631eb0640`)
  queried 100 unique titles in two read-only requests. It found 13 redirects and
  only two exact internal-name page hits (`Golem`, `Slimer`); no independent
  variant infliction source was found. API availability therefore does not
  reopen the relation replacement gate.
- Corrected bounded Insource discovery
  `.local/tmp/buff-npc-variant-insource-discovery-20261003-v1.json`
  (`sha256:229dc8c6c639d2f13765d45ab7b348d3dcc3ce8472ea29703c529bc9cf7cdfd7`)
  queried each of the 68 gap IDs with `insource:"npc infobox"` plus the exact
  stable `auto` value, then fetched and parsed revision-bound pages. All 68 IDs
  had shared-page hits and matching infoboxes across 28 unique pages, but zero
  had a debuff row owned by the requested variant. The gaps remain unknown;
  API page access still cannot authorize empty or replacement infliction sets.
- Structured source probe
  `.local/tmp/buff-npc-structured-source-probe-20261003-v1.json`
  (`sha256:81f4ea9e514ccbaaf6839d2fcc8d3fde189ffbc7185e9ee64cb6fa9dac8e04e9`)
  confirms `NPC_ID` is a redirect, `NPCs` has no stable debuff relation,
  `Npcinfo` data/datagen are immunity-only, and `Template:NPC infobox` is absent
  from the API. The structured API branch is closed; no empty infliction set is
  inferred.
- Shared-page variant scope contract
  `.local/tmp/buff-npc-variant-scope-contract-20261003-v1.json` has SHA-256
  `sha256:027aaa415cc635143f864f7eda998e1e8b5499672d68e96bb8f1be9d21118e0a`.
  It assigns all 68 unresolved stable NPC IDs to `unknown`, preserves all 68
  baselines, rejects copied facts from another infobox identity, and permits
  complete-empty only with an independent exhaustive source. The contract
  revalidates `114/114` retained facts, 360 preserved inflicting groups, and
  missing Buff baselines `389–400`; it remains `executable=false` and
  `databaseWrites=false`. Audit:
  `docs/audits/2026-10-03-buff-npc-variant-scope-contract.md`.
- Continuation validation: focused Buff/NPC/parser/relation tests pass `200/200`,
  all touched modules pass `node --check`, and `git diff --check` passes. The
  temporary backend/Nuxt sessions are stopped; Redis DB14 is reachable with no
  lease keys and MySQL `run_attempt/reservation/active-fence = 0/0/0`.
- New-ID bounded capture
  `.local/tmp/buff-new-id-page-capture-20261001-v1/` completed 7 targets across
  6 raw pages for IDs `389–394` and `396`; preflight was green and monitor
  progress reached `completed 7/7`. Diagnostic
  `.local/tmp/buff-new-id-insert-contract-diagnostic-20261001-v2.json`
  (`sha256:65d6f8082591afff76b66322de05433d3ec855fcb7a17c4fc58a5f2106229a72`)
  shows all 12 new IDs normalize, but every `inflictingNpcs` group remains
  `section_missing`; no empty infliction group or executable insert candidate
  is allowed.
- New-ID NPC scope audit
  `.local/tmp/buff-new-id-infliction-scope-audit-20261001-v1.json`
  (`sha256:bf6c7288b9b0605d199dae8539ab4972f7147d34f281fb94734d2cd61c006452`)
  replayed all 511 target pages and found zero positive infliction facts for
  IDs `389–400`. The status is `empty-unproven`: unresolved shared-page scope
  still prevents certifying an exhaustive empty group or creating an insert-only
  candidate.
- New-ID baseline readback completed with a read-only MySQL CLI fallback after
  the worktree-local `mysql2/promise` resolution failed. The query batch
  `.local/tmp/buff-new-id-db-readback-20261001.sql`
  (`sha256:eedfbeb3f880eeede81907dcb640992a0b7ec4aae85fa5f8e091dd36702d5386`)
  and raw output `.local/tmp/buff-new-id-db-readback-20261001.tsv`
  (`sha256:85c58d1015693661d6fefc3415351c58a357e82c99e619f19a7cfc56592b4106`)
  report zero rows for IDs `389–400` across local/maint Buffs, relation and
  projection Buffs, item/NPC secondary relations, Buff images, and source-item
  rows. This confirms missing historical baselines, while `empty-unproven`
  inflicting-NPC groups and the 68 shared-page scope gaps still block any
  insert-only or canonical write.
- Fresh focused Buff/NPC/capture/relation/full-chain validation passed `281/281`
  with zero failures; all touched `.mjs` files pass `node --check` and
  `git diff --check` is clean.
- Fresh authenticated runtime preflight
  `.local/tmp/buff-continuation-preflight-20261001T2324Z.json`
  (`sha256:90c1752d1af7187b9d0d6023e20756542b4cbcf4f62f7e39c8a297a0532eb821`)
  reports scheduler disabled, live attempts/claims `0/0`, healthy reconciler,
  Buff `blocked`, zero active Buff writers, and unchanged epoch/policy hash.
- Historical pre-v12 runtime no-loss sample readback confirmed the user-visible loss: the
  revision-bound capture proves `Wall of Flesh (113) -> Horrified (37)`, but
  relation/local contained only `113 -> TheTongue (38)` and both relation and
  projection Buff `37` had empty inflicting-NPC JSON. Authenticated admin and
  public `/buffs/37` responses returned `inflictingNpcCount: 0` before the v12
  repair. Evidence is
  in `.local/tmp/buff-runtime-readback-20261001.json`
  (`sha256:b362f4324bc9905775c88beebafe76a7b279093900878461620651f3ebcd697d`)
  with SQL/output hashes recorded in the active audit. This is a confirmed
  readback sample; no direct repair is allowed while the source/full-chain gate
  is blocked.
- Historical pre-Task-34 next start point: approve the exact request/proposal hashes, repeat server, policy, source, relation, and fence preflight, generate packet/permit, apply through the canonical executor, and independently read back Buff 71/395 plus `(1340,71)` and `(1340,395)`. This was completed in the Task 34 execution record above. The 68 shared-page variant rows are now
  complete-empty under the repeated-ID contract; Buff IDs `389–400` still lack
  historical baselines. Keep landing → maint → relation → projection blocked
  until the owner/full-chain gates are satisfied.

- Historical next start point: complete the formal V2 state-store recovery or obtain an independent owner packet/dispatch permit. The V2 recovery and v12 additive repair are now complete; do not replay consumed decisions or alter DB14 Redis/MySQL manually.

- Historical continuation read-only check at 06:39 CST: MySQL `13306` remained reachable
  with server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`; Buff `37` relation
  and projection inflicting-NPC JSON remain `[]`, and reverse `113 -> 37`
  `inflicts` was absent before v12. Backend `18102` was not listening, so no
  fresh authenticated preflight was issued in that historical check. Task 15
  v5 was later superseded by the completed v12 execution.
- Fresh continuation validation: authorization/manifest/additive runner tests
  pass `130/130`, Buff/NPC/parser/source/relation/full-chain tests pass
  `206/206`, changed `.mjs` files pass `node --check`, and `git diff --check`
  passes. These checks are source-only and do not reopen the blocked apply.
- A fresh `--apply=true` invocation with no packet failed before MySQL on
  `TERRAPEDIA_AUTHORIZED_PACKET_PATH is required`; no runtime mutation was
  attempted.
- Historical owner-authorization request notes: v5 lacked the owner decision
  context at that checkpoint and was not executed. It was later superseded by
  the independently bound v12 decision recorded above.

## Verified checkpoint and next action

- Local workspace checkpoint: implementation `b01033e6`; the prior `bf0df600` reference is historical and no longer the current branch tip. [Workspace checkpoint](entries/2026-09-28-automation-workspace-checkpoint.md) is closed with validation and the retained-artifact inventory. No push requested; overall ingestion remains active.
- Source parser/capture checkpoint: real 18/19-column headers now determine attribute semantics; raw HTML/wikitext can be frozen with revision IDs and immutable hashes;49/49 Node22 tests pass. Mining Helmet's legs-table link is wrong in the Wiki source itself. Collection `.a63-20260928-02` remains alive in the request gate's403 cooldown until08:16 CST; poll its progress before another crawler or DB writer. Details and next source/proposal gates are in the active child.
- Resource effects now preserve mana/capacity/movement units and reject qualified numeric cells; independent candidate and relation regressions are 168/168. Revision-bound collection `.a63-20260928-02` failed at 08:16 CST with Wiki HTTP403 and produced no authority; do not promote `.01` or start DB writes until a fresh source succeeds.
- Read-only baseline at 15:56 CST still matches `.22` projection state (active relation 246/320; projection 223/290) with disabled scheduler, 0/0 live work, healthy reconciler and unchanged H8/epoch/server. Broad relation tests are 1042/1050; eight unrelated modules fail because `mysql2/promise` is unavailable.
- Wiki `oldid` parses are Cloudflare challenged while page parses expose the same `revid`; revision-bound fetch now verifies selected page/revision identity on page parse, with 49/49 source/progress tests. `.03` remains the only live writer and must finish before retrying under the new code.
- A6.3 selected subset has recorded committed projection repair `.a63-20260927-22`: 223 active attribute members and 290 active effects, public/admin Ninja parity. Consumed decisions must not be replayed; ten missing-source members remain excluded.
- Image source `.a63-20260927-23` contains 419 rows (315 distinct file titles), all with individual revisions and original URLs; all cached URLs are null. Existing maint has 175 rows, all revisions missing and one cache missing. Raw source remains immutable.
- Current candidate code rejected producer `part` images. Two RED tests reproduced it; minimal allowlist fixes now pass maint/relation tests 138/138 while preserving stable IDs/keys.
- Candidate crit labels, retired-row/member scope and secondary retirement rederivation are corrected;214 Node22 integration tests pass. Next resolve two active MiningHelmet/item88 attribute sources (`sentrySlots`1/2), then revision-bound set-effect sources and their owned repair path. Both candidate and secondary proposal now reject ambiguous active member attributes. Experimental legacy-text dry-run counts are not authoritative source findings. Both `.32` and `.33` image results are completed/consumed; do not upload again.
- Standard local stack recovery completed with scheduling/Flyway disabled. Fresh07:25 CST preflight confirms disabled,0/0,healthy,fences0 and unchanged H8/epoch/server. DB after-set still matches `.22`; public/admin Ninja256/257/258 readback matches DB. [Fresh readback summary](../audits/2026-09-28-armor-validator-readback.json). Buff runner is catalog-registered but not execution-ready: authorization data binding, maint identity validation and locked rederivation are hardened; upstream landing→maint writes, fence acquisition, and result recovery still need implementation. `.03` completed 400/400 with revisions; applicability audit `.a63-20260929-05` is superseded: item categories do not prove immunity applicability. Bounded retry `.a63-20260929-06` stopped at 36/111 unknown pages with diagnostic-only output; all 370 missing sections remain unapproved, and no landing/maint/relation write is authorized. Result-path freshness is now checked before transaction start. Fresh 2026-09-29 preflight and read-only Buff baseline confirm no active fences/writers; landing remains 2 historical rows (current generated/unrevisioned), maint/relation/projection each 388 active rows. No source collector is active. Shimmer six-scope fences remain implementation dependencies.
- No local.items writes, DDL, direct SQL/Redis repair, H8 expansion, manual sweep or scheduler activation in this slice.

## History

- Previous detailed state, including superseded blockers: [September27 history](archive/2026-09-27-armor-image-current-history.md).

- Fresh `.a63-20260928-04` source completed (revision-bound 230-row page + independent Mining Pants revision 247540). Exact legs identity correction is evidenced, but proposal remains blocked by six qualified Shroomite values (`>15%`/`>20%`); no landing/maint/relation write or decision was consumed.
- Independent Shroomite armor source `.a63-20260928-06` completed at revision 251936 but only confirms set-level effects, so it cannot resolve the six per-piece qualified values. Armor publication remains blocked; no landing/maint/relation write or decision was consumed.
- Buff B1/Shimmer S1 execution contracts are now covered by RED/GREEN tests, while runtime registration remains blocked until their real full-chain importers and policy/fence scopes are wired. A fresh isolated Buff page-immunity collection `b1-a63-20260928-01` is running without database writes.
- Shimmer's registered import manifest now declares six ownership keys and its importer fails closed before `BEGIN` without a matching fenced six-scope partition bundle; Buff has a bounded transaction protocol/SQL mutation writer with RED/GREEN tests, but no Buff runner/catalog packet is registered yet. Buff collection `b1-a63-20260928-01` remains the sole active source writer (`144/400`, `running`).
- Shimmer current generation `379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761` has a read-only preview drift across all four transform hashes and 63 snapshots while counts stay `279/248/121/29`; its persisted L2 policy still owns only the four transform tables, so no proposal or apply is authorized.

### Scheduler continuation retry-61 outcome - 2026-10-08

Retry-61 was authorized as `AUTH-08` and consumed once. Fresh TOCTOU and
pre-enable checks passed with scheduler disabled, changed-only mode, H8
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`,
epoch `epoch-29a8486b-b3df-45a7-a496-28286e5da91b`, namespace
`terrapedia:crawler:wiki-monitor:v2:`, admin owner ACTIVE, zero live work,
zero reservations/fences, matching server fingerprint and execution manifest.
Decision result is authoritative `completed`; SQL readback confirms the exact
`SCHEDULER_ACTIVATION` identity and packet hash.

The authenticated PUT enabled one natural changed-only scheduler window with
Buff canary `buff-page-immunity-refresh`. Natural sweep evidence dispatched
Buff attempt `attempt-0381a0bb-3614-4d29-a42b-49e8c939ac0f`; Redis V2 progress
reached `399/400` with revision-bound source dispatch identity, then the source
runner failed at `381/400` because the remaining pages repeatedly timed out.
No landing, maint, relation, projection, automation run, reservation, or
write-fence business rows were created. Scheduler was restored through the
authenticated API and final readback is `enabled=false`, `liveAttempts=0`,
`sweepClaims=0`, reconciler healthy, active fences `0`.

Evidence: `.local/tmp/buff-automation-retry-61-toctou-1791443579071.json`,
`.local/tmp/buff-automation-retry-61-pre-enable-1791445600361.json`,
`.local/tmp/buff-automation-retry-61-natural-tick-observation-1791446294686.json`,
`.local/tmp/buff-automation-retry-61-attempt-observation-1791450105101.json`,
`reports/crawler-monitor/v2/2026-10-08/attempt-0381a0bb-3614-4d29-a42b-49e8c939ac0f/`,
and `.local/tmp/buff-automation-retry-61-disable-response-1791450308867.json`.
Retry-61 is consumed and must not be replayed. Automatic ingestion remains
open; the next attempt requires a new fresh preflight, packet, and approval.
