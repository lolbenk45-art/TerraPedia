package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.entity.CrawlerAutomationApproval;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface CrawlerAutomationApprovalMapper extends BaseMapper<CrawlerAutomationApproval> {

    @Select("SELECT * FROM crawler_automation_approval WHERE request_key = #{requestKey}")
    CrawlerAutomationApproval findByRequestKey(@Param("requestKey") String requestKey);

    @Select("""
        SELECT * FROM crawler_automation_approval
        WHERE run_id = #{runId} AND decision_hash = #{decisionHash} AND action = 'APPROVE'
        ORDER BY id DESC LIMIT 1
        """)
    CrawlerAutomationApproval findLatestForDecision(
        @Param("runId") String runId,
        @Param("decisionHash") String decisionHash
    );

    @Update("""
        UPDATE crawler_automation_approval
        SET consumed_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE id = #{id} AND version = #{expectedVersion} AND consumed_at IS NULL
        """)
    int consumeOnce(@Param("id") Long id, @Param("expectedVersion") Long expectedVersion);
}
