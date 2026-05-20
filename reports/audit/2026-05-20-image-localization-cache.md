# image localization cache audit (2026-05-20)

## Scope

- Plan task: `I-0.3 验证 image localization 失败缓存的 evict 行为`
- Target file: `back/src/main/java/com/terraria/skills/service/impl/MinioWikiImageLocalizationServiceImpl.java`
- Goal: verify whether `FAILURE_CACHE_MAX_ENTRIES = 2048` has real eviction behavior.

## Findings

The service declares three in-memory caches:

```java
private final Map<String, FileUploadResultDTO> uploadCache = new ConcurrentHashMap<>();
private final Map<String, String> wikiFileUrlCache = new ConcurrentHashMap<>();
private final Map<String, Instant> failureCache = new ConcurrentHashMap<>();
```

`failureCache` has two controls:

- TTL check in `isFailureCached(...)`: if the stored `Instant` is older than `FAILURE_CACHE_TTL` (10 minutes), the entry is removed lazily when that key is checked.
- size guard in `rememberFailure(...)`: when `failureCache.size() >= FAILURE_CACHE_MAX_ENTRIES`, the implementation calls `failureCache.clear()`.

Current code:

```java
private void rememberFailure(String cacheKey) {
    if (failureCache.size() >= FAILURE_CACHE_MAX_ENTRIES) {
        failureCache.clear();
    }
    failureCache.put(cacheKey, Instant.now());
}
```

## Eviction Assessment

`FAILURE_CACHE_MAX_ENTRIES = 2048` does not implement bounded eviction in the usual sense.

- It does not evict one oldest or least-recent entry.
- It does not maintain LRU/LFU/TTL-on-write semantics.
- At capacity it clears every cached failure, then inserts the current key.
- Expired entries are only removed when the same key is checked; there is no periodic cleanup.

So the maximum-size guard prevents unbounded growth of `failureCache`, but it causes a full cache flush and can create retry storms after 2048 distinct failures.

## Related Cache Risk

`uploadCache` and `wikiFileUrlCache` are unbounded `ConcurrentHashMap` instances.

- `uploadCache` stores mirrored upload DTOs under normalized and effective URLs.
- `wikiFileUrlCache` stores resolved wiki file image URLs via `computeIfAbsent(...)`.
- Neither cache has maximum size or TTL in the current implementation.

## Existing Test Coverage

`MinioWikiImageLocalizationServiceImplTest` covers:

- successful mirroring to MinIO;
- fallback behavior when upload fails;
- reuse of recent failure cache for the same URL;
- cached upload reuse;
- wiki URL detection.

No test covers:

- 2048+ failure entries;
- eviction ordering;
- TTL expiration with controlled clock;
- unbounded growth of `uploadCache` or `wikiFileUrlCache`.

## Recommendation

T-1.8 should proceed and should be raised in priority if this service remains on the critical data-source path.

Use a real bounded cache implementation such as Caffeine:

- `failureCache`: `expireAfterWrite(10m).maximumSize(2048)`;
- `uploadCache`: add a bounded maximum and TTL suitable for API/runtime reuse;
- `wikiFileUrlCache`: add a bounded maximum and TTL for wiki file resolution.

The implementation should include tests for:

- inserting 2049 entries does not clear the whole cache;
- maximum size is enforced;
- expiration works via a controllable ticker/clock;
- failure cache cleanup does not trigger a burst of immediate retries for unrelated failed URLs.

## I-0.3 Answer

`FAILURE_CACHE_MAX_ENTRIES = 2048` does not have true eviction. It is a full-cache clear threshold. The current code avoids unlimited `failureCache` growth but does not provide stable eviction semantics, and two adjacent caches are unbounded.

