package com.terraria.skills.service.impl;

import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyContextProvider;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyAuthorization;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyProtocolExecutor;
import com.terraria.skills.service.CrawlerAutomationPolicyService.ApplyMode;
import com.terraria.skills.service.CrawlerAutomationPolicyService.TrustedApplyContext;
import org.springframework.stereotype.Component;

/**
 * Task 4 deliberately ships a fail-closed default. Task 5 replaces this bean's
 * wiring with the transaction-time DB/bundle/generation provider before writes
 * are enabled; absence of that provider must never become an implicit allow.
 */
@Component
public final class FailClosedCrawlerAutomationApplyContextProvider implements ApplyContextProvider, ApplyProtocolExecutor {

    @Override
    public TrustedApplyContext load(String runId, String decisionHash, ApplyMode mode) {
        return null;
    }

    @Override
    public void execute(ApplyAuthorization authorization) {
        throw new IllegalStateException("crawler automation apply protocol is disabled");
    }
}
