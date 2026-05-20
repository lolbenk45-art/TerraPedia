package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.terraria.skills.dto.ItemImportRequestDTO;
import com.terraria.skills.dto.ItemImportResultDTO;
import com.terraria.skills.dto.NormalizedItemImportDTO;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.ItemImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class ItemImportServiceImpl implements ItemImportService {

    private static final Map<String, String> CATEGORY_CODE_ALIASES = Map.of(
        "DRILL", "TOOL_DRILL",
        "CHAINSAW", "TOOL_CHAINSAW",
        "HELMET", "ARMOR_PART_HEAD",
        "CHESTPLATE", "ARMOR_PART_BODY",
        "LEGGINGS", "ARMOR_PART_LEGS"
    );

    private final ItemMapper itemMapper;
    private final CategoryMapper categoryMapper;

    @Override
    @Transactional
    @Caching(evict = {
        @CacheEvict(cacheNames = "item:public:list", allEntries = true),
        @CacheEvict(cacheNames = "item:public:detail", allEntries = true),
        @CacheEvict(cacheNames = "item:public:suggestions", allEntries = true),
        @CacheEvict(cacheNames = "item:list", allEntries = true),
        @CacheEvict(cacheNames = "item:detail", allEntries = true),
        @CacheEvict(cacheNames = "item:suggestions", allEntries = true),
        @CacheEvict(cacheNames = "item:aggregate", allEntries = true),
        @CacheEvict(cacheNames = "stats:overview", allEntries = true)
    })
    public ItemImportResultDTO importItems(ItemImportRequestDTO request) {
        return importItems(request, false);
    }

    @Override
    @Transactional
    public ItemImportResultDTO importItems(ItemImportRequestDTO request, boolean dryRun) {
        ItemImportResultDTO result = new ItemImportResultDTO();
        if (request == null) {
            result.getErrors().add("No request provided");
            return result;
        }

        result.setSource(request.getSource());

        List<NormalizedItemImportDTO> items = request.getItems();
        if (items == null || items.isEmpty()) {
            result.getErrors().add("No items provided");
            return result;
        }

        Map<String, Category> categoriesByCode = loadCategoryCodeMap();
        result.setTotal(items.size());

        for (int index = 0; index < items.size(); index++) {
            NormalizedItemImportDTO payload = items.get(index);
            try {
                importSingleItem(payload, Boolean.TRUE.equals(request.getOverwriteExisting()), dryRun, categoriesByCode, result);
            } catch (IllegalArgumentException ex) {
                String message = "Item[" + index + "] " + ex.getMessage();
                result.getErrors().add(message);
                result.setSkipped(result.getSkipped() + 1);
                if (dryRun) {
                    result.getToBeSkipped().add(preview(payload, ex.getMessage()));
                }
            } catch (Exception ex) {
                String message = "Item[" + index + "] import failed: " + ex.getMessage();
                log.error(message, ex);
                result.getErrors().add(message);
                result.setSkipped(result.getSkipped() + 1);
                if (dryRun) {
                    result.getToBeSkipped().add(preview(payload, "import failed: " + ex.getMessage()));
                }
            }
        }

        return result;
    }

    private void importSingleItem(
        NormalizedItemImportDTO payload,
        boolean overwriteExisting,
        boolean dryRun,
        Map<String, Category> categoriesByCode,
        ItemImportResultDTO result
    ) {
        validatePayload(payload);

        Category category = resolveCategory(payload, categoriesByCode);
        Item existing = findExistingItem(payload);

        if (existing == null) {
            if (dryRun) {
                result.setCreated(result.getCreated() + 1);
                result.getToBeCreated().add(preview(payload, "new_item"));
                return;
            }
            Item created = new Item();
            applyPayload(created, payload, category);
            if (created.getStatus() == null) {
                created.setStatus(1);
            }
            itemMapper.insert(created);
            result.setCreated(result.getCreated() + 1);
            return;
        }

        if (!overwriteExisting) {
            result.setSkipped(result.getSkipped() + 1);
            if (dryRun) {
                result.getToBeSkipped().add(preview(payload, "existing_item_overwrite_disabled"));
            }
            return;
        }

        if (dryRun) {
            result.setUpdated(result.getUpdated() + 1);
            result.getToBeUpdated().add(preview(payload, "existing_item"));
            return;
        }

        applyPayload(existing, payload, category);
        existing.setUpdatedAt(LocalDateTime.now());
        itemMapper.updateById(existing);
        result.setUpdated(result.getUpdated() + 1);
    }

    private void validatePayload(NormalizedItemImportDTO payload) {
        if (payload == null) {
            throw new IllegalArgumentException("payload is null");
        }
        if (isBlank(payload.getName())) {
            throw new IllegalArgumentException("name is required");
        }
        if (isBlank(payload.getCategoryCode())) {
            throw new IllegalArgumentException("categoryCode is required for item " + payload.getName());
        }
    }

    private Category resolveCategory(NormalizedItemImportDTO payload, Map<String, Category> categoriesByCode) {
        String code = resolveCategoryCode(payload);
        Category category = categoriesByCode.get(code);
        if (category == null) {
            throw new IllegalArgumentException("categoryCode not found: " + payload.getCategoryCode());
        }
        return category;
    }

    private Item findExistingItem(NormalizedItemImportDTO payload) {
        if (!isBlank(payload.getInternalName())) {
            Item byInternalName = itemMapper.selectOne(
                new LambdaQueryWrapper<Item>()
                    .eq(Item::getInternalName, payload.getInternalName().trim())
                    .last("LIMIT 1")
            );
            if (byInternalName != null) {
                return byInternalName;
            }
        }

        return itemMapper.selectOne(
            new LambdaQueryWrapper<Item>()
                .eq(Item::getName, payload.getName().trim())
                .last("LIMIT 1")
        );
    }

    private void applyPayload(Item item, NormalizedItemImportDTO payload, Category category) {
        item.setName(payload.getName().trim());
        item.setInternalName(resolveInternalName(payload));
        item.setImage(blankToNull(payload.getImage()));
        item.setCategoryId(category.getId());
        item.setDescription(blankToNull(payload.getDescription()));
        item.setDamage(payload.getDamage());
        item.setDefense(payload.getDefense());
        item.setKnockback(payload.getKnockback());
        item.setUseTime(payload.getUseTime());
        item.setWidth(payload.getWidth());
        item.setHeight(payload.getHeight());
        item.setBuy(payload.getBuy());
        item.setSell(payload.getSell());
        item.setTooltip(blankToNull(payload.getTooltip()));
        item.setRarityId(resolveRarityId(payload));
        item.setGamePeriodId(payload.getGamePeriodId());
        item.setGameModelId(payload.getGameModelId());
        item.setIsStackable(payload.getIsStackable());
        item.setStackSize(payload.getStackSize());
        item.setStatus(payload.getStatus() == null ? 1 : payload.getStatus());
    }

    private Map<String, Category> loadCategoryCodeMap() {
        List<Category> categories = categoryMapper.selectList(
            new LambdaQueryWrapper<Category>()
                .eq(Category::getDeleted, 0)
        );
        Map<String, Category> map = new HashMap<>();
        for (Category category : categories) {
            if (!isBlank(category.getCode())) {
                map.put(category.getCode().trim().toUpperCase(Locale.ROOT), category);
            }
        }
        return map;
    }

    private String resolveCategoryCode(NormalizedItemImportDTO payload) {
        String code = normalizeCategoryCode(payload.getCategoryCode());
        String identity = ((payload.getName() == null ? "" : payload.getName()) + " "
            + (payload.getInternalName() == null ? "" : payload.getInternalName()) + " "
            + (payload.getNameZh() == null ? "" : payload.getNameZh())).toLowerCase(Locale.ROOT);
        if ("PICKAXE".equals(code) || "TOOL_PICKAXE_DRILL".equals(code)) {
            if (isBlank(identity)) {
                return code;
            }
            return containsAny(identity, "drill", "钻头", "电钻") ? "TOOL_DRILL" : "TOOL_PICKAXE";
        }
        if ("AXE".equals(code) || "TOOL_AXE_CHAINSAW".equals(code)) {
            if (isBlank(identity)) {
                return code;
            }
            return containsAny(identity, "chainsaw", "链锯") ? "TOOL_CHAINSAW" : "TOOL_AXE";
        }
        return code;
    }

    private boolean containsAny(String value, String... keywords) {
        if (value == null) {
            return false;
        }
        for (String keyword : keywords) {
            if (value.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private String normalizeCategoryCode(String rawCode) {
        String code = rawCode.trim().toUpperCase(Locale.ROOT);
        return CATEGORY_CODE_ALIASES.getOrDefault(code, code);
    }

    private Long resolveRarityId(NormalizedItemImportDTO payload) {
        if (payload.getRarityId() != null) {
            return payload.getRarityId();
        }
        if (isBlank(payload.getRarity())) {
            return null;
        }

        String rarity = payload.getRarity().trim().toLowerCase(Locale.ROOT);
        return switch (rarity) {
            case "common", "普通" -> 1L;
            case "rare", "稀有" -> 2L;
            case "epic", "史诗" -> 3L;
            case "legendary", "传说" -> 4L;
            default -> null;
        };
    }

    private String resolveInternalName(NormalizedItemImportDTO payload) {
        if (!isBlank(payload.getInternalName())) {
            return payload.getInternalName().trim();
        }
        return payload.getName().trim().toUpperCase(Locale.ROOT)
            .replaceAll("[^A-Z0-9]+", "_")
            .replaceAll("^_+|_+$", "");
    }

    private String blankToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private ItemImportResultDTO.ItemImportPreviewDTO preview(NormalizedItemImportDTO payload, String reason) {
        return ItemImportResultDTO.ItemImportPreviewDTO.of(
            payload == null ? null : blankToNull(payload.getName()),
            payload == null ? null : resolvePreviewInternalName(payload),
            reason
        );
    }

    private String resolvePreviewInternalName(NormalizedItemImportDTO payload) {
        if (payload == null) {
            return null;
        }
        if (!isBlank(payload.getInternalName())) {
            return payload.getInternalName().trim();
        }
        if (isBlank(payload.getName())) {
            return null;
        }
        return resolveInternalName(payload);
    }
}
