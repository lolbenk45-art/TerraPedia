package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.PublicBuffListDTO;
import com.terraria.skills.dto.PublicBuffQuery;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicBuffService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PublicBuffServiceImpl implements PublicBuffService {

    private final BuffMapper buffMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    @Override
    public Page<PublicBuffListDTO> getPublicBuffs(PublicBuffQuery query) {
        PublicBuffQuery safeQuery = query == null ? new PublicBuffQuery() : query;
        Page<Buff> page = buffMapper.selectPage(
            new Page<>(Math.max(1, safeQuery.getPage()), Math.max(1, safeQuery.getLimit())),
            buildListWrapper(safeQuery)
        );

        Page<PublicBuffListDTO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(page.getRecords().stream().map(this::toListDto).toList());
        return result;
    }

    private LambdaQueryWrapper<Buff> buildListWrapper(PublicBuffQuery query) {
        LambdaQueryWrapper<Buff> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(scope -> scope.eq(Buff::getStatus, 1).or().isNull(Buff::getStatus));

        if (query.getSearch() != null && !query.getSearch().isBlank()) {
            String keyword = query.getSearch().trim();
            wrapper.and(scope -> scope.like(Buff::getInternalName, keyword)
                .or().like(Buff::getEnglishName, keyword)
                .or().like(Buff::getNameZh, keyword));
        }

        String sortBy = normalizeSortBy(query.getSortBy());
        boolean ascending = "asc".equals(normalizeSortDirection(query.getSortDirection()));
        switch (sortBy) {
            case "name" -> wrapper.orderBy(true, ascending, Buff::getNameZh)
                .orderBy(true, ascending, Buff::getEnglishName)
                .orderBy(true, ascending, Buff::getId);
            case "sourceItemCount" -> wrapper.orderBy(true, ascending, Buff::getSourceItemCount)
                .orderBy(true, ascending, Buff::getId);
            default -> wrapper.orderBy(true, ascending, Buff::getId);
        }
        return wrapper;
    }

    private PublicBuffListDTO toListDto(Buff buff) {
        PublicBuffListDTO dto = new PublicBuffListDTO();
        dto.setId(buff.getId());
        dto.setSourceId(buff.getSourceId());
        dto.setInternalName(buff.getInternalName());
        dto.setName(firstNonBlank(buff.getNameZh(), buff.getEnglishName(), buff.getInternalName()));
        dto.setNameZh(buff.getNameZh());
        dto.setImageUrl(firstNonBlank(managedImageOrNull(buff.getImageCachedUrl()), managedImageOrNull(buff.getImage())));
        dto.setBuffType(buff.getBuffType());
        dto.setTooltipZh(buff.getTooltipZh());
        dto.setSourceItemCount(buff.getSourceItemCount());
        dto.setImmuneNpcCount(buff.getImmuneNpcCount());
        return dto;
    }

    private String managedImageOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        return managedImageUrlPolicy.isManagedImageUrlForDomain(normalized, "buffs") ? normalized : null;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private String normalizeSortBy(String sortBy) {
        if (sortBy == null || sortBy.isBlank()) {
            return "id";
        }
        return switch (sortBy.trim()) {
            case "name" -> "name";
            case "sourceItemCount" -> "sourceItemCount";
            default -> "id";
        };
    }

    private String normalizeSortDirection(String sortDirection) {
        if (sortDirection == null || sortDirection.isBlank()) {
            return "asc";
        }
        return "asc".equalsIgnoreCase(sortDirection.trim()) ? "asc" : "desc";
    }
}
