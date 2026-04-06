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

    int reactivateDeletedUser(
        @Param("id") Long id,
        @Param("passwordHash") String passwordHash,
        @Param("displayName") String displayName,
        @Param("status") Integer status,
        @Param("lastLoginAt") LocalDateTime lastLoginAt
    );

    Page<AdminUserListItemDTO> selectAdminUsersPage(
        Page<AdminUserListItemDTO> page,
        @Param("email") String email,
        @Param("status") Integer status
    );
}
