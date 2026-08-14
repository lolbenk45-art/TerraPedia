# Crawler Auto-Domain Consumption And Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove blind changed-only re-crawls for the five source-probed domains and resume failed Buff work at most three times.

**Architecture:** The source monitor remains the upstream-change authority. Automatic dispatch is fail-closed for Audio, Bosses, and Shimmer until they gain lightweight probes. Buff and Armor Sets acknowledge completed source snapshots in the canonical manifest; V2 recovery selects resume from action capability rather than inheriting fresh.

**Tech Stack:** Java 17, Spring Boot, JUnit 5, Node.js ESM, `node:test`, Redis V2 queue.

---

### Task 1: Fail Close Domains Without Source Probes

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Test: `scripts/data/monitor/check-source-updates.test.mjs`

- [x] **Step 1: Write failing coverage assertions**

```java
assertEquals(Set.of("items", "npcs", "projectiles", "armor_sets", "buffs"),
    CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS);
assertFalse(CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.contains("audio"));
assertFalse(CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.contains("bosses"));
assertFalse(CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS.contains("shimmer"));
```

- [x] **Step 2: Verify RED**

```bash
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest test
```

Expected: fails because the allowlist contains the three unprobed domains.

- [x] **Step 3: Implement and verify GREEN**

Keep the Java allowlist to the five source-monitor keys. Do not add full-crawl
supplementary actions to `check-source-updates.mjs`.

```bash
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest test
node --test scripts/data/monitor/check-source-updates.test.mjs
```

### Task 2: Acknowledge Buff And Armor Set Success

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-buffs.test.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`

- [x] **Step 1: Write failing manifest tests**

```js
assert.equal(manifest.records.find((record) => record.sourceKey === 'wiki.page.template_getbuffinfo').contentHash, expectedHash)
assert.equal(manifest.records.find((record) => record.sourceKey === 'wiki.module.armorsetbonuses').contentHash, expectedHash)
```

Test successful temporary `--manifest-path` runs, and assert controlled failures
leave its bytes unchanged. Assert the two registry commands contain
`--manifest-path=data/generated/wiki-source-manifest.latest.json`.

- [x] **Step 2: Verify RED**

```bash
node --test scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest test
```

- [x] **Step 3: Implement and verify GREEN**

Keep the scripts' existing terminal-success-only manifest finalizers. Wire both
default action commands to the canonical manifest path, preserve CLI defaults,
and leave the existing backend finalizer as owner for Items, NPCs, and
Projectiles.

```bash
node --test scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest test
```

### Task 3: Select Resume For V2 Recovery

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [x] **Step 1: Write failing recovery tests**

```java
assertTrue(command.contains("--resume-mode=resume"));
assertTrue(command.contains("--resume-state=data/generated/resume/buff-page-immunity-refresh.resume.json"));
assertFalse(armorCommand.stream().anyMatch(token -> token.startsWith("--resume-")));
assertEquals("automatic_retry_limit_reached", skipped.get("reason"));
```

Create a failed Buff V2 attempt, a failed non-resumable Armor Sets attempt,
and a third failed automatic retry.

- [x] **Step 2: Verify RED**

```bash
cd back && mvn -Dtest=CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest,CrawlerMonitorServiceImplTest test
```

- [x] **Step 3: Implement and verify GREEN**

Use one decision path: active/queued/retry-wait/completed attempts do not
duplicate; failed resumable attempts use `resume`; failed non-resumable attempts
pause; attempt number three records `automatic_retry_limit_reached` and pauses.
`runV2AutomationSweepClaimed` must call this path rather than setting fresh.
Preserve manual first-start, epoch, lease, fence, and artifact identity checks.

```bash
cd back && mvn -Dtest=CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest,CrawlerMonitorServiceImplTest test
```

### Task 4: Integrate Without A Live Crawl

**Files:**
- Modify: `docs/devlog/entries/2026-08-14-crawler-auto-domain-consumption-resume.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: Run focused validation**

```bash
node --test scripts/data/monitor/check-source-updates.test.mjs scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test
git diff --check
```

- [ ] **Step 2: Record and checkpoint**

Record passing commands, five-domain boundary, supplementary fail-closed
boundary, and the requirement to wait for the live Buff task before restarting
the backend. Stage explicit paths only and commit with `fix(crawler): recover changed-only domains`.
