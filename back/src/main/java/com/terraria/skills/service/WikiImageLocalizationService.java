package com.terraria.skills.service;

import com.terraria.skills.dto.FileUploadResultDTO;

import java.io.IOException;

public interface WikiImageLocalizationService {

    boolean isWikiImageUrl(String value);

    boolean isManagedImageUrl(String value);

    String localizeImageUrlOrFallback(String sourceUrl, String context);

    default String localizeCachedImageUrlOrFallback(String sourceUrl, String context) {
        return localizeImageUrlOrFallback(sourceUrl, context);
    }

    default FileUploadResultDTO mirrorWikiImage(String sourceUrl, String pathPrefix, String stableId)
        throws IOException, InterruptedException {
        throw new UnsupportedOperationException("Wiki image mirroring is not available");
    }
}
