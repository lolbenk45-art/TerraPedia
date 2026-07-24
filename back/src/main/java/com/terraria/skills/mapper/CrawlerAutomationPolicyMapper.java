package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.entity.CrawlerAutomationPolicy;
import com.terraria.skills.service.CrawlerAutomationPolicyService.OwnerRecord;
import com.terraria.skills.service.CrawlerAutomationPolicyService.PolicyState;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface CrawlerAutomationPolicyMapper extends BaseMapper<CrawlerAutomationPolicy> {

    @Select("SELECT username, status, version FROM crawler_automation_owner WHERE singleton_key = 1")
    OwnerRecord findOwner();

    @Select("""
        SELECT p.domain_id AS domainId, p.current_version AS policyVersion,
               pv.policy_hash AS policyHash, p.current_level AS currentLevel,
               p.operational_state AS operationalState
        FROM crawler_automation_policy p
        JOIN crawler_automation_policy_version pv
          ON pv.domain_id = p.domain_id AND pv.policy_version = p.current_version
        WHERE p.domain_id = #{domainId}
        """)
    PolicyState findPolicyState(@Param("domainId") String domainId);

    @Update("""
        UPDATE crawler_automation_reauth_challenge
        SET consumed_at = CURRENT_TIMESTAMP
        WHERE reauth_id = #{reauthId} AND owner_username = #{ownerUsername}
          AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        """)
    int consumeReauth(
        @Param("reauthId") String reauthId,
        @Param("ownerUsername") String ownerUsername
    );
}
