# NPC Public + Town Domain M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the backend so the public NPC aggregate and Town NPC maintenance responses use the frozen NPC domain vocabulary introduced in M1-M2.

**Architecture:** Keep the existing public/service endpoints, but align their response shapes to the domain baseline instead of leaking implicit fields. For the public surface, extend `NpcDetailDTO` to include the shared base field `behaviorNotes`. For Town NPC maintenance, replace the top-level `Map<String, Object>` response with explicit DTOs plus a mapper that projects `wikiAssets` and `baseStats` into stable contracts while preserving existing JSON keys that the admin UI still consumes.

**Tech Stack:** Spring Boot 3, Lombok DTOs, JUnit 5, MockMvc, Maven

---

## File Structure

- Modify: `back/src/main/java/com/terraria/skills/dto/NpcDetailDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/NpcStatBlockDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/NpcWikiAssetsDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/TownNpcRowDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/TownNpcOverviewDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`
- Create: `back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java`

### Task 1: Align Public NPC Aggregate With Shared Base Domain

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/NpcDetailDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`

- [ ] **Step 1: Write the failing test**

In `PublicNpcAggregateControllerTest.java`, add:

```java
@Test
void shouldExposeBehaviorNotesOnAggregateNpcBase() throws Exception {
    NpcDetailDTO npc = new NpcDetailDTO();
    npc.setId(7L);
    npc.setGameId(22L);
    npc.setInternalName("Guide");
    npc.setName("Guide");
    npc.setNameZh("向导");
    npc.setBehaviorNotes("Offers advice to new players.");

    publicNpcService.npcToReturn = npc;

    mockMvc.perform(get("/public/npcs/7/aggregate").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.npc.behaviorNotes").value("Offers advice to new players."));
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd G:\ClaudeCode\TerraPedia-dev\back
mvn "-Dtest=PublicNpcAggregateControllerTest#shouldExposeBehaviorNotesOnAggregateNpcBase" test
```

Expected:

- FAIL because `NpcDetailDTO` does not expose `behaviorNotes`

- [ ] **Step 3: Implement the minimal DTO and mapper change**

Update `NpcDetailDTO.java`:

```java
@Data
@EqualsAndHashCode(callSuper = true)
public class NpcDetailDTO extends NpcListItemDTO {
    private String behaviorNotes;
    private Integer status;
}
```

Update `PublicNpcServiceImpl.java` inside `toDetailDto(...)`:

```java
dto.setBehaviorNotes(trimToNull(npc.getBehaviorNotes()));
dto.setStatus(npc.getStatus());
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
cd G:\ClaudeCode\TerraPedia-dev\back
mvn "-Dtest=PublicNpcAggregateControllerTest#shouldExposeBehaviorNotesOnAggregateNpcBase" test
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add back/src/main/java/com/terraria/skills/dto/NpcDetailDTO.java back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java
git commit -m "feat: expose NPC behavior notes in public aggregate"
```

### Task 2: Introduce Explicit Town NPC Maintenance DTOs And Mapper

**Files:**
- Create: `back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java`
- Create: `back/src/main/java/com/terraria/skills/dto/NpcStatBlockDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/NpcWikiAssetsDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/TownNpcRowDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/TownNpcOverviewDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java`

- [ ] **Step 1: Write the failing mapper test**

Create `TownNpcMaintenanceDomainMapperTest.java`:

```java
package com.terraria.skills.service;

import com.terraria.skills.dto.TownNpcOverviewDTO;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class TownNpcMaintenanceDomainMapperTest {

    @Test
    void shouldProjectWikiAssetsAndBaseStatsIntoStableMaintenanceContracts() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", 1L);
        row.put("gameId", 22L);
        row.put("name", "Guide");
        row.put("nameZh", "向导");
        row.put("isTownNpc", true);
        row.put("baseStats", Map.of(
            "lifeMax", 250,
            "damage", 10,
            "defense", 30,
            "knockBackResist", 0
        ));
        row.put("wikiDetails", Map.of(
            "spriteImage", "/sprite.png",
            "mapIconImage", "/icon.png",
            "dialogPortraitImage", "/portrait.png"
        ));

        TownNpcOverviewDTO overview = TownNpcMaintenanceDomainMapper.toOverview(
            true,
            "wiki-town-npc-maintenance.latest.json",
            "reports/wiki-town-npc-maintenance.latest.json",
            "2026-04-18T10:00:00Z",
            Map.of(),
            "2026-04-18T09:55:00Z",
            "wiki",
            false,
            null,
            null,
            null,
            Map.of(),
            Map.of("gold", "/gold.png"),
            List.of(row),
            Map.of("totalTownNpcs", 1)
        );

        assertEquals(1, overview.getRecords().size());
        assertEquals("Guide", overview.getRecords().get(0).getName());
        assertEquals("/sprite.png", overview.getRecords().get(0).getWikiAssets().getSpriteImage());
        assertEquals(250, overview.getRecords().get(0).getBaseStats().getLifeMax());
        assertNotNull(overview.getRecords().get(0).getWikiDetails());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd G:\ClaudeCode\TerraPedia-dev\back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest" test
```

Expected:

- FAIL because the DTOs and mapper do not exist yet

- [ ] **Step 3: Implement the DTOs**

Create `NpcStatBlockDTO.java`:

```java
package com.terraria.skills.dto;

import lombok.Data;

@Data
public class NpcStatBlockDTO {
    private Object lifeMax;
    private Object damage;
    private Object defense;
    private Object knockBackResist;
}
```

Create `NpcWikiAssetsDTO.java`:

```java
package com.terraria.skills.dto;

import lombok.Data;

@Data
public class NpcWikiAssetsDTO {
    private String spriteImage;
    private String mapIconImage;
    private String dialogPortraitImage;
}
```

Create `TownNpcRowDTO.java` with the explicit maintenance fields:

```java
package com.terraria.skills.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
public class TownNpcRowDTO extends NpcListItemDTO {
    private Long gamePeriodId;
    private String gamePeriodLabel;
    private Integer shopEntryCount;
    private String behaviorNotes;
    private Boolean hasBehaviorNotes;
    private String behaviorNotesPreview;
    private Boolean hasShopEntries;
    private Boolean scrapeAvailable;
    private String scrapedFunctionSummary;
    private String scrapedMoveInSummary;
    private List<Map<String, Object>> scrapedMoveInConditions = new ArrayList<>();
    private List<Map<String, Object>> scrapedShopItems = new ArrayList<>();
    private Integer scrapedShopItemCount;
    private Long suggestedGamePeriodId;
    private String suggestedGamePeriodLabel;
    private String suggestedGamePeriodReason;
    private String suggestedBehaviorNotes;
    private List<Map<String, Object>> suggestedShopEntries = new ArrayList<>();
    private Integer matchedSuggestedShopEntryCount;
    private List<Map<String, Object>> unmatchedShopItems = new ArrayList<>();
    private String sourcePageTitle;
    private String sourcePageUrl;
    private List<Map<String, Object>> currentShopItems = new ArrayList<>();
    private NpcStatBlockDTO baseStats;
    private Map<String, Object> wikiDetails = new LinkedHashMap<>();
    private NpcWikiAssetsDTO wikiAssets;
    private String updatedAt;
}
```

Create `TownNpcOverviewDTO.java`:

```java
package com.terraria.skills.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
public class TownNpcOverviewDTO {
    private Boolean reportFound;
    private String reportFileName;
    private String reportPath;
    private String reportUpdatedAt;
    private Map<String, Object> reportSummary = new LinkedHashMap<>();
    private String reportGeneratedAt;
    private String sourceMode;
    private Boolean importReportFound;
    private String importReportFileName;
    private String importReportPath;
    private String importReportUpdatedAt;
    private Map<String, Object> latestImportReport = new LinkedHashMap<>();
    private Map<String, String> coinIcons = new LinkedHashMap<>();
    private List<TownNpcRowDTO> records = new ArrayList<>();
    private Map<String, Object> summary = new LinkedHashMap<>();
}
```

- [ ] **Step 4: Implement the mapper**

Create `TownNpcMaintenanceDomainMapper.java`:

```java
package com.terraria.skills.service;

import com.terraria.skills.dto.NpcStatBlockDTO;
import com.terraria.skills.dto.NpcWikiAssetsDTO;
import com.terraria.skills.dto.TownNpcOverviewDTO;
import com.terraria.skills.dto.TownNpcRowDTO;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class TownNpcMaintenanceDomainMapper {

    private TownNpcMaintenanceDomainMapper() {
    }

    public static TownNpcOverviewDTO toOverview(
        Boolean reportFound,
        String reportFileName,
        String reportPath,
        String reportUpdatedAt,
        Map<String, Object> reportSummary,
        String reportGeneratedAt,
        String sourceMode,
        Boolean importReportFound,
        String importReportFileName,
        String importReportPath,
        String importReportUpdatedAt,
        Map<String, Object> latestImportReport,
        Map<String, String> coinIcons,
        List<Map<String, Object>> rows,
        Map<String, Object> summary
    ) {
        TownNpcOverviewDTO dto = new TownNpcOverviewDTO();
        dto.setReportFound(reportFound);
        dto.setReportFileName(reportFileName);
        dto.setReportPath(reportPath);
        dto.setReportUpdatedAt(reportUpdatedAt);
        dto.setReportSummary(copyMap(reportSummary));
        dto.setReportGeneratedAt(reportGeneratedAt);
        dto.setSourceMode(sourceMode);
        dto.setImportReportFound(importReportFound);
        dto.setImportReportFileName(importReportFileName);
        dto.setImportReportPath(importReportPath);
        dto.setImportReportUpdatedAt(importReportUpdatedAt);
        dto.setLatestImportReport(copyMap(latestImportReport));
        dto.setCoinIcons(coinIcons == null ? new LinkedHashMap<>() : new LinkedHashMap<>(coinIcons));
        dto.setRecords(rows == null ? List.of() : rows.stream().map(TownNpcMaintenanceDomainMapper::toRow).toList());
        dto.setSummary(copyMap(summary));
        return dto;
    }

    public static TownNpcRowDTO toRow(Map<String, Object> row) {
        TownNpcRowDTO dto = new TownNpcRowDTO();
        dto.setId(toLong(row.get("id")));
        dto.setGameId(toLong(row.get("gameId")));
        dto.setInternalName(toText(row.get("internalName")));
        dto.setName(toText(row.get("name")));
        dto.setNameZh(toText(row.get("nameZh")));
        dto.setCategoryName(toText(row.get("categoryName")));
        dto.setIsTownNpc(toBoolean(row.get("isTownNpc")));
        dto.setImageUrl(toText(row.get("imageUrl")));
        dto.setGamePeriodId(toLong(row.get("gamePeriodId")));
        dto.setGamePeriodLabel(toText(row.get("gamePeriodLabel")));
        dto.setShopEntryCount(toInteger(row.get("shopEntryCount")));
        dto.setBehaviorNotes(toText(row.get("behaviorNotes")));
        dto.setHasBehaviorNotes(toBoolean(row.get("hasBehaviorNotes")));
        dto.setBehaviorNotesPreview(toText(row.get("behaviorNotesPreview")));
        dto.setHasShopEntries(toBoolean(row.get("hasShopEntries")));
        dto.setScrapeAvailable(toBoolean(row.get("scrapeAvailable")));
        dto.setScrapedFunctionSummary(toText(row.get("scrapedFunctionSummary")));
        dto.setScrapedMoveInSummary(toText(row.get("scrapedMoveInSummary")));
        dto.setScrapedMoveInConditions(copyList(row.get("scrapedMoveInConditions")));
        dto.setScrapedShopItems(copyList(row.get("scrapedShopItems")));
        dto.setScrapedShopItemCount(toInteger(row.get("scrapedShopItemCount")));
        dto.setSuggestedGamePeriodId(toLong(row.get("suggestedGamePeriodId")));
        dto.setSuggestedGamePeriodLabel(toText(row.get("suggestedGamePeriodLabel")));
        dto.setSuggestedGamePeriodReason(toText(row.get("suggestedGamePeriodReason")));
        dto.setSuggestedBehaviorNotes(toText(row.get("suggestedBehaviorNotes")));
        dto.setSuggestedShopEntries(copyList(row.get("suggestedShopEntries")));
        dto.setMatchedSuggestedShopEntryCount(toInteger(row.get("matchedSuggestedShopEntryCount")));
        dto.setUnmatchedShopItems(copyList(row.get("unmatchedShopItems")));
        dto.setSourcePageTitle(toText(row.get("sourcePageTitle")));
        dto.setSourcePageUrl(toText(row.get("sourcePageUrl")));
        dto.setCurrentShopItems(copyList(row.get("currentShopItems")));
        dto.setBaseStats(toStatBlock(row.get("baseStats")));
        dto.setWikiDetails(copyMapObject(row.get("wikiDetails")));
        dto.setWikiAssets(toWikiAssets(dto.getWikiDetails()));
        dto.setUpdatedAt(toText(row.get("updatedAt")));
        return dto;
    }

    private static NpcStatBlockDTO toStatBlock(Object raw) {
        Map<String, Object> map = raw instanceof Map<?, ?> input ? castMap(input) : Collections.emptyMap();
        NpcStatBlockDTO dto = new NpcStatBlockDTO();
        dto.setLifeMax(map.get("lifeMax"));
        dto.setDamage(map.get("damage"));
        dto.setDefense(map.get("defense"));
        dto.setKnockBackResist(map.get("knockBackResist"));
        return dto;
    }

    private static NpcWikiAssetsDTO toWikiAssets(Map<String, Object> wikiDetails) {
        NpcWikiAssetsDTO dto = new NpcWikiAssetsDTO();
        dto.setSpriteImage(toText(wikiDetails.get("spriteImage")));
        dto.setMapIconImage(toText(wikiDetails.get("mapIconImage")));
        dto.setDialogPortraitImage(toText(wikiDetails.get("dialogPortraitImage")));
        return dto;
    }

    private static List<Map<String, Object>> copyList(Object raw) {
        if (!(raw instanceof List<?> list)) return List.of();
        return list.stream()
            .filter(Map.class::isInstance)
            .map(item -> copyMapObject(item))
            .toList();
    }

    private static Map<String, Object> copyMap(Map<String, Object> map) {
        return map == null ? new LinkedHashMap<>() : new LinkedHashMap<>(map);
    }

    private static Map<String, Object> copyMapObject(Object raw) {
        if (!(raw instanceof Map<?, ?> map)) return new LinkedHashMap<>();
        return castMap(map);
    }

    private static Map<String, Object> castMap(Map<?, ?> map) {
        Map<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, value) -> {
            if (key != null) result.put(String.valueOf(key), value);
        });
        return result;
    }

    private static String toText(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private static Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.longValue();
        try { return Long.parseLong(String.valueOf(value).trim()); } catch (Exception ignored) { return null; }
    }

    private static Integer toInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.intValue();
        try { return Integer.parseInt(String.valueOf(value).trim()); } catch (Exception ignored) { return null; }
    }

    private static Boolean toBoolean(Object value) {
        if (value instanceof Boolean bool) return bool;
        if (value == null) return null;
        String text = String.valueOf(value).trim().toLowerCase();
        if (Objects.equals(text, "true") || Objects.equals(text, "1")) return true;
        if (Objects.equals(text, "false") || Objects.equals(text, "0")) return false;
        return null;
    }
}
```

- [ ] **Step 5: Adapt the controller to return the explicit DTO**

Change `AdminTownNpcMaintenanceController.java`:

```java
import com.terraria.skills.dto.TownNpcOverviewDTO;
import com.terraria.skills.service.TownNpcMaintenanceDomainMapper;
```

Change the endpoint signature:

```java
public ResponseEntity<ApiResponse<TownNpcOverviewDTO>> getMaintenanceOverview()
```

Replace the final `payload` map assembly with:

```java
TownNpcOverviewDTO payload = TownNpcMaintenanceDomainMapper.toOverview(
    artifact != null,
    artifact == null ? null : artifact.path.getFileName().toString(),
    artifact == null ? null : artifact.relativePath,
    artifact == null ? null : artifact.updatedAt,
    normalizeObject(report.getOrDefault("summary", Collections.emptyMap())),
    trimToNull(report.get("generatedAt")),
    trimToNull(report.get("sourceMode")),
    importArtifact != null,
    importArtifact == null ? null : importArtifact.path.getFileName().toString(),
    importArtifact == null ? null : importArtifact.relativePath,
    importArtifact == null ? null : importArtifact.updatedAt,
    normalizeObject(importReport),
    loadCoinIcons(),
    rows,
    buildSummary(rows)
);
return ResponseEntity.ok(ApiResponse.success(payload));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:

```powershell
cd G:\ClaudeCode\TerraPedia-dev\back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest,PublicNpcAggregateControllerTest" test
```

Expected:

- both tests pass

- [ ] **Step 7: Commit**

```bash
git add back/src/main/java/com/terraria/skills/dto/NpcStatBlockDTO.java back/src/main/java/com/terraria/skills/dto/NpcWikiAssetsDTO.java back/src/main/java/com/terraria/skills/dto/TownNpcRowDTO.java back/src/main/java/com/terraria/skills/dto/TownNpcOverviewDTO.java back/src/main/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapper.java back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java
git commit -m "feat: add town NPC maintenance domain mapper"
```

## Self-Review

- Spec coverage:
  - M3 public NPC mapping: covered by Task 1
  - M3 Town NPC maintenance response mapping: covered by Task 2
  - M4 frontend/admin alignment: intentionally deferred
- Placeholder scan:
  - no `TODO`, `TBD`, or unresolved placeholders remain
- Type consistency:
  - shared public base uses `behaviorNotes`
  - maintenance uses `baseStats` and `wikiAssets` as explicit stable keys

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-npc-public-town-domain-m3.md`. Inline execution is already requested, so execute Task 1 and Task 2 in this session and stop after targeted backend verification.
