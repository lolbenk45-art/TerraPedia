# Image Origin Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or equivalent task-by-task execution with spec review and code quality review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local image access resilient so TerraPedia does not break when stored image URLs still reference `localhost:9000`, the real MinIO object API is `19000`, or multiple worktrees start on different app slots.

**Architecture:** Use stable `/terrapedia-images/...` paths as the backend/API contract for managed images. Local stack startup resolves one canonical image origin for proxies, preserves a legacy `9000` compatibility layer when possible, and smoke tests verify real image bytes instead of accepting TCP reachability or placeholder SVGs.

**Tech Stack:** Bash local-stack scripts, Node test/smoke utilities, Spring Boot Java backend, Nuxt front/admin dev proxies.

---

## Closure Definition

The work is complete only when all of these are true:

- Backend APIs no longer return `http://localhost:9000/terrapedia-images/...` for managed images; they return `/terrapedia-images/...`.
- Existing database rows that contain old absolute `localhost:9000` managed image URLs still render through front/admin without a DB migration.
- Front and admin resolve the same effective image origin and do not silently fall back to `localhost:9000`.
- Smoke validation fails if the image service returns MinIO Console HTML, a generated fallback SVG, or any non-real managed image response.
- A two-worktree startup can keep app ports isolated while sharing the same image object service without endless retries.

## Scope

In scope:

- Local startup/runtime config for image origin and legacy compatibility.
- Backend managed image URL normalization.
- Front/admin image proxy configuration and preview fallback behavior needed for smoke correctness.
- Focused tests and local smoke validation.

Out of scope:

- Production object storage architecture.
- Bulk database rewrite/backfill of stored image URLs.
- Crawler image sync changes, except where tests need existing managed image URL contracts.
- Destructive MinIO data operations.

## Source Chain

`DB item_images/items/npc/buff/boss/projectile image fields -> backend managed image policy -> sanitizer/localizer output boundaries -> DTO/API image fields -> front/admin URL normalization -> Nuxt dev proxy or preview route -> MinIO object API`

The source of truth for managed asset identity is the path segment beginning at `/terrapedia-images/`. Host and port are local runtime transport details and must not be treated as persistent identity for read/output projection.

Trust model:

- Read/output normalization accepts relative `/terrapedia-images/...`, currently configured MinIO origins, and explicit legacy local origins such as `http://localhost:9000` and `http://127.0.0.1:9000`.
- Read/output normalization rejects foreign absolute origins such as `https://example.com/terrapedia-images/items/foo.png`.
- Admin/user write validation remains strict and must not be loosened just because output normalization accepts legacy local origins.

---

## Task 1: Backend Managed Image Path Normalization

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/service/ManagedImageUrlPolicy.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/MinioManagedImageUrlPolicy.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/ManagedItemImageResolverImpl.java`
- Audit and modify when classified `output-normalize`: `back/src/main/java/com/terraria/skills/handler/WikiImageResponseSanitizerAdvice.java`
- Audit and modify when classified `output-normalize`: `back/src/main/java/com/terraria/skills/service/impl/MinioWikiImageLocalizationServiceImpl.java`
- Audit and modify when classified `output-normalize`: public service helpers that currently return raw managed image URLs, including `PublicItemServiceImpl`, `PublicNpcServiceImpl`, `PublicBuffServiceImpl`, `PublicBossServiceImpl`, `PublicProjectileServiceImpl`
- Test: `back/src/test/java/com/terraria/skills/service/impl/MinioManagedImageUrlPolicyTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/ManagedItemImageResolverImplTest.java`
- Test: `back/src/test/java/com/terraria/skills/handler/WikiImageResponseSanitizerAdviceTest.java`
- Test: add focused public controller/service image assertions for every production helper changed in Step 5

- [ ] **Step 1: Write failing policy tests**

Add assertions that these values normalize to stable paths:

```java
assertEquals(
    "/terrapedia-images/items/night-edge.png",
    policy.normalizeManagedImagePath("http://localhost:9000/terrapedia-images/items/night-edge.png").orElseThrow()
);
assertEquals(
    "/terrapedia-images/npcs/guide.png",
    policy.normalizeManagedImagePath("http://localhost:19000/terrapedia-images/npcs/guide.png?X-Amz-Signature=abc").orElseThrow()
);
assertEquals(
    "/terrapedia-images/buffs/ironskin.png",
    policy.normalizeManagedImagePath("/terrapedia-images/buffs/ironskin.png").orElseThrow()
);
assertTrue(policy.normalizeManagedImagePath("https://terraria.wiki.gg/images/Foo.png").isEmpty());
assertTrue(policy.normalizeManagedImagePath("https://example.com/page?u=/terrapedia-images/items/foo.png").isEmpty());
assertTrue(policy.normalizeManagedImagePath("https://example.com/terrapedia-images/items/night-edge.png").isEmpty());
```

Run:

```bash
cd back
mvn -Dtest=MinioManagedImageUrlPolicyTest test
```

Expected: fail because `normalizeManagedImagePath` does not exist.

- [ ] **Step 2: Add a callsite inventory before changing behavior**

Run:

```bash
rg "isManagedImageUrl\(|isManagedImageUrlForDomain\(" back/src/main/java back/src/test/java
```

Classify each production callsite in this MD or in a short implementation note as one of:

- `output-normalize`: read-side DTO/API projection where returned managed values should become relative paths.
- `write-validate`: admin/user input validation where strict managed-origin checks must stay strict.
- `leave-strict`: internal sync or storage code where changing semantics could alter writes.

Only `output-normalize` callsites are changed in this task unless a test proves another boundary leaks API output.

- [ ] **Step 3: Add default-safe policy API**

Add methods:

```java
default Optional<String> normalizeManagedImagePath(String value) {
    return isManagedImageUrl(value) ? Optional.of(value.trim()) : Optional.empty();
}

default Optional<String> normalizeManagedImagePathForDomain(String value, String domain) {
    Optional<String> normalized = normalizeManagedImagePath(value);
    String normalizedDomain = trimToNull(domain);
    if (normalized.isEmpty() || normalizedDomain == null) {
        return Optional.empty();
    }
    String expectedPrefix = "/terrapedia-images/" + normalizedDomain.toLowerCase(Locale.ROOT) + "/";
    return normalized.get().toLowerCase(Locale.ROOT).startsWith(expectedPrefix)
        ? normalized
        : Optional.empty();
}
```

The default method prevents anonymous test implementations from breaking compilation. `MinioManagedImageUrlPolicy` provides the real implementation. `isManagedImageUrl` remains the strict validation-style API unless a callsite is explicitly classified as read/output.

- [ ] **Step 4: Implement normalizer**

In `MinioManagedImageUrlPolicy`, parse only the URI path:

- Accept absolute `http://` and `https://` URLs without userinfo only when origin matches a configured endpoint/public endpoint or explicit legacy local origin.
- Accept already-relative `/terrapedia-images/...` paths.
- Accept protocol-relative URLs only if they parse to a trusted origin after adding `http:`.
- Reject paths where `/terrapedia-images/` appears only in query or fragment.
- Strip query and fragment from the returned value.
- Require the first path segment after bucket to be one of configured managed domains.

- [ ] **Step 5: Normalize service outputs**

Replace helpers that currently do:

```java
return managedImageUrlPolicy.isManagedImageUrl(text) ? text : null;
```

with:

```java
return managedImageUrlPolicy.normalizeManagedImagePath(text).orElse(null);
```

For domain-specific helpers, use `normalizeManagedImagePathForDomain`.

- [ ] **Step 6: Normalize sanitizer/localizer output boundaries**

Ensure managed URLs that pass through `WikiImageResponseSanitizerAdvice` and `MinioWikiImageLocalizationServiceImpl` are normalized before serialization when they are part of API output. Update existing tests that currently expect `http://localhost:9000/terrapedia-images/...`.

Do not change wiki-source localization behavior for `https://terraria.wiki.gg/images/...`; those should still be localized or suppressed according to existing tests.

- [ ] **Step 7: Normalize item resolver map values**

Update `ManagedItemImageResolverImpl` so resolved map/fallback values are normalized before return. The resolver must keep prioritization unchanged, but returned strings must be relative managed paths.

- [ ] **Step 8: Add compact API leak tests**

Add or update focused tests so serialized API output does not contain `localhost:9000/terrapedia-images`. Cover at least:

- item list/detail image,
- NPC image,
- buff-related item/NPC image,
- boss or projectile image,
- sanitizer/localizer-managed image.

- [ ] **Step 9: Run focused backend tests**

```bash
cd back
mvn -Dtest=MinioManagedImageUrlPolicyTest,ManagedItemImageResolverImplTest,WikiImageResponseSanitizerAdviceTest test
```

Add any affected focused service/controller test to the command if compilation points to changed assertions.

---

## Task 2: Local Stack Image Origin Resolver And Compatibility

**Files:**

- Modify: `scripts/dev/lib/runtime-config.sh`
- Modify: `scripts/dev/start-local-stack.sh`
- Modify: `scripts/dev/config/local-stack.config.example.json`
- Modify: `scripts/dev/config/README.md`
- Test: `scripts/dev/local-stack.test.mjs`

- [ ] **Step 1: Write failing local-stack contract tests**

In `scripts/dev/local-stack.test.mjs`, add assertions that:

- Runtime config exports `TP_IMAGE_ORIGIN`.
- Start script exports `TERRAPEDIA_IMAGE_ORIGIN="$TP_IMAGE_ORIGIN"`.
- Example config uses MinIO object API `19000` for endpoint/public endpoint and keeps console at `19001`.
- Start script contains a legacy `9000` compatibility proxy or fail-fast guard.
- Manifest records image origin health separately from MinIO enabled state.
- Manifest never treats `19001` as image origin because it is the MinIO Console port.

Run:

```bash
node --test scripts/dev/local-stack.test.mjs
```

Expected: fail before implementation.

- [ ] **Step 2: Resolve canonical image origin**

Extend `load_runtime_config` to export:

```bash
TP_IMAGE_ORIGIN="${TERRAPEDIA_IMAGE_ORIGIN:-$TP_MINIO_PUBLIC_ENDPOINT}"
TP_LEGACY_IMAGE_ORIGINS="${TERRAPEDIA_LEGACY_IMAGE_ORIGINS:-http://localhost:9000,http://127.0.0.1:9000}"
TP_IMAGE_COMPAT_PROXY_ENABLED="${TERRAPEDIA_IMAGE_COMPAT_PROXY_ENABLED:-true}"
```

If MinIO is disabled and config still points at `9000`, prefer a reachable local system MinIO object API at `http://localhost:19000` / `http://127.0.0.1:19000` for `TP_IMAGE_ORIGIN`. Do not choose `19001`; it is the console port.

- [ ] **Step 3: Export image origin to all app processes**

In `start-local-stack.sh`, export:

```bash
export TERRAPEDIA_IMAGE_ORIGIN="$TP_IMAGE_ORIGIN"
export TERRAPEDIA_LEGACY_IMAGE_ORIGINS="$TP_LEGACY_IMAGE_ORIGINS"
```

Do not rely on `TERRAPEDIA_IMAGE_ORIGIN` for backend output normalization; backend output should be relative. Pass/export `TERRAPEDIA_LEGACY_IMAGE_ORIGINS` so the backend can recognize old local origins without trusting arbitrary foreign hosts.

- [ ] **Step 4: Add legacy compatibility proxy**

When `TP_IMAGE_COMPAT_PROXY_ENABLED` is true, `TP_IMAGE_ORIGIN` is reachable, and `localhost:9000` is not already open, start a TCP proxy from `127.0.0.1:9000` to the canonical image origin. If `9000` is already open, record it as occupied and do not kill it.

If `9000` is occupied, compatibility is valid only after probing a known managed image path through both `http://localhost:9000/...` and `http://127.0.0.1:9000/...` and confirming real image bytes. If the probe returns MinIO Console HTML, fallback SVG, or non-image content, mark compatibility as `unreachable`.

If the proxy cannot start and DB/API still expose old `localhost:9000` paths during smoke, fail with a clear diagnostic.

- [ ] **Step 5: Strengthen manifest health**

Record:

```json
"imageOrigin": {
  "endpoint": "http://localhost:19000",
  "tcp": true,
  "status": "occupied"
},
"imageCompat": {
  "legacyOrigins": ["http://localhost:9000", "http://127.0.0.1:9000"],
  "status": "active|occupied|disabled|unreachable"
}
```

- [ ] **Step 6: Run contract tests**

```bash
node --test scripts/dev/local-stack.test.mjs
```

---

## Task 3: Front/Admin Image Origin Alignment

**Files:**

- Modify: `front-nuxt/utils/runtimeConfig.mjs`
- Modify: `front-nuxt/server/routes/preview-assets/[...path].get.ts`
- Modify: `data-query-app/nuxt.config.ts`
- Add or modify admin config tests under `data-query-app/tests`
- Modify: `front-nuxt/scripts/check-runtime-config.mjs`
- Modify: `front-nuxt/scripts/check-preview-image-fallback-contract.mjs`

- [ ] **Step 1: Write failing tests**

Extend front runtime config test to assert `TERRAPEDIA_IMAGE_ORIGIN` wins over `TERRAPEDIA_MINIO_PUBLIC_ENDPOINT`.

Add admin contract test asserting:

```ts
const terrapediaImageOrigin = (process.env.TERRAPEDIA_IMAGE_ORIGIN
  || process.env.TERRAPEDIA_MINIO_PUBLIC_ENDPOINT
  || 'http://localhost:19000').replace(/\/$/, '')
```

and that `/terrapedia-images` dev proxy uses `terrapediaImageOrigin`.

- [ ] **Step 2: Align admin config**

Update `data-query-app/nuxt.config.ts` to resolve image origin from `TERRAPEDIA_IMAGE_ORIGIN` first, then `TERRAPEDIA_MINIO_PUBLIC_ENDPOINT`, then `http://localhost:19000`. Expose it in runtime config for future checks.

- [ ] **Step 3: Stop managed preview fallback from masking service failure**

For `front-nuxt/server/routes/preview-assets/[...path].get.ts`, when `safePath` begins with `terrapedia-images/` and the configured origin fetch fails or returns a non-image content type, return a non-2xx diagnostic response instead of generated SVG fallback.

Preserve SVG fallback for wiki placeholder paths where the source is not a managed local object. Add explicit tests for both branches: managed local object failures return non-2xx, while `wiki-files/...` and other non-managed placeholder paths can still return the fallback SVG.

- [ ] **Step 4: Run focused front/admin tests**

```bash
cd front-nuxt
node scripts/check-runtime-config.mjs
node scripts/check-preview-image-fallback-contract.mjs

cd ../data-query-app
pnpm run test
```

If full admin tests are too broad, run the focused test file added in Step 1 first, then full `pnpm run test`.

---

## Task 4: Smoke Tests Must Prove Real Images

**Files:**

- Modify: `scripts/dev/smoke-local-stack.sh`
- Modify: `scripts/dev/local-stack.test.mjs`

- [ ] **Step 1: Write failing smoke contract assertions**

Add contract assertions that `smoke-local-stack.sh`:

- Extracts a managed image path from `/api/items?page=1&limit=...` or admin article data.
- Fetches through both admin and front proxies using `/terrapedia-images/...` and `/preview-assets/terrapedia-images/...`.
- Rejects `text/html`.
- Rejects generated fallback SVG for managed object checks.
- Records probed URL, normalized path, status, content type, and first bytes or short hash in the smoke report.

- [ ] **Step 2: Implement real image probe**

Add a helper that:

1. Calls backend item list.
2. Finds first image value containing `/terrapedia-images/`.
3. Normalizes it to `/terrapedia-images/...`.
4. Requests:

```text
{admin_base_url}/terrapedia-images/...
```

and front:

```text
{front_base_url}/preview-assets/terrapedia-images/...
```

5. Fails if either admin or front probe is unavailable after stack start.
6. Passes only when status is 2xx, content type is `image/*`, and a small magic-byte/body-prefix check confirms the response is PNG, JPEG, GIF, WebP, or a legitimate SVG object rather than MinIO Console HTML or the generated fallback SVG.
7. Records probed URL, status, content type, first bytes or short hash, and normalized path.

- [ ] **Step 3: Make MinIO public endpoint smoke meaningful**

Replace bucket-root `<500` success with a real managed object probe. If no managed image candidate exists in the API response, mark the result failed with `no managed image candidate found` rather than passing.

- [ ] **Step 4: Run smoke tests**

Contract:

```bash
node --test scripts/dev/local-stack.test.mjs
```

Runtime after stack start:

```bash
bash scripts/dev/smoke-local-stack.sh
```

After startup, the smoke script and runtime validation must derive backend/front/admin ports from this worktree's `reports/local-start/run-manifest.json`. Runtime config alone is not acceptable for post-start smoke unless it already contains the resolved slot-adjusted ports, because base config can accidentally hit slot 0 from another worktree.

---

## Task 5: End-To-End Runtime Verification

**Files:**

- No production file ownership unless a previous task exposes a gap.
- Reports written under `reports/local-start/`.

- [ ] **Step 1: Stop old stack for the fix worktree**

Use the repo stop script from the fix worktree. Do not kill unrelated worktrees manually.

```bash
bash scripts/dev/stop-local-stack.sh
```

- [ ] **Step 2: Start one worktree**

```bash
bash scripts/dev/start-local-stack.sh
```

Verify manifest shows image origin reachable and not `19001`.

- [ ] **Step 3: Verify API image normalization**

Read ports from `reports/local-start/run-manifest.json`; do not hard-code `18188`, `15174`, or `13001`.

```bash
node - <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync('reports/local-start/run-manifest.json', 'utf8'));
const backendPort = manifest.health?.back?.port || manifest.ports?.backend?.port;
fetch(`http://127.0.0.1:${backendPort}/api/items?page=1&limit=3`)
  .then((r) => r.json())
  .then((j) => {
    const s = JSON.stringify(j);
    if (s.includes('localhost:9000/terrapedia-images')) throw new Error('legacy absolute URL leaked');
    if (!s.includes('/terrapedia-images/')) throw new Error('no managed image path found');
    console.log('ok');
  });
NODE
```

- [ ] **Step 4: Verify real image through UI proxy**

Use a normalized path from Step 3 and request:

```bash
eval "$(
node - <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync('reports/local-start/run-manifest.json', 'utf8'));
const adminPort = manifest.health?.dataQueryApp?.port || manifest.ports?.admin?.port;
const frontPort = manifest.health?.front?.port || manifest.ports?.front?.port;
if (!adminPort || !frontPort) throw new Error('missing front/admin ports in run-manifest.json');
console.log(`ADMIN_PORT=${adminPort}`);
console.log(`FRONT_PORT=${frontPort}`);
NODE
)"
curl -sS -D - -o /tmp/tp-admin-image-probe.out "http://127.0.0.1:${ADMIN_PORT}/terrapedia-images/<path>"
curl -sS -D - -o /tmp/tp-front-image-probe.out "http://127.0.0.1:${FRONT_PORT}/preview-assets/terrapedia-images/<path>"
file /tmp/tp-admin-image-probe.out /tmp/tp-front-image-probe.out
```

Expected for both files: image content, not HTML, not fallback SVG unless the object itself is SVG.

- [ ] **Step 5: Start a second worktree smoke**

Use an existing second worktree or a temporary test worktree. Start it with its own slot and verify:

- Backend/front/admin ports differ from slot 0.
- It does not retry forever searching for an unrelated service.
- Image origin is shared or proxied intentionally.
- Real image smoke passes.

---

## Cross-Agent Review Requirements

Before implementation:

- Reviewer A checks startup/script scope and multi-worktree safety.
- Reviewer B checks backend URL normalization and API contract safety.
- Reviewer C checks front/admin proxy and smoke false-positive prevention.

During implementation:

- Workers must own disjoint write sets.
- No worker may edit crawler/data backfill logic.
- No DB writes are allowed without a separate explicit plan.
- If any task finds a plan gap that can let smoke pass while images remain broken, pause implementation, patch this MD, re-review, then continue.

---

## Runtime Finding: Object Missing Is A Data Root Mismatch

Cross-agent review and live probes found that the original `9000` vs `19000` port mismatch has been fixed, but the current runtime image failure is a separate object-data problem:

- `reports/local-start/run-manifest.json` now records `health.imageOrigin.dataRootStatus`.
- Current live state is `wrong_data_root`:
  - expected: `/home/lolben/.local/share/terrapedia/minio/data`
  - actual: `/var/lib/terrapedia-minio/data`
- `bash scripts/dev/smoke-local-stack.sh` now classifies managed image failures as `reasonCode: "object_missing"` when direct origin/admin/front probes reach MinIO but receive `404 application/xml` / `NoSuchKey`.
- This is not an admin/password config miss and not MinIO Console `19001`; it is a reachable MinIO object API serving the wrong or empty data root for the DB-managed keys.

Safe recovery options:

1. Restart the MinIO service on `19000` with the configured data root `/home/lolben/.local/share/terrapedia/minio/data`, then rerun `bash scripts/dev/start-local-stack.sh` and `bash scripts/dev/smoke-local-stack.sh`.
2. If the intended shared MinIO data root is `/var/lib/terrapedia-minio/data`, run a separate explicit object repair/backfill plan to copy or re-upload managed objects into that bucket. Do not do this implicitly from startup.
3. Keep startup read-only: it may diagnose `wrong_data_root`, but it must not kill system MinIO, rewrite DB rows, or mutate bucket data automatically.

Acceptance for this branch:

- Port/config regressions are prevented by relative API image paths, canonical image origin, legacy proxy, and direct origin smoke.
- Wrong-data-root regressions are diagnosed deterministically by startup manifest and smoke `object_missing` reason codes.
- A real image smoke pass still requires aligning the MinIO data root or explicitly restoring missing objects.

## Final Validation

Minimum commands:

```bash
node --test scripts/dev/slot-allocator.test.mjs scripts/dev/local-stack.test.mjs
cd back && mvn -Dtest=MinioManagedImageUrlPolicyTest,ManagedItemImageResolverImplTest,WikiImageResponseSanitizerAdviceTest test
cd ../front-nuxt && node scripts/check-runtime-config.mjs && node scripts/check-preview-image-fallback-contract.mjs
cd ../data-query-app && pnpm run test
cd .. && bash scripts/dev/start-local-stack.sh
bash scripts/dev/smoke-local-stack.sh
```

If time or environment blocks full `pnpm run test` or full runtime startup, record the exact command, failure reason, and the remaining risk before handoff.
