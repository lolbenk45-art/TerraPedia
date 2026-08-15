package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.AdminUserListItemDTO;
import com.terraria.skills.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface UserMapper extends BaseMapper<User> {

    User selectByEmail(@Param("email") String email);

    User selectByEmailIncludeDeleted(@Param("email") String email);

    User selectPublicUserById(@Param("id") Long id);

    int reactivateDeletedUser(
        @Param("id") Long id,
        @Param("passwordHash") String passwordHash,
        @Param("displayName") String displayName,
        @Param("status") Integer status,
        @Param("lastLoginAt") LocalDateTime lastLoginAt
    );

    int updateAvatar(
        @Param("id") Long id,
        @Param("avatarUrl") String avatarUrl,
        @Param("avatarObjectKey") String avatarObjectKey,
        @Param("avatarUpdatedAt") LocalDateTime avatarUpdatedAt
    );

    int clearAvatar(@Param("id") Long id);

    int updatePreferences(
        @Param("id") Long id,
        @Param("themePreference") String themePreference,
        @Param("detailDensity") String detailDensity,
        @Param("defaultFavoritesFilter") String defaultFavoritesFilter
    );

    Page<AdminUserListItemDTO> selectAdminUsersPage(
        Page<AdminUserListItemDTO> page,
        @Param("email") String email,
        @Param("status") Integer status
    );
}
