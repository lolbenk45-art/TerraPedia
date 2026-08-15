package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.dto.UserSavedRouteDTO;
import com.terraria.skills.entity.UserSavedRoute;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserSavedRouteMapper extends BaseMapper<UserSavedRoute> {

    UserSavedRoute selectByUserAndTargetIncludeDeleted(
        @Param("userId") Long userId,
        @Param("targetType") String targetType,
        @Param("targetId") Long targetId,
        @Param("routeMode") String routeMode
    );

    int updateExisting(@Param("route") UserSavedRoute route);

    int softDelete(@Param("userId") Long userId, @Param("id") Long id);

    long countActiveByUser(@Param("userId") Long userId);

    List<UserSavedRouteDTO> selectActiveRoutesPage(@Param("userId") Long userId, @Param("limit") long limit, @Param("offset") long offset);

    UserSavedRouteDTO selectActiveRouteById(@Param("userId") Long userId, @Param("id") Long id);
}
