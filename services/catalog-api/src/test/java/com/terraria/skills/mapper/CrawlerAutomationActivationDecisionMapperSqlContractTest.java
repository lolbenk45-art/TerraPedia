package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrawlerAutomationActivationDecisionMapperSqlContractTest {

    @Test
    void countsCommittedPrePromotionRunsWithoutMisclassifyingImmutablePolicyVersionLevel() throws Exception {
        String source = Files.readString(Path.of(
            "src", "main", "java", "com", "terraria", "skills", "mapper",
            "CrawlerAutomationActivationDecisionMapper.java"
        ));

        assertTrue(source.contains("rp.policy_version < #{currentPolicyVersion}"));
        assertTrue(source.contains("a.status = 'COMMITTED'"));
        assertTrue(source.contains("JOIN crawler_automation_apply_bundle b"));
        assertFalse(source.contains("pv.level = 'L1'"));
        assertFalse(source.contains("JOIN crawler_automation_policy_version pv"));
    }

    @Test
    void readsTheImmutableAuthorizedSchedulerActionScope() throws Exception {
        String source = Files.readString(Path.of(
            "src", "main", "java", "com", "terraria", "skills", "mapper",
            "CrawlerAutomationActivationDecisionMapper.java"
        ));
        assertTrue(source.contains("authorized_action_id AS authorizedActionId"));
        assertTrue(source.indexOf("AS fresh") < source.indexOf("authorized_action_id AS authorizedActionId"));
    }
}
