package com.terraria.skills.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface ItemGroupCanonicalMapper {

    @Select("""
        SELECT canonical_snapshot_hash AS canonicalSnapshotHash,
               publication_status AS publicationStatus,
               group_count AS groupCount,
               member_count AS memberCount,
               alias_count AS aliasCount
        FROM item_group_projection_state
        WHERE singleton_key = 1
        """)
    Map<String, Object> selectProjectionState();

    @Select("""
        SELECT
          (SELECT COUNT(*) FROM item_groups WHERE deleted = 0 AND status = 'ACTIVE') AS groupCount,
          (SELECT COUNT(*) FROM item_group_members m
             JOIN item_groups g ON g.id = m.group_id
            WHERE g.deleted = 0 AND g.status = 'ACTIVE') AS memberCount,
          (SELECT COUNT(*) FROM item_group_aliases a
             JOIN item_groups g ON g.canonical_key = a.canonical_key
              AND g.source_layer = a.source_layer
            WHERE g.deleted = 0 AND g.status = 'ACTIVE') AS aliasCount
        """)
    Map<String, Object> selectProjectionCounts();

    @Select("""
        <script>
        SELECT record_key AS recordKey,
               canonical_key AS canonicalKey,
               canonical_name AS canonicalName,
               name,
               name_zh AS nameZh,
               normalized_domains_json AS normalizedDomainsJson,
               source_layer AS sourceLayer,
               source_priority AS sourcePriority,
               source_content_hash AS sourceContentHash,
               canonical_version AS canonicalVersion,
               status
        FROM item_groups
        WHERE deleted = 0
          AND status = 'ACTIVE'
          AND source_layer IN
          <foreach collection="sourceLayers" item="layer" open="(" separator="," close=")">
            #{layer}
          </foreach>
        ORDER BY canonical_key, source_priority DESC, record_key
        </script>
        """)
    List<Map<String, Object>> selectGroups(@Param("sourceLayers") List<String> sourceLayers);

    @Select("""
        <script>
        SELECT g.record_key AS groupRecordKey,
               m.item_id AS itemId,
               m.source_item_id AS sourceItemId,
               m.member_key AS memberKey,
               m.internal_name AS internalName,
               m.name,
               m.name_zh AS nameZh,
               m.sort_order AS sortOrder,
               m.resolution_state AS resolutionState
        FROM item_group_members m
        JOIN item_groups g ON g.id = m.group_id
        WHERE g.deleted = 0
          AND g.status = 'ACTIVE'
          AND g.source_layer IN
          <foreach collection="sourceLayers" item="layer" open="(" separator="," close=")">
            #{layer}
          </foreach>
        ORDER BY g.record_key, m.sort_order, m.record_key
        </script>
        """)
    List<Map<String, Object>> selectMembers(@Param("sourceLayers") List<String> sourceLayers);

    @Select("""
        <script>
        SELECT g.record_key AS groupRecordKey,
               a.alias_text AS aliasText,
               a.normalized_alias AS normalizedAlias,
               a.alias_kind AS aliasKind,
               a.sort_order AS sortOrder
        FROM item_group_aliases a
        JOIN item_groups g ON g.canonical_key = a.canonical_key
          AND g.source_layer = a.source_layer
        WHERE g.deleted = 0
          AND g.status = 'ACTIVE'
          AND g.source_layer IN
          <foreach collection="sourceLayers" item="layer" open="(" separator="," close=")">
            #{layer}
          </foreach>
        ORDER BY g.record_key, a.sort_order, a.record_key
        </script>
        """)
    List<Map<String, Object>> selectAliases(@Param("sourceLayers") List<String> sourceLayers);
}
