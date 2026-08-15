package com.terraria.skills.service;

import com.terraria.skills.dto.CrawlerAutomationApprovalRequestDTO;
import com.terraria.skills.dto.CrawlerAutomationOverviewDTO;
import com.terraria.skills.dto.CrawlerAutomationRunDTO;

import java.util.List;

public interface CrawlerAutomationService {

    CrawlerAutomationOverviewDTO getOverview();

    CrawlerAutomationRunDTO getRun(String runId);

    List<CrawlerAutomationRunDTO> listRecentRuns(int limit);

    /**
     * Submit an Owner approval for a pending L1 decision.
     * Requires: exact Owner identity, one-time reauth, correct run/decision versions,
     * unchanged bundle and diff identity.
     * Returns the persisted request key on success.
     */
    String submitApproval(CrawlerAutomationApprovalRequestDTO request);

    /**
     * T2 read-only profile: returns true if mutation controls must be hidden.
     */
    boolean isReadOnlyProfile();
}
