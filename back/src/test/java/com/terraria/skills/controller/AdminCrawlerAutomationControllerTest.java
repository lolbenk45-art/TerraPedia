package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerAutomationApprovalRequestDTO;
import com.terraria.skills.dto.CrawlerAutomationOverviewDTO;
import com.terraria.skills.dto.CrawlerAutomationRunDTO;
import com.terraria.skills.service.CrawlerAutomationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminCrawlerAutomationControllerTest {

    @Mock
    private CrawlerAutomationService automationService;

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        AdminCrawlerAutomationController controller = new AdminCrawlerAutomationController(automationService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
            .build();
    }

    // ── Overview ────────────────────────────────────────────────────────────

    @Test
    void getOverviewReturnsAggregatedSummary() throws Exception {
        when(automationService.getOverview()).thenReturn(new CrawlerAutomationOverviewDTO(
            "2026-07-24T00:00:00",
            1,
            2,
            0,
            List.of(new CrawlerAutomationOverviewDTO.DomainSummary(
                "recipes",
                "L0",
                "DISABLED",
                null,
                "BLOCKED_L0",
                null,
                List.of(),
                List.of(new CrawlerAutomationOverviewDTO.DisabledReason(
                    "POLICY_DISABLED",
                    "自动化策略当前为禁用状态。"
                ))
            ))
        ));

        mockMvc.perform(get("/admin/crawler-automation/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.openCircuitBreakers").value(1))
            .andExpect(jsonPath("$.data.pendingOwnerApprovals").value(2))
            .andExpect(jsonPath("$.data.domains[0].disabledReasons[0].code").value("POLICY_DISABLED"))
            .andExpect(jsonPath("$.data.domains[0].disabledReasons[0].messageZh").value("自动化策略当前为禁用状态。"));
    }

    // ── Runs ─────────────────────────────────────────────────────────────────

    @Test
    void listRunsReturnsRecentItems() throws Exception {
        var run = new CrawlerAutomationRunDTO(
            "run-1", "recipes", List.of("recipes"),
            "sha256:" + "b".repeat(64), "SCHEDULED", "COMMITTED",
            "sha256:" + "e".repeat(64), 4L, "2026-07-24T00:00:00", "2026-07-24T01:00:00",
            new CrawlerAutomationRunDTO.DecisionSummary("AUTO_APPLY_L2", "sha256:" + "d".repeat(64),
                List.of("WITHIN_POLICY_CEILINGS"), true, false, true)
        );
        when(automationService.listRecentRuns(20)).thenReturn(List.of(run));

        mockMvc.perform(get("/admin/crawler-automation/runs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].runId").value("run-1"))
            .andExpect(jsonPath("$.data[0].decision.decisionType").value("AUTO_APPLY_L2"));
    }

    @Test
    void listRunsRejectsInvalidLimit() throws Exception {
        mockMvc.perform(get("/admin/crawler-automation/runs").param("limit", "0"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/admin/crawler-automation/runs").param("limit", "101"))
            .andExpect(status().isBadRequest());
        verify(automationService, never()).listRecentRuns(anyInt());
    }

    @Test
    void getRunReturnsNotFoundForMissingRun() throws Exception {
        when(automationService.getRun("missing-run")).thenReturn(null);

        mockMvc.perform(get("/admin/crawler-automation/runs/missing-run"))
            .andExpect(status().isNotFound());
    }

    @Test
    void getRunReturnsExistingRun() throws Exception {
        var run = new CrawlerAutomationRunDTO(
            "run-2", "npc_loot", List.of("npc_loot"),
            "sha256:" + "b".repeat(64), "SCHEDULED", "AWAITING_APPROVAL",
            "sha256:" + "e".repeat(64), 2L, null, null,
            new CrawlerAutomationRunDTO.DecisionSummary("REQUIRES_OWNER_L1", "sha256:" + "d".repeat(64),
                List.of("INSERT_THRESHOLD_EXCEEDED"), true, true, false)
        );
        when(automationService.getRun("run-2")).thenReturn(run);

        mockMvc.perform(get("/admin/crawler-automation/runs/run-2"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("AWAITING_APPROVAL"))
            .andExpect(jsonPath("$.data.decision.approvable").value(true));
    }

    // ── Approvals ─────────────────────────────────────────────────────────────

    @Test
    void submitApprovalSucceedsForValidOwnerRequest() throws Exception {
        when(automationService.isReadOnlyProfile()).thenReturn(false);
        when(automationService.submitApproval(any())).thenReturn("approve-key-1");

        var request = new CrawlerAutomationApprovalRequestDTO(
            "approve-key-1", "run-2", "sha256:" + "d".repeat(64),
            "owner", "reauth-1", "APPROVE", "reviewed", 2L
        );

        mockMvc.perform(post("/admin/crawler-automation/approvals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.requestKey").value("approve-key-1"));
    }

    @Test
    void submitApprovalReturnsForbiddenInReadOnlyProfile() throws Exception {
        when(automationService.isReadOnlyProfile()).thenReturn(true);

        var request = new CrawlerAutomationApprovalRequestDTO(
            "approve-key-1", "run-2", "sha256:" + "d".repeat(64),
            "owner", "reauth-1", "APPROVE", "reviewed", 2L
        );

        mockMvc.perform(post("/admin/crawler-automation/approvals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isForbidden());

        verify(automationService, never()).submitApproval(any());
    }

    @Test
    void submitApprovalReturnsConflictOnStaleVersion() throws Exception {
        when(automationService.isReadOnlyProfile()).thenReturn(false);
        when(automationService.submitApproval(any()))
            .thenThrow(new IllegalStateException("run version changed"));

        var request = new CrawlerAutomationApprovalRequestDTO(
            "approve-key-stale", "run-2", "sha256:" + "d".repeat(64),
            "owner", "reauth-1", "APPROVE", "reviewed", 1L
        );

        mockMvc.perform(post("/admin/crawler-automation/approvals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isConflict());
    }

    @Test
    void submitApprovalReturnsBadRequestForNonOwner() throws Exception {
        when(automationService.isReadOnlyProfile()).thenReturn(false);
        when(automationService.submitApproval(any()))
            .thenThrow(new IllegalArgumentException("requester is not the configured Owner"));

        var request = new CrawlerAutomationApprovalRequestDTO(
            "approve-key-bad", "run-2", "sha256:" + "d".repeat(64),
            "not-owner", "reauth-1", "APPROVE", "reviewed", 2L
        );

        mockMvc.perform(post("/admin/crawler-automation/approvals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void submitApprovalRejectsMissingRequestBody() throws Exception {
        when(automationService.isReadOnlyProfile()).thenReturn(false);

        // null requestKey
        var incomplete = new CrawlerAutomationApprovalRequestDTO(
            null, "run-2", "sha256:" + "d".repeat(64),
            "owner", "reauth-1", "APPROVE", "reviewed", 2L
        );

        mockMvc.perform(post("/admin/crawler-automation/approvals")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(incomplete)))
            .andExpect(status().isBadRequest());

        verify(automationService, never()).submitApproval(any());
    }

    // ── Profile ───────────────────────────────────────────────────────────────

    @Test
    void getProfileIndicatesReadOnlyWhenConfigured() throws Exception {
        when(automationService.isReadOnlyProfile()).thenReturn(true);

        mockMvc.perform(get("/admin/crawler-automation/profile"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.readOnly").value(true));
    }

    @Test
    void getProfileIndicatesMutableWhenNotReadOnly() throws Exception {
        when(automationService.isReadOnlyProfile()).thenReturn(false);

        mockMvc.perform(get("/admin/crawler-automation/profile"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.readOnly").value(false));
    }
}
