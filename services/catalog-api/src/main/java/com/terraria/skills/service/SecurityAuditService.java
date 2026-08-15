package com.terraria.skills.service;

public interface SecurityAuditService {

    void log(String eventType, String actorType, Long actorId, String email, String ipAddress, String details);
}
