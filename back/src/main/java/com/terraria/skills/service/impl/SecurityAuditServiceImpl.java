package com.terraria.skills.service.impl;

import com.terraria.skills.entity.SecurityAuditLog;
import com.terraria.skills.mapper.SecurityAuditLogMapper;
import com.terraria.skills.service.SecurityAuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class SecurityAuditServiceImpl implements SecurityAuditService {

    private final SecurityAuditLogMapper securityAuditLogMapper;

    @Override
    public void log(String eventType, String actorType, Long actorId, String email, String ipAddress, String details) {
        SecurityAuditLog logRow = new SecurityAuditLog();
        logRow.setEventType(eventType);
        logRow.setActorType(actorType);
        logRow.setActorId(actorId);
        logRow.setEmailMasked(maskEmail(email));
        logRow.setIpAddress(ipAddress);
        logRow.setDetails(details);
        logRow.setCreatedAt(LocalDateTime.now());

        try {
            securityAuditLogMapper.insert(logRow);
        } catch (Exception exception) {
            log.warn("Failed to persist audit log eventType={}, actorId={}", eventType, actorId, exception);
        }
    }

    private String maskEmail(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }

        String normalized = email.trim();
        int atIndex = normalized.indexOf('@');
        if (atIndex <= 1) {
            return "***";
        }

        String prefix = normalized.substring(0, Math.min(2, atIndex));
        String domain = normalized.substring(atIndex);
        return prefix + "***" + domain;
    }
}
