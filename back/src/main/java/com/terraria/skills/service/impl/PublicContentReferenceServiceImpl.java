package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.PublicBossDetailDTO;
import com.terraria.skills.dto.PublicBossListDTO;
import com.terraria.skills.dto.PublicBossQuery;
import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveItemDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.service.PublicBossService;
import com.terraria.skills.service.PublicContentReferenceService;
import com.terraria.skills.service.PublicItemService;
import com.terraria.skills.service.PublicNpcService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PublicContentReferenceServiceImpl implements PublicContentReferenceService {

    private static final Set<String> SUPPORTED_TYPES = Set.of("item", "npc", "boss");
    private static final int MAX_SEARCH_LIMIT = 50;
    private static final int MAX_RESOLVE_LIMIT = 100;
    private static final String DEFAULT_ITEM_SEARCH_QUERY = "铁";
    private static final String DEFAULT_NPC_SEARCH_QUERY = "商";
    private static final String DEFAULT_BOSS_SEARCH_QUERY = "王";

    private final PublicItemService publicItemService;
    private final PublicNpcService publicNpcService;
    private final PublicBossService publicBossService;

    @Override
    public List<PublicContentReferenceDTO> search(Set<String> types, String query, int limit) {
        String keyword = normalizeText(query);
        Set<String> resolvedTypes = normalizeTypes(types);
        int resolvedLimit = clamp(limit, 1, MAX_SEARCH_LIMIT);
        int perTypeLimit = Math.max(1, resolvedLimit / Math.max(1, resolvedTypes.size()));
        List<PublicContentReferenceDTO> results = new ArrayList<>();

        if (resolvedTypes.contains("item")) {
            String itemKeyword = keyword.isEmpty() ? DEFAULT_ITEM_SEARCH_QUERY : keyword;
            List<PublicItemSuggestionDTO> items = publicItemService.searchSuggestions(itemKeyword, perTypeLimit);
            if (items != null) {
                for (PublicItemSuggestionDTO item : items) {
                    if (item != null) {
                        results.add(fromItemSuggestion(item));
                    }
                }
            }
        }

        if (resolvedTypes.contains("npc")) {
            String npcKeyword = keyword.isEmpty() ? DEFAULT_NPC_SEARCH_QUERY : keyword;
            PublicNpcQuery npcQuery = new PublicNpcQuery();
            npcQuery.setPage(1);
            npcQuery.setLimit(perTypeLimit);
            npcQuery.setSearch(npcKeyword);
            Page<NpcListItemDTO> npcPage = publicNpcService.getNpcs(npcQuery);
            if (npcPage != null && npcPage.getRecords() != null) {
                for (NpcListItemDTO npc : npcPage.getRecords()) {
                    if (npc != null) {
                        results.add(fromNpc(npc, stringId(npc.getId())));
                    }
                }
            }
        }

        if (resolvedTypes.contains("boss")) {
            String bossKeyword = keyword.isEmpty() ? DEFAULT_BOSS_SEARCH_QUERY : keyword;
            PublicBossQuery bossQuery = new PublicBossQuery();
            bossQuery.setPage(1);
            bossQuery.setLimit(perTypeLimit);
            bossQuery.setSearch(bossKeyword);
            Page<PublicBossListDTO> bossPage = publicBossService.getPublicBosses(bossQuery);
            if (bossPage != null && bossPage.getRecords() != null) {
                for (PublicBossListDTO boss : bossPage.getRecords()) {
                    if (boss != null) {
                        results.add(fromBoss(boss, stringId(boss.getId())));
                    }
                }
            }
        }

        return results.size() > resolvedLimit ? new ArrayList<>(results.subList(0, resolvedLimit)) : results;
    }

    @Override
    public List<PublicContentReferenceDTO> resolve(List<PublicContentReferenceResolveItemDTO> refs) {
        if (refs == null || refs.isEmpty()) {
            return List.of();
        }

        List<PublicContentReferenceDTO> results = new ArrayList<>();
        Set<String> seenRefs = new LinkedHashSet<>();
        int refCount = 0;

        for (PublicContentReferenceResolveItemDTO ref : refs) {
            if (ref == null) {
                continue;
            }

            String requestedType = normalizeType(ref.getType());
            String requestedId = normalizeText(ref.getId());
            Long numericId = parseId(requestedId);
            String responseType = requestedType.isEmpty() ? "unknown" : requestedType;
            String key = responseType + ":" + requestedId;
            if (!seenRefs.add(key)) {
                continue;
            }
            if (refCount >= MAX_RESOLVE_LIMIT) {
                continue;
            }
            refCount++;

            boolean valid = SUPPORTED_TYPES.contains(requestedType) && isSafeReferenceId(requestedId) && numericId != null;
            if (!valid) {
                results.add(missing(requestedType.isEmpty() ? "unknown" : requestedType, requestedId));
                continue;
            }

            if ("item".equals(requestedType)) {
                PublicItemDetailDTO item = publicItemService.getPublicItemById(numericId);
                results.add(item == null ? missing(requestedType, requestedId) : fromItemDetail(item, requestedId));
                continue;
            }

            if ("npc".equals(requestedType)) {
                NpcDetailDTO npc = publicNpcService.getNpcById(numericId);
                results.add(npc == null ? missing(requestedType, requestedId) : fromNpc(npc, requestedId));
                continue;
            }

            PublicBossDetailDTO boss = publicBossService.getPublicBossById(numericId);
            results.add(boss == null ? missing(requestedType, requestedId) : fromBoss(boss, requestedId));
        }

        return results;
    }

    private Set<String> normalizeTypes(Set<String> types) {
        if (types == null || types.isEmpty()) {
            return SUPPORTED_TYPES;
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String type : types) {
            String next = normalizeType(type);
            if (SUPPORTED_TYPES.contains(next)) {
                normalized.add(next);
            }
        }
        return normalized.isEmpty() ? SUPPORTED_TYPES : normalized;
    }

    private PublicContentReferenceDTO fromItemSuggestion(PublicItemSuggestionDTO item) {
        String id = stringId(item.getId());
        PublicContentReferenceDTO dto = base("item", id, item.getNameZh(), item.getName(), item.getInternalName());
        dto.setImageUrl(normalizeNullableText(item.getImage()));
        dto.setCategoryName(normalizeNullableText(item.getCategoryName()));
        dto.setSummary(joinSummary("物品", item.getCategoryName(), item.getRarity()));
        dto.setDetailPath("/items/" + id);
        dto.setAvailable(true);
        return dto;
    }

    private PublicContentReferenceDTO fromItemDetail(PublicItemDetailDTO item, String requestedId) {
        PublicContentReferenceDTO dto = base("item", requestedId, item.getNameZh(), item.getName(), item.getInternalName());
        dto.setImageUrl(normalizeNullableText(item.getImage()));
        dto.setCategoryName(normalizeNullableText(item.getCategoryName()));
        dto.setSummary(joinSummary("物品", item.getCategoryName(), item.getRarity()));
        dto.setDetailPath("/items/" + requestedId);
        dto.setAvailable(true);
        return dto;
    }

    private PublicContentReferenceDTO fromNpc(NpcListItemDTO npc, String requestedId) {
        PublicContentReferenceDTO dto = base("npc", requestedId, npc.getNameZh(), npc.getName(), npc.getInternalName());
        dto.setImageUrl(normalizeNullableText(npc.getImageUrl()));
        dto.setCategoryName(normalizeNullableText(npc.getCategoryName()));
        dto.setSummary(joinSummary(npc.getIsTownNpc() == Boolean.TRUE ? "城镇 NPC" : "NPC",
            npc.getCategoryName(),
            npc.getIsBoss() == Boolean.TRUE ? "Boss" : ""));
        dto.setDetailPath("/npcs/" + requestedId);
        dto.setAvailable(true);
        return dto;
    }

    private PublicContentReferenceDTO fromBoss(PublicBossListDTO boss, String requestedId) {
        PublicContentReferenceDTO dto = base("boss", requestedId, boss.getNameZh(), firstText(boss.getNameEn(), boss.getName()), boss.getCode());
        dto.setImageUrl(normalizeNullableText(boss.getImageUrl()));
        dto.setCategoryName(normalizeNullableText(boss.getBossType()));
        dto.setSummary(joinSummary(
            "Boss",
            boss.getBossType(),
            boss.getProgressionOrder() == null ? "" : "顺序 " + boss.getProgressionOrder()
        ));
        dto.setDetailPath("/bosses/" + requestedId);
        dto.setAvailable(true);
        return dto;
    }

    private PublicContentReferenceDTO base(String type, String id, String label, String name, String internalName) {
        PublicContentReferenceDTO dto = new PublicContentReferenceDTO();
        dto.setType(type);
        dto.setId(id);
        dto.setLabel(firstText(label, name, internalName, type + " #" + id));
        dto.setName(normalizeNullableText(name));
        dto.setInternalName(normalizeNullableText(internalName));
        return dto;
    }

    private PublicContentReferenceDTO missing(String type, String id) {
        PublicContentReferenceDTO dto = new PublicContentReferenceDTO();
        dto.setType(type);
        dto.setId(id);
        dto.setLabel(type + " #" + id);
        dto.setDetailPath(switch (type) {
            case "npc" -> "/npcs";
            case "boss" -> "/bosses/" + id;
            default -> "/items";
        });
        dto.setAvailable(false);
        return dto;
    }

    private String joinSummary(String first, String second, String third) {
        List<String> parts = new ArrayList<>();
        addSummaryPart(parts, first);
        addSummaryPart(parts, second);
        addSummaryPart(parts, third);
        return String.join(" · ", parts);
    }

    private void addSummaryPart(List<String> parts, String value) {
        String normalized = normalizeText(value);
        if (!normalized.isEmpty()) {
            parts.add(normalized);
        }
    }

    private String firstText(String... values) {
        for (String value : values) {
            String normalized = normalizeText(value);
            if (!normalized.isEmpty()) {
                return normalized;
            }
        }
        return "";
    }

    private String normalizeType(String value) {
        return normalizeText(value).toLowerCase(Locale.ROOT);
    }

    private String normalizeText(Object value) {
        return String.valueOf(value == null ? "" : value).trim();
    }

    private String normalizeNullableText(String value) {
        String normalized = normalizeText(value);
        return normalized.isEmpty() ? null : normalized;
    }

    private String stringId(Long id) {
        return id == null ? "" : String.valueOf(id);
    }

    private Long parseId(String value) {
        try {
            return Long.parseLong(normalizeText(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private boolean isSafeReferenceId(String value) {
        return normalizeText(value).matches("\\d{1,12}");
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
