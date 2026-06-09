package com.terraria.skills.service.impl;

import com.terraria.skills.dto.PublicHomeFocusItemDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.service.PublicHomeService;
import com.terraria.skills.service.PublicItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PublicHomeServiceImpl implements PublicHomeService {

    private static final long HOME_FOCUS_ITEM_ID = 757L;
    private static final String REASON_LABEL = "当前焦点 · 真实物品";

    private final PublicItemService publicItemService;

    @Override
    @Cacheable(cacheNames = "home:focus-item", key = "'current'", unless = "#result == null")
    public PublicHomeFocusItemDTO getFocusItem() {
        PublicItemDetailDTO item = publicItemService.getPublicItemById(HOME_FOCUS_ITEM_ID);
        if (item == null || item.getId() == null) {
            return null;
        }

        return PublicHomeFocusItemDTO.builder()
            .id(item.getId())
            .name(item.getName())
            .nameZh(item.getNameZh())
            .internalName(item.getInternalName())
            .href("/items/" + item.getId())
            .image(item.getImage())
            .categoryName(item.getCategoryName())
            .gamePeriod(item.getGamePeriod())
            .rarity(item.getRarity())
            .damage(item.getDamage())
            .knockback(item.getKnockback())
            .useTime(item.getUseTime())
            .sell(item.getSell())
            .reasonLabel(REASON_LABEL)
            .build();
    }
}
