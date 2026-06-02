# Admin Audio Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin audio asset page play already-ingested local audio files from `audio_assets` through a safe read-only backend stream endpoint.

**Architecture:** Keep `audio_assets` as the source of truth for metadata and local relative paths. Add a backend stream service that resolves only allowlisted local audio paths under the configured local audio media root, then expose an authenticated admin GET endpoint. Add an admin UI playback column that fetches the stream with the admin Bearer token, creates a temporary blob URL, and feeds that blob URL to `<audio controls>` without exposing absolute paths.

**Tech Stack:** Spring Boot 3.2, `JdbcTemplate`, Java NIO `Path`, Spring `Resource`/`ResponseEntity`, Nuxt 4/Vue 3 admin app, Node built-in test runner for admin page contract tests.

---

## Scope Lock

In scope:

- Backend read-only stream endpoint for one audio asset by numeric DB id.
- Backend path safety checks for `audio_assets.local_path`.
- Backend tests for success, missing DB row, missing local file, absolute path rejection, and path traversal rejection.
- Admin page playback controls on `data-query-app/pages/operations/audio-assets.vue`.
- Admin page contract test proving the page uses the stream endpoint and does not introduce write APIs.
- Runtime smoke against local stack after restart.

Out of scope:

- Public frontend playback.
- Item, NPC, boss, biome, or BGM entity detail integration.
- Audio entity matching or changes to `audio_asset_links.match_status`.
- Database writes, crawler runs, imports, backfills, or migrations.
- Exposing `absolute_local_path` to any frontend response.

Current verified data state on 2026-06-02:

- Source metadata: `/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json`
- Database: `terria_v1_local` on local config port `13306`
- `audio_assets`: 428 active rows
- `audio_asset_links`: 428 active rows
- Local metadata check: 428 assets, 0 missing local files
- Existing admin API base: `/api/admin/audio-assets`
- Existing admin page: `/operations/audio-assets`

## Source Chain

```text
/home/lolben/data/terraPedia/media/audio/wiki/*
  -> audio_assets.local_path / mime / size_bytes
  -> backend authenticated admin stream endpoint
  -> data-query-app audio assets table
  -> browser <audio controls>
```

The stream endpoint must read from local files only after normalizing against an allowlisted media root. The admin page must request the stream endpoint with the existing admin Authorization header behavior; a plain `<audio src="/api/admin/audio-assets/{id}/stream">` is not acceptable because the current `AdminAuthenticationInterceptor` only accepts `Authorization: Bearer ...` and does not read the admin token cookie.

## Planned Files

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminAudioAssetController.java`
  - Keep summary/list behavior.
  - Add `GET /admin/audio-assets/{id}/stream`.
  - Delegate file lookup and streaming metadata to a focused service.
- Modify: `back/src/main/resources/application.yml`
  - Add `terrapedia.audio-media-root: ${TERRAPEDIA_AUDIO_MEDIA_ROOT:/home/lolben/data/terraPedia/media/audio/wiki}`.
- Create: `back/src/main/java/com/terraria/skills/service/AdminAudioAssetStreamService.java`
  - Load asset metadata from `audio_assets`.
  - Resolve and validate local relative path against `terrapedia.audio-media-root`.
  - Use real path checks to reject symlink escapes.
  - Return stream payload: resource, content type, content length, safe download filename.
- Create: `back/src/test/java/com/terraria/skills/service/AdminAudioAssetStreamServiceTest.java`
  - Unit-test path safety and missing-file behavior without a running DB.
- Create or modify: `back/src/test/java/com/terraria/skills/controller/AdminAudioAssetControllerTest.java`
  - Mock the stream service and `JdbcTemplate`.
  - Cover list/summary if no current test exists, plus stream endpoint response headers.
- Modify: `data-query-app/pages/operations/audio-assets.vue`
  - Add playback column/control.
  - Add authenticated blob playback helper and object URL cleanup.
  - Build stream URLs from `runtimeConfig.public.apiBase`, not a hard-coded `/api` assumption.
  - Show a compact per-row playback error.
  - Preserve read-only API behavior.
- Create: `data-query-app/tests/audio-assets-page-contract.test.mjs`
  - Contract checks for stream endpoint use, `<audio controls>`, no absolute local paths, and no write API calls.

## Agent Split

- Agent A, backend API owner:
  - Owns `AdminAudioAssetController.java`, `AdminAudioAssetStreamService.java`, and backend tests.
  - Does not edit admin Vue files.
- Agent B, admin UI owner:
  - Owns `data-query-app/pages/operations/audio-assets.vue` and `data-query-app/tests/audio-assets-page-contract.test.mjs`.
  - Does not edit Java files.
  - Must not use direct protected endpoint URLs as `<audio src>`; use authenticated fetch and blob URLs.
- Agent C, plan/review owner:
  - Read-only review of plan and later diffs.
  - Checks safety boundaries, runtime validation, and whether the result closes “后台播放”.

No two agents may write the same file. No agent may run crawler/import/backfill/load/apply commands.

## Task 1: Backend Stream Service

**Files:**

- Create: `back/src/main/java/com/terraria/skills/service/AdminAudioAssetStreamService.java`
- Modify: `back/src/main/resources/application.yml`
- Create: `back/src/test/java/com/terraria/skills/service/AdminAudioAssetStreamServiceTest.java`

- [ ] **Step 1: Write failing service tests**

Test cases:

```java
package com.terraria.skills.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminAudioAssetStreamServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void resolvesActiveRelativeAudioFileUnderMediaRoot() throws Exception {
        Path mediaRoot = tempDir.resolve("media").resolve("audio").resolve("wiki");
        Path file = mediaRoot.resolve("bgm").resolve("music-aether.mp3");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "audio");
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "data/terraPedia/media/audio/wiki/bgm/music-aether.mp3",
            "audio/mpeg",
            5L,
            "Music-Aether.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, mediaRoot);

        AdminAudioAssetStreamService.AudioStreamPayload payload = service.loadStream(1L);

        assertEquals("audio/mpeg", payload.contentType());
        assertEquals(5L, payload.contentLength());
        assertEquals("Music-Aether.mp3", payload.filename());
        assertTrue(payload.resource().exists());
    }

    @Test
    void rejectsPathTraversalOutsideMediaRoot() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "data/terraPedia/media/audio/wiki/../secrets.mp3",
            "audio/mpeg",
            1L,
            "secrets.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, tempDir.resolve("media").resolve("audio").resolve("wiki"));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void rejectsAbsoluteLocalPathFromDatabase() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "/tmp/audio.mp3",
            "audio/mpeg",
            1L,
            "audio.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, tempDir.resolve("media").resolve("audio").resolve("wiki"));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void returnsNotFoundWhenAssetRowMissing() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, tempDir.resolve("media").resolve("audio").resolve("wiki"));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(999L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void returnsNotFoundWhenLocalFileMissing() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "data/terraPedia/media/audio/wiki/items/item-1.wav",
            "audio/wav",
            10L,
            "Item_1.wav"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, tempDir.resolve("media").resolve("audio").resolve("wiki"));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void rejectsSymlinkEscapeOutsideMediaRoot() throws Exception {
        Path mediaRoot = tempDir.resolve("media").resolve("audio").resolve("wiki");
        Path outside = tempDir.resolve("outside.mp3");
        Path link = mediaRoot.resolve("bgm").resolve("escape.mp3");
        Files.createDirectories(link.getParent());
        Files.writeString(outside, "secret");
        Files.createSymbolicLink(link, outside);
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(row(
            "data/terraPedia/media/audio/wiki/bgm/escape.mp3",
            "audio/mpeg",
            6L,
            "escape.mp3"
        )));
        AdminAudioAssetStreamService service = new AdminAudioAssetStreamService(jdbcTemplate, mediaRoot);

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.loadStream(1L));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    private static Map<String, Object> row(String localPath, String mime, Long size, String fileTitle) {
        return Map.of(
            "id", 1L,
            "asset_id", "bgm:music-aether",
            "local_path", localPath,
            "mime", mime,
            "size_bytes", size,
            "file_title", fileTitle
        );
    }
}
```

- [ ] **Step 2: Run service test and confirm it fails**

Run:

```bash
cd back
mvn -Dtest=AdminAudioAssetStreamServiceTest test
```

Expected: compilation failure because `AdminAudioAssetStreamService` does not exist.

- [ ] **Step 3: Implement stream service**

Implementation requirements:

```java
package com.terraria.skills.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@Service
public class AdminAudioAssetStreamService {

    private static final Path AUDIO_MEDIA_PREFIX = Path.of("data", "terraPedia", "media", "audio", "wiki");
    private static final Path SHORT_AUDIO_MEDIA_PREFIX = Path.of("media", "audio", "wiki");

    private final JdbcTemplate jdbcTemplate;
    private final Path audioMediaRoot;

    public AdminAudioAssetStreamService(
        JdbcTemplate jdbcTemplate,
        @Value("${terrapedia.audio-media-root:/home/lolben/data/terraPedia/media/audio/wiki}") String audioMediaRoot
    ) {
        this(jdbcTemplate, Path.of(audioMediaRoot));
    }

    public AdminAudioAssetStreamService(JdbcTemplate jdbcTemplate, Path audioMediaRoot) {
        this.jdbcTemplate = jdbcTemplate;
        this.audioMediaRoot = audioMediaRoot.toAbsolutePath().normalize();
    }

    public AudioStreamPayload loadStream(Long id) {
        if (id == null || id <= 0) {
            throw notFound();
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, asset_id, local_path, mime, size_bytes, file_title
            FROM audio_assets
            WHERE id = ? AND deleted = 0 AND status IN ('active', 'downloaded')
            LIMIT 1
            """,
            id
        );
        if (rows.isEmpty()) {
            throw notFound();
        }
        Map<String, Object> row = rows.get(0);
        Path file = resolveSafeAudioPath(text(row.get("local_path")));
        if (!Files.isRegularFile(file) || !Files.isReadable(file)) {
            throw notFound();
        }
        return new AudioStreamPayload(
            new FileSystemResource(file),
            contentType(text(row.get("mime"))),
            file.toFile().length(),
            filename(row)
        );
    }

    private Path resolveSafeAudioPath(String localPath) {
        if (localPath.isBlank()) {
            throw notFound();
        }
        Path relative = Path.of(localPath);
        if (relative.isAbsolute()) {
            throw notFound();
        }
        Path normalizedRelative = relative.normalize();
        Path suffix = audioSuffix(normalizedRelative);
        if (suffix == null) {
            throw notFound();
        }
        try {
            Path rootReal = audioMediaRoot.toRealPath();
            Path fileReal = audioMediaRoot.resolve(suffix).normalize().toRealPath();
            if (!fileReal.startsWith(rootReal) || !Files.isRegularFile(fileReal)) {
                throw notFound();
            }
            return fileReal;
        } catch (Exception exception) {
            throw notFound();
        }
    }

    private Path audioSuffix(Path normalizedRelative) {
        if (normalizedRelative.startsWith(AUDIO_MEDIA_PREFIX)) {
            return AUDIO_MEDIA_PREFIX.relativize(normalizedRelative);
        }
        if (normalizedRelative.startsWith(SHORT_AUDIO_MEDIA_PREFIX)) {
            return SHORT_AUDIO_MEDIA_PREFIX.relativize(normalizedRelative);
        }
        return null;
    }

    private String contentType(String mime) {
        if ("audio/wav".equalsIgnoreCase(mime) || "audio/x-wav".equalsIgnoreCase(mime)) {
            return "audio/wav";
        }
        if ("audio/ogg".equalsIgnoreCase(mime)) {
            return "audio/ogg";
        }
        return "audio/mpeg";
    }

    private String filename(Map<String, Object> row) {
        String fileTitle = text(row.get("file_title")).replaceFirst("^File:", "");
        if (!fileTitle.isBlank()) {
            return fileTitle.replaceAll("[\\\\/\\r\\n]", "_");
        }
        return text(row.get("asset_id")).replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Audio asset not found");
    }

    public record AudioStreamPayload(Resource resource, String contentType, long contentLength, String filename) {
    }
}
```

Add this config:

```yaml
terrapedia:
  audio-media-root: ${TERRAPEDIA_AUDIO_MEDIA_ROOT:/home/lolben/data/terraPedia/media/audio/wiki}
```

Before implementing, verify this root contract against live rows:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -N -e "SELECT status, COUNT(*) FROM audio_assets WHERE deleted=0 GROUP BY status; SELECT local_path FROM audio_assets WHERE deleted=0 AND local_path <> '' LIMIT 3;"
```

Expected DB path starts with `data/terraPedia/media/audio/wiki/` or `media/audio/wiki/`. The service strips either prefix and resolves the suffix under `terrapedia.audio-media-root`, whose local default is `/home/lolben/data/terraPedia/media/audio/wiki`. Do not rely on current working directory.

- [ ] **Step 4: Run service tests**

Run:

```bash
cd back
mvn -Dtest=AdminAudioAssetStreamServiceTest test
```

Expected: all tests pass.

- [ ] **Step 5: Backend self-review checkpoint**

Review:

- Absolute paths reject.
- `..` traversal rejects.
- Only `data/terraPedia/media/audio/wiki` resolves.
- The service returns `404`, not `500`, for unsafe or missing assets.
- No DB writes exist.

## Task 2: Backend Stream Controller

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminAudioAssetController.java`
- Create or modify: `back/src/test/java/com/terraria/skills/controller/AdminAudioAssetControllerTest.java`

- [ ] **Step 1: Write failing controller tests**

Required cases:

```java
@Test
void shouldStreamAudioAssetWithContentHeaders() throws Exception {
    byte[] body = "audio".getBytes(StandardCharsets.UTF_8);
    ByteArrayResource resource = new ByteArrayResource(body);
    when(streamService.loadStream(1L)).thenReturn(new AdminAudioAssetStreamService.AudioStreamPayload(
        resource,
        "audio/mpeg",
        body.length,
        "Music-Aether.mp3"
    ));

    mockMvc.perform(get("/admin/audio-assets/1/stream"))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "audio/mpeg"))
        .andExpect(header().longValue("Content-Length", body.length))
        .andExpect(header().doesNotExist("Accept-Ranges"))
        .andExpect(header().string("Content-Disposition", containsString("inline")))
        .andExpect(content().bytes(body));
}

@Test
void shouldReturnNotFoundForMissingAudioStream() throws Exception {
    when(streamService.loadStream(999L)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Audio asset not found"));

    mockMvc.perform(get("/admin/audio-assets/999/stream"))
        .andExpect(status().isNotFound());
}
```

Also add summary/list tests if no `AdminAudioAssetControllerTest` exists, using the existing controller behavior as the expected contract.

- [ ] **Step 2: Run controller test and confirm it fails**

Run:

```bash
cd back
mvn -Dtest=AdminAudioAssetControllerTest test
```

Expected: compilation failure or missing endpoint failure.

- [ ] **Step 3: Add controller dependency and endpoint**

Implementation shape:

```java
private final JdbcTemplate jdbcTemplate;
private final AdminAudioAssetStreamService audioAssetStreamService;

@GetMapping("/{id}/stream")
@Operation(summary = "Stream a local wiki audio asset")
public ResponseEntity<Resource> stream(@PathVariable Long id) {
    AdminAudioAssetStreamService.AudioStreamPayload payload = audioAssetStreamService.loadStream(id);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(payload.contentType()))
        .contentLength(payload.contentLength())
        .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(payload.filename(), StandardCharsets.UTF_8).build().toString())
        .body(payload.resource());
}
```

Preserve existing `summary()` and `list()` responses. Do not add `absolute_local_path` to list payloads. Do not advertise `Accept-Ranges` in this first version; range support can be a later task if browser smoke shows it is needed.

Controller test setup must explicitly pass both dependencies:

```java
jdbcTemplate = mock(JdbcTemplate.class);
streamService = mock(AdminAudioAssetStreamService.class);
mockMvc = MockMvcBuilders
    .standaloneSetup(new AdminAudioAssetController(jdbcTemplate, streamService))
    .build();
```

Auth is enforced in runtime by `AdminAuthenticationInterceptor` because the servlet path starts with `/admin/`. Standalone controller tests do not prove auth.

- [ ] **Step 4: Run focused backend tests**

Run:

```bash
cd back
mvn -Dtest=AdminAudioAssetControllerTest,AdminAudioAssetStreamServiceTest test
```

Expected: all tests pass.

## Task 3: Admin Page Playback UI

**Files:**

- Modify: `data-query-app/pages/operations/audio-assets.vue`
- Create: `data-query-app/tests/audio-assets-page-contract.test.mjs`

- [ ] **Step 1: Write failing admin page contract test**

Create:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('audio assets admin page exposes read-only authenticated local playback controls', () => {
  const page = read('data-query-app/pages/operations/audio-assets.vue')

  assert.match(page, /\/admin\/audio-assets\/\$\{row\.id\}\/stream/)
  assert.match(page, /useRuntimeConfig/)
  assert.match(page, /public\.apiBase/)
  assert.match(page, /Authorization/)
  assert.match(page, /Bearer/)
  assert.match(page, /@click="loadAudioPreview\(row\)"/)
  assert.match(page, /fetch\(getAudioStreamUrl\(row\)/)
  assert.match(page, /URL\.createObjectURL/)
  assert.match(page, /URL\.revokeObjectURL/)
  assert.match(page, /<audio[\s\S]*controls/)
  assert.match(page, /:src="audioBlobUrls\[row\.id\]"/)
  assert.doesNotMatch(page, /:src="getAudioStreamUrl\(row\)"/)
  assert.match(page, /preload="none"/)
  assert.match(page, /controlsList="nodownload"/)
  assert.match(page, /audioLoadErrors/)
  assert.match(page, /audio-assets.*本地播放|本地播放|加载音频/)
  assert.match(page, /播放|音频/)
  assert.doesNotMatch(page, /\b(post|put|patch|del)\s*\(/)
  assert.doesNotMatch(page, /absoluteLocalPath/)
})
```

- [ ] **Step 2: Run admin contract test and confirm it fails**

Run:

```bash
cd data-query-app
pnpm run test:unit -- audio-assets-page-contract.test.mjs
```

Expected: failure because the page has no authenticated stream fetch, blob URL, or audio control.

- [ ] **Step 3: Add playback column and authenticated blob helper**

Modify the table header and row:

```vue
<th>播放</th>
```

```vue
<td class="playback-cell">
  <template v-if="row.id">
    <audio
      v-if="audioBlobUrls[row.id]"
      class="audio-player"
      controls
      preload="none"
      controlsList="nodownload"
      :src="audioBlobUrls[row.id]"
    />
    <button
      v-else
      type="button"
      class="btn btn-secondary btn--compact"
      :disabled="loadingAudioIds.has(row.id)"
      @click="loadAudioPreview(row)"
    >
      {{ loadingAudioIds.has(row.id) ? '加载中...' : '加载音频' }}
    </button>
    <small v-if="audioLoadErrors[row.id]" class="playback-error">{{ audioLoadErrors[row.id] }}</small>
  </template>
  <span v-else>--</span>
</td>
```

Add helper in `<script setup>`:

```ts
const runtimeConfig = useRuntimeConfig()
const audioBlobUrls = reactive<Record<number, string>>({})
const audioLoadErrors = reactive<Record<number, string>>({})
const loadingAudioIds = reactive(new Set<number>())

function joinUrl(base: string, path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!base) return normalizedPath
  return `${base.replace(/\/+$/, '')}${normalizedPath}`
}

function getAudioStreamUrl(row: AudioAssetRow) {
  return joinUrl(String(runtimeConfig.public.apiBase || ''), `/admin/audio-assets/${row.id}/stream`)
}

function getAdminToken() {
  return useCookie<string | null>('tp_admin_token').value || ''
}

async function loadAudioPreview(row: AudioAssetRow) {
  if (!row.id || audioBlobUrls[row.id] || loadingAudioIds.has(row.id)) return
  audioLoadErrors[row.id] = ''
  loadingAudioIds.add(row.id)
  try {
    const response = await fetch(getAudioStreamUrl(row), {
      headers: {
        Authorization: `Bearer ${getAdminToken()}`,
      },
    })
    if (!response.ok) {
      throw new Error(response.status === 401 ? '登录已失效' : `音频加载失败：${response.status}`)
    }
    const blob = await response.blob()
    audioBlobUrls[row.id] = URL.createObjectURL(blob)
  } catch (error) {
    audioLoadErrors[row.id] = error instanceof Error ? error.message : '音频加载失败'
  } finally {
    loadingAudioIds.delete(row.id)
  }
}

function clearAudioBlobUrls() {
  Object.values(audioBlobUrls).forEach((url) => URL.revokeObjectURL(url))
  Object.keys(audioBlobUrls).forEach((key) => delete audioBlobUrls[Number(key)])
}

onUnmounted(() => {
  clearAudioBlobUrls()
})
```

Call `clearAudioBlobUrls()` at the start of `fetchRows()` before replacing `rows` so pagination/filter refreshes do not retain old object URLs. Keep wiki links separate from playback. Keep existing local relative path display. If implementation prefers using `$fetch.raw` instead of browser `fetch`, it must still prove the Authorization header is sent and the final `<audio>` source is a blob URL.

- [ ] **Step 4: Add compact styling**

Add CSS that keeps table layout stable:

```css
.playback-cell {
  min-width: 240px;
}

.audio-player {
  width: 210px;
  max-width: 100%;
  height: 32px;
  display: block;
}

.playback-error {
  display: block;
  margin-top: 4px;
  color: #b42318;
}

.audio-asset-table {
  min-width: 1420px;
}
```

- [ ] **Step 5: Run admin tests**

Run:

```bash
cd data-query-app
pnpm run test:unit
pnpm run check
```

Expected: all pass.

## Task 4: Local Runtime Smoke

**Files:**

- No code files unless smoke exposes a defect.

- [ ] **Step 1: Restart backend/admin if needed**

Use project-local stack scripts:

```bash
bash ./scripts/dev/stop-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
```

If stopping the whole stack is too disruptive, restart only the backend/admin process with the existing script conventions and document the exception.

- [ ] **Step 2: Verify database still has audio rows**

Run:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -N -e "SELECT COUNT(*) FROM audio_assets WHERE deleted=0; SELECT COUNT(*) FROM audio_asset_links WHERE deleted=0; SELECT status, COUNT(*) FROM audio_assets WHERE deleted=0 GROUP BY status;"
```

Expected:

```text
428
428
```

- [ ] **Step 3: Select a playable audio row**

Run:

```bash
AUDIO_ROW=$(mysql -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -N -e "SELECT id, local_path FROM audio_assets WHERE deleted=0 AND status IN ('active','downloaded') AND local_path <> '' ORDER BY id LIMIT 1")
AUDIO_ID=$(printf '%s' "$AUDIO_ROW" | awk '{print $1}')
AUDIO_LOCAL_PATH=$(printf '%s' "$AUDIO_ROW" | cut -f2)
test -n "$AUDIO_ID"
test -n "$AUDIO_LOCAL_PATH"
AUDIO_SUFFIX=${AUDIO_LOCAL_PATH#data/terraPedia/media/audio/wiki/}
AUDIO_SUFFIX=${AUDIO_SUFFIX#media/audio/wiki/}
test -f "/home/lolben/data/terraPedia/media/audio/wiki/$AUDIO_SUFFIX"
printf 'AUDIO_ID=%s\nAUDIO_LOCAL_PATH=%s\n' "$AUDIO_ID" "$AUDIO_LOCAL_PATH"
```

Expected: command exits `0`, prints a numeric id, and confirms the selected DB file exists under the configured audio media root.

- [ ] **Step 4: Authenticate and smoke stream endpoint**

Run:

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:18088/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123456"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); console.log(j.data?.token || j.data?.accessToken || j.token || '')})")
test -n "$TOKEN"

UNAUTH_STATUS=$(curl -sS -o /tmp/audio-stream-unauth.json -w '%{http_code}' "http://127.0.0.1:18088/api/admin/audio-assets/$AUDIO_ID/stream")
test "$UNAUTH_STATUS" = "401"

HTTP_STATUS=$(curl -sS -D /tmp/audio-stream.headers \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:18088/api/admin/audio-assets/$AUDIO_ID/stream" \
  -o /tmp/audio-stream.sample \
  -w '%{http_code}')

test "$HTTP_STATUS" = "200"
grep -qi '^Content-Type: audio/' /tmp/audio-stream.headers
test "$(wc -c < /tmp/audio-stream.sample)" -gt 0
```

Expected:

- Unauthenticated request returns `401`.
- Authenticated request returns HTTP status `200`.
- `Content-Type` starts with `audio/`.
- Output file byte count is greater than `0`.

- [ ] **Step 5: Browser smoke admin page**

Open:

```text
http://127.0.0.1:3001/operations/audio-assets
```

Expected:

- Page loads existing 428-row dataset.
- Table has a playback column.
- At least one BGM row can play from the local stream endpoint.
- Browser devtools network request uses `/api/admin/audio-assets/{id}/stream`, not a wiki URL or local filesystem path.

## Task 5: Review, Repair, Commit

**Files:**

- Review all modified files.

- [ ] **Step 1: Run final focused validation**

Run:

```bash
cd back
mvn -Dtest=AdminAudioAssetControllerTest,AdminAudioAssetStreamServiceTest test

cd ../data-query-app
pnpm run test:unit
pnpm run check
```

Expected: all pass.

- [ ] **Step 2: Plan-audit the completed implementation**

Check:

- Backend endpoint is authenticated by the existing admin security path.
- Unsafe paths return 404.
- No absolute local path is exposed.
- UI playback uses the backend stream endpoint.
- No crawler/import/backfill command was run.
- No entity matching is mixed into this branch.

- [ ] **Step 3: Request multi-agent code review**

Ask reviewers to check:

- Security reviewer: path traversal, content headers, auth assumptions, absolute path leakage.
- Frontend reviewer: playback control ergonomics, API base behavior, table layout.
- Integration reviewer: runtime smoke completeness and whether the result closes “后台播放”.

- [ ] **Step 4: Repair Critical and Important review findings**

For each valid finding:

1. Patch the smallest owned file set.
2. Re-run the focused test that covers the defect.
3. Re-run final focused validation.

- [ ] **Step 5: Check git scope**

Run:

```bash
git status --short
git diff --stat
git diff -- back/src/main/java/com/terraria/skills/controller/AdminAudioAssetController.java
git diff -- back/src/main/java/com/terraria/skills/service/AdminAudioAssetStreamService.java
git diff -- data-query-app/pages/operations/audio-assets.vue
```

Expected changed files are limited to the planned backend, admin UI, tests, and this plan unless a reviewed repair explicitly adds another file.

- [ ] **Step 6: Commit focused implementation**

Stage explicit files only:

```bash
git add \
  back/src/main/java/com/terraria/skills/controller/AdminAudioAssetController.java \
  back/src/main/java/com/terraria/skills/service/AdminAudioAssetStreamService.java \
  back/src/test/java/com/terraria/skills/controller/AdminAudioAssetControllerTest.java \
  back/src/test/java/com/terraria/skills/service/AdminAudioAssetStreamServiceTest.java \
  data-query-app/pages/operations/audio-assets.vue \
  data-query-app/tests/audio-assets-page-contract.test.mjs \
  docs/superpowers/plans/2026-06-02-admin-audio-playback.md

git diff --cached --stat
git commit -m "feat(admin): stream local audio assets"
```

## Plan Audit Summary

## Verdict

- Status: Execution-ready after multi-agent plan review repairs.
- Main goal: Admin users can play local audio assets from the existing audio asset table.
- Closure definition: A logged-in admin can open `/operations/audio-assets`, click a browser audio control, and receive audio bytes from `/api/admin/audio-assets/{id}/stream`.

## Blocking Plan Defects

- Critical: None known.
- Important: Repaired. The admin page cannot use the protected stream endpoint directly in `<audio src>` because admin auth is header-only. The plan now requires authenticated fetch plus blob URL playback.
- Important: Repaired. Filesystem access now uses `terrapedia.audio-media-root`, supports the observed DB path prefixes, checks `toRealPath()`, and rejects symlink escapes.
- Important: Repaired. Runtime smoke now queries a playable id, fails on empty token, checks unauthenticated `401`, authenticated `200`, `audio/*`, and non-empty bytes.

## Plan Repairs

- Change: Add explicit service tests for path traversal, absolute paths, missing files, and missing rows.
- Reason: Playback endpoints are filesystem-backed and must fail closed.
- Validation added: Focused backend tests plus authenticated curl smoke.
- Change: Add symlink escape test and real-path enforcement.
- Reason: `normalize()` plus `startsWith()` is insufficient when media directories contain symlinks.
- Validation added: Symlink-to-outside-media-root test expects `404`.
- Change: Add frontend API base, row error state, blob URL binding, and stronger contract assertions.
- Reason: Playback must work with current header-only admin auth and avoid silent failures.
- Validation added: Contract ties click handler, authenticated fetch, blob URL, `<audio>` src, and cleanup together.

## Execution-Ready Plan

- Scope: Backend stream endpoint, admin playback UI, focused tests, runtime smoke.
- Agent split: Backend owner, admin UI owner, read-only reviewer. Backend owner also owns `application.yml` because the media root is a backend runtime contract.
- Smoke test: Query a playable `AUDIO_ID`, then authenticated curl to `/api/admin/audio-assets/$AUDIO_ID/stream` returns non-empty `audio/*` bytes.
- Final validation: Maven focused tests, admin unit contract tests, Nuxt typecheck, browser smoke.

## Residual Risk

- Risk: Blob playback loads the whole audio file before browser playback.
- Follow-up trigger: If playback latency is poor or files grow substantially, plan a second phase for short-lived signed stream URLs or range-aware streaming compatible with admin auth.
