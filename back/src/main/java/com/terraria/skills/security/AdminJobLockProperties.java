package com.terraria.skills.security;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "terraria.security.admin-job-lock")
public class AdminJobLockProperties {

    private long wikiImageSyncTtlSeconds = 1800L;
    private long itemImportTtlSeconds = 1800L;
}
