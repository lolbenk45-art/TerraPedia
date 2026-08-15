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
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
            .filter(Map.class::isInstance)
            .map(TownNpcMaintenanceDomainMapper::copyMapObject)
            .toList();
    }

    private static Map<String, Object> copyMap(Map<String, Object> map) {
        return map == null ? new LinkedHashMap<>() : new LinkedHashMap<>(map);
    }

    private static Map<String, Object> copyMapObject(Object raw) {
        if (!(raw instanceof Map<?, ?> map)) {
            return new LinkedHashMap<>();
        }
        return castMap(map);
    }

    private static Map<String, Object> castMap(Map<?, ?> map) {
        Map<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, value) -> {
            if (key != null) {
                result.put(String.valueOf(key), value);
            }
        });
        return result;
    }

    private static String toText(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private static Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Integer toInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Boolean toBoolean(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim().toLowerCase();
        if (Objects.equals(text, "true") || Objects.equals(text, "1")) {
            return true;
        }
        if (Objects.equals(text, "false") || Objects.equals(text, "0")) {
            return false;
        }
        return null;
    }
}
