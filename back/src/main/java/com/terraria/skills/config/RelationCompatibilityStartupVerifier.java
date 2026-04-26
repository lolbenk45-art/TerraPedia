package com.terraria.skills.config;

import com.terraria.skills.dto.RelationCompatibilityStatusDTO;
import com.terraria.skills.service.RelationCompatibilityService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RelationCompatibilityStartupVerifier implements ApplicationRunner {

    private final RelationCompatibilityProperties properties;
    private final RelationCompatibilityService relationCompatibilityService;

    @Override
    public void run(ApplicationArguments args) {
        if (!properties.isStartupCheckEnabled()) {
            return;
        }

        RelationCompatibilityStatusDTO status = relationCompatibilityService.getStatus();
        if (status.isSwitchable()) {
            log.info("relation compatibility startup check passed for domains={}", status.getSwitchableDomains());
            return;
        }

        String message = "relation compatibility startup check failed; blocked domains=" + status.getBlockedDomains();
        if (properties.isFailOnStartupMismatch()) {
            throw new IllegalStateException(message);
        }
        log.warn(message);
    }
}
