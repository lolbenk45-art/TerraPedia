package com.terraria.skills.dto;

import lombok.Data;

@Data
public class WikiImageLocalizationCacheMetricsDTO {

    private boolean enabled;
    private long failureCacheSize;
    private long failureCacheMaxEntries;
    private long failureCacheTtlSeconds;
    private long uploadCacheSize;
    private long uploadCacheMaxEntries;
    private long uploadCacheTtlSeconds;
}
