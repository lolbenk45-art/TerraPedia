# Public Item Legacy Image List Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore public item-list images stored with configured legacy MinIO origins while returning them through the existing managed-image response normalization boundary.

**Architecture:** Keep the existing strict write-side `isManagedImageUrl` contract unchanged. Add a read-only prefix set that combines current MinIO endpoints with explicitly configured legacy origins, then use it only when public item SQL chooses a cached display image. The existing response sanitizer continues to emit the stable `/terrapedia-images/...` path consumed by the Nuxt preview proxy.

**Tech Stack:** Spring Boot, Java 17, MyBatis XML, JUnit 5, Mockito.

---

### Task 1: Expose read-only legacy managed-image prefixes

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/ManagedImageUrlPolicy.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/MinioManagedImageUrlPolicy.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/MinioManagedImageUrlPolicyTest.java`

- [x] **Step 1: Write the failing policy test**

```java
@Test
void shouldExposeConfiguredLegacyOriginsOnlyForReadSidePrefixMatching() {
    MinioStorageProperties properties = configuredProperties("items");
    properties.setLegacyImageOrigins("http://localhost:9000");
    MinioManagedImageUrlPolicy policy = new MinioManagedImageUrlPolicy(
        properties,
        connectionDetailsProvider(connectionDetails("http://minio:9000", "https://cdn.example.com"))
    );

    assertTrue(policy.trustedManagedImageReadUrlPrefixes()
        .contains("http://localhost:9000/terrapedia-images/items/"));
    assertFalse(policy.trustedManagedImageUrlPrefixes()
        .contains("http://localhost:9000/terrapedia-images/items/"));
}
```

- [x] **Step 2: Run the policy test and verify RED**

Run: `cd back && mvn -Dtest=MinioManagedImageUrlPolicyTest#shouldExposeConfiguredLegacyOriginsOnlyForReadSidePrefixMatching test`

Expected: compilation failure because `trustedManagedImageReadUrlPrefixes` does not yet exist.

- [x] **Step 3: Add the read-only prefix contract and implementation**

```java
// ManagedImageUrlPolicy.java
default List<String> trustedManagedImageReadUrlPrefixes() {
    return trustedManagedImageUrlPrefixes();
}

// MinioManagedImageUrlPolicy.java
@Override
public List<String> trustedManagedImageReadUrlPrefixes() {
    LinkedHashSet<String> prefixes = new LinkedHashSet<>(trustedManagedImageUrlPrefixes());
    MinioConnectionDetails connectionDetails = connectionDetailsProvider.getIfAvailable();
    String defaultObjectPrefix = connectionDetails == null
        ? properties.getObjectPrefix()
        : connectionDetails.objectPrefix();
    for (String objectPrefix : resolveTrustedObjectPrefixes(defaultObjectPrefix, properties.getManagedImageObjectPrefixes())) {
        for (String origin : legacyImageOrigins()) {
            addPrefix(prefixes, origin, resolveBucket(), objectPrefix);
        }
    }
    return List.copyOf(prefixes);
}
```

The implementation must use the existing configured legacy-origin parser, bucket resolver, and managed object-prefix resolver. It must not change `isManagedImageUrl`.

- [x] **Step 4: Run the policy test and verify GREEN**

Run: `cd back && mvn -Dtest=MinioManagedImageUrlPolicyTest#shouldExposeConfiguredLegacyOriginsOnlyForReadSidePrefixMatching test`

Expected: `BUILD SUCCESS`.

### Task 2: Select legacy cached URLs for the public item list

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicItemServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/PublicItemServiceImplTest.java`

- [x] **Step 1: Write the failing service test**

```java
@Test
void shouldUseReadSideImagePrefixesForPublicItemList() {
    List<String> currentPrefixes = List.of("http://minio:9000/terrapedia-images/items/");
    List<String> readPrefixes = List.of(
        "http://minio:9000/terrapedia-images/items/",
        "http://localhost:9000/terrapedia-images/items/"
    );
    PageQuery query = new PageQuery();
    query.setPage(1);
    query.setLimit(10);

    when(managedImageUrlPolicy.trustedManagedImageUrlPrefixes()).thenReturn(currentPrefixes);
    when(managedImageUrlPolicy.trustedManagedImageReadUrlPrefixes()).thenReturn(readPrefixes);
    when(itemMapper.countItemsWithSearch(eq(""), isNull(), isNull(), isNull(), isNull())).thenReturn(0L);
    when(itemMapper.selectPublicItemsWithSearch(eq(""), isNull(), isNull(), isNull(), isNull(), eq("id"), eq("asc"), eq(10L), eq(0L), eq(readPrefixes))).thenReturn(List.of());

    publicItemService.getPublicItems(query);

    verify(itemMapper).selectPublicItemsWithSearch(eq(""), isNull(), isNull(), isNull(), isNull(), eq("id"), eq("asc"), eq(10L), eq(0L), eq(readPrefixes));
}
```

- [x] **Step 2: Run the service test and verify RED**

Run: `cd back && mvn -Dtest=PublicItemServiceImplTest#shouldUseReadSideImagePrefixesForPublicItemList test`

Expected: Mockito verification failure because the service still passes only write-side prefixes to the mapper.

- [x] **Step 3: Make public read selection use the read-only prefix set**

```java
private List<String> managedImageReadPrefixes() {
    List<String> prefixes = managedImageUrlPolicy.trustedManagedImageReadUrlPrefixes();
    return prefixes == null ? List.of() : prefixes;
}
```

Pass `managedImageReadPrefixes()` to `selectPublicItemsWithSearch`, `selectPublicItemDetailById`, and `selectPublicItemSuggestions`; calculate the public-item cache fingerprint from that same set so cached list results cannot outlive an origin-policy change.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `cd back && mvn -Dtest=MinioManagedImageUrlPolicyTest,PublicItemServiceImplTest,ItemMapperPreferredImageSqlTest test`

Expected: `BUILD SUCCESS`.

- [x] **Step 5: Verify the original runtime symptom**

Run the existing local backend with its cache cleared through the application-supported cache boundary, then request `GET /api/public/items?page=1&limit=100` and confirm image values are present. Request a returned `/preview-assets/terrapedia-images/...` path through the running front server and confirm `200` with an image content type.
