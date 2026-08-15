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
