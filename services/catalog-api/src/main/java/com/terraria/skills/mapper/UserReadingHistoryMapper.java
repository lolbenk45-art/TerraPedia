package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.dto.UserReadingHistoryDTO;
import com.terraria.skills.entity.UserReadingHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserReadingHistoryMapper extends BaseMapper<UserReadingHistory> {

    UserReadingHistory selectByUserAndTargetIncludeDeleted(@Param("userId") Long userId, @Param("targetType") String targetType, @Param("targetId") Long targetId);

    int reactivateAndIncrement(@Param("id") Long id);

    int incrementExisting(@Param("id") Long id);

    int softDelete(@Param("userId") Long userId, @Param("targetType") String targetType, @Param("targetId") Long targetId);

    long countActiveByUserAndType(@Param("userId") Long userId, @Param("targetType") String targetType);

    long countActiveByUser(@Param("userId") Long userId);

    List<UserReadingHistoryDTO> selectActiveHistoryPage(@Param("userId") Long userId, @Param("targetType") String targetType, @Param("limit") long limit, @Param("offset") long offset);

    List<UserReadingHistoryDTO> selectActiveHistoryPageAll(@Param("userId") Long userId, @Param("limit") long limit, @Param("offset") long offset);
}
