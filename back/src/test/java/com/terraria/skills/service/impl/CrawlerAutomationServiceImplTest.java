package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CrawlerAutomationOverviewDTO;
import com.terraria.skills.mapper.CrawlerAutomationApprovalMapper;
import com.terraria.skills.mapper.CrawlerAutomationPolicyMapper;
import com.terraria.skills.mapper.CrawlerAutomationRunMapper;
import com.terraria.skills.service.CrawlerAutomationPolicyService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Value;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrawlerAutomationServiceImplTest {

    @Mock
    private CrawlerAutomationRunMapper runMapper;

    @Mock
    private CrawlerAutomationPolicyMapper policyMapper;

    @Mock
    private CrawlerAutomationApprovalMapper approvalMapper;

    @Mock
    private CrawlerAutomationPolicyService policyService;

    @Test
    void springConfigurationDefaultsAutomationProfileToReadOnly() throws Exception {
        var constructor = CrawlerAutomationServiceImpl.class.getConstructor(
            CrawlerAutomationRunMapper.class,
            CrawlerAutomationPolicyMapper.class,
            CrawlerAutomationApprovalMapper.class,
            CrawlerAutomationPolicyService.class,
            CrawlerMonitorActionRegistry.class,
            boolean.class
        );
        Value annotation = constructor.getParameters()[5].getAnnotation(Value.class);

        assertNotNull(annotation);
        assertEquals("${terraria.crawler.automation.read-only:true}", annotation.value());
    }

    @Test
    void overviewOwnsDisabledReasonsForPolicyAndApprovalState() {
        when(runMapper.findActiveDomainSummaries()).thenReturn(List.of(
            domain("recipes", "L0", "DISABLED", "BLOCKED_L0"),
            domain("bosses", "L1", "ACTIVE", "AWAITING_APPROVAL")
        ));
        var service = new CrawlerAutomationServiceImpl(
            runMapper, policyMapper, approvalMapper, policyService,
            CrawlerMonitorActionRegistry.defaults(), false
        );

        CrawlerAutomationOverviewDTO overview = service.getOverview();

        assertEquals(
            List.of("POLICY_DISABLED", "AUTOMATION_LEVEL_L0"),
            reasonCodes(overview.domains().get(0))
        );
        assertEquals(
            List.of("OWNER_APPROVAL_REQUIRED"),
            reasonCodes(overview.domains().get(1))
        );
    }

    @Test
    void readOnlyProfileAddsBackendOwnedReasonToEveryDomain() {
        when(runMapper.findActiveDomainSummaries()).thenReturn(List.of(
            domain("items", "L1", "ACTIVE", "COMMITTED")
        ));
        var service = new CrawlerAutomationServiceImpl(
            runMapper, policyMapper, approvalMapper, policyService,
            CrawlerMonitorActionRegistry.defaults(), true
        );

        CrawlerAutomationOverviewDTO.DomainSummary domain = service.getOverview().domains().get(0);

        assertEquals(List.of("T2_READ_ONLY_PROFILE"), reasonCodes(domain));
        assertEquals("T2 只读环境禁止自动入库变更。", domain.disabledReasons().get(0).messageZh());
    }

    @Test
    void overviewKeepsRegisteredItemGroupDomainVisibleAndDisabledBeforePolicyBootstrap() {
        when(runMapper.findActiveDomainSummaries()).thenReturn(List.of());
        var service = new CrawlerAutomationServiceImpl(
            runMapper, policyMapper, approvalMapper, policyService,
            CrawlerMonitorActionRegistry.defaults(), false
        );

        CrawlerAutomationOverviewDTO.DomainSummary itemGroups = service.getOverview().domains().stream()
            .filter(domain -> "item_groups".equals(domain.domainId()))
            .findFirst()
            .orElseThrow();

        assertEquals("L0", itemGroups.automationLevel());
        assertEquals("DISABLED", itemGroups.operationalState());
        assertEquals(
            List.of("POLICY_NOT_BOOTSTRAPPED", "POLICY_DISABLED", "AUTOMATION_LEVEL_L0"),
            reasonCodes(itemGroups)
        );
    }

    private static CrawlerAutomationOverviewDTO.DomainSummary domain(
        String domainId,
        String automationLevel,
        String operationalState,
        String lastRunStatus
    ) {
        return new CrawlerAutomationOverviewDTO.DomainSummary(
            domainId,
            automationLevel,
            operationalState,
            null,
            lastRunStatus,
            null,
            List.of()
        );
    }

    private static List<String> reasonCodes(CrawlerAutomationOverviewDTO.DomainSummary domain) {
        return domain.disabledReasons().stream()
            .map(CrawlerAutomationOverviewDTO.DisabledReason::code)
            .toList();
    }
}
