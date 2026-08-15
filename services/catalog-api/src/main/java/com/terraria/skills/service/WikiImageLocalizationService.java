package com.terraria.skills.service;

import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.dto.WikiImageLocalizationCacheMetricsDTO;

import java.io.IOException;
import java.util.Optional;

public interface WikiImageLocalizationService {

    boolean isWikiImageUrl(String value);

    boolean isManagedImageUrl(String value);

    default Optional<String> normalizeManagedImagePath(String value) {
        return isManagedImageUrl(value) ? Optional.of(value.trim()) : Optional.empty();
    }

    String localizeImageUrlOrFallback(String sourceUrl, String context);

    default String localizeCachedImageUrlOrFallback(String sourceUrl, String context) {
        return localizeImageUrlOrFallback(sourceUrl, context);
    }

    default FileUploadResultDTO mirrorWikiImage(String sourceUrl, String pathPrefix, String stableId)
        throws IOException, InterruptedException {
        throw new UnsupportedOperationException("Wiki image mirroring is not available");
    }

    default WikiImageLocalizationCacheMetricsDTO cacheMetrics() {
        WikiImageLocalizationCacheMetricsDTO metrics = new WikiImageLocalizationCacheMetricsDTO();
        metrics.setEnabled(false);
        return metrics;
    }
}
