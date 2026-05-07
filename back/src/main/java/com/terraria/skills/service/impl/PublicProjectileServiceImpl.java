package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.PublicProjectileListDTO;
import com.terraria.skills.dto.PublicProjectileQuery;
import com.terraria.skills.entity.Projectile;
import com.terraria.skills.mapper.ProjectileMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicProjectileService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PublicProjectileServiceImpl implements PublicProjectileService {

    private final ProjectileMapper projectileMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    @Override
    public Page<PublicProjectileListDTO> getPublicProjectiles(PublicProjectileQuery query) {
        PublicProjectileQuery safeQuery = query == null ? new PublicProjectileQuery() : query;
        Page<Projectile> page = projectileMapper.selectPage(
            new Page<>(Math.max(1, safeQuery.getPage()), Math.max(1, safeQuery.getLimit())),
            buildListWrapper(safeQuery)
        );

        Page<PublicProjectileListDTO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(page.getRecords().stream().map(this::toListDto).toList());
        return result;
    }

    private LambdaQueryWrapper<Projectile> buildListWrapper(PublicProjectileQuery query) {
        LambdaQueryWrapper<Projectile> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(scope -> scope.eq(Projectile::getStatus, 1).or().isNull(Projectile::getStatus));

        if (query.getSearch() != null && !query.getSearch().isBlank()) {
            String keyword = query.getSearch().trim();
            wrapper.and(scope -> scope.like(Projectile::getInternalName, keyword)
                .or().like(Projectile::getName, keyword)
                .or().like(Projectile::getNameZh, keyword));
        }

        String sortBy = normalizeSortBy(query.getSortBy());
        boolean ascending = "asc".equals(normalizeSortDirection(query.getSortDirection()));
        switch (sortBy) {
            case "name" -> wrapper.orderBy(true, ascending, Projectile::getNameZh)
                .orderBy(true, ascending, Projectile::getName)
                .orderBy(true, ascending, Projectile::getId);
            case "damage" -> wrapper.orderBy(true, ascending, Projectile::getDamage)
                .orderBy(true, ascending, Projectile::getId);
            case "aiStyle" -> wrapper.orderBy(true, ascending, Projectile::getAiStyle)
                .orderBy(true, ascending, Projectile::getId);
            default -> wrapper.orderBy(true, ascending, Projectile::getId);
        }
        return wrapper;
    }

    private PublicProjectileListDTO toListDto(Projectile projectile) {
        PublicProjectileListDTO dto = new PublicProjectileListDTO();
        dto.setId(projectile.getId());
        dto.setSourceId(projectile.getSourceId());
        dto.setInternalName(projectile.getInternalName());
        dto.setName(projectile.getName());
        dto.setNameZh(projectile.getNameZh());
        dto.setImageUrl(managedImageOrNull(projectile.getImageUrl()));
        dto.setAiStyle(projectile.getAiStyle());
        dto.setDamage(projectile.getDamage());
        dto.setKnockBack(projectile.getKnockBack());
        dto.setHostile(projectile.getHostile());
        dto.setFriendly(projectile.getFriendly());
        return dto;
    }

    private String managedImageOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return managedImageUrlPolicy.isManagedImageUrl(value) ? value.trim() : null;
    }

    private String normalizeSortBy(String sortBy) {
        if (sortBy == null || sortBy.isBlank()) {
            return "id";
        }
        return switch (sortBy.trim()) {
            case "name" -> "name";
            case "damage" -> "damage";
            case "aiStyle" -> "aiStyle";
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
