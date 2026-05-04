package com.terraria.skills.service.impl;

import com.terraria.skills.service.WikiImageLocalizationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.util.Locale;

@Slf4j
@Service
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "false", matchIfMissing = true)
public class DisabledWikiImageLocalizationService implements WikiImageLocalizationService {

    @Override
    public boolean isWikiImageUrl(String value) {
        URI uri = parseHttpUri(value);
        if (uri == null || uri.getHost() == null) {
            return false;
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(Locale.ROOT);

        if ("terraria.wiki.gg".equals(host)) {
            return path.startsWith("/images/") || path.startsWith("/wiki/file:");
        }
        if ("static.wikia.nocookie.net".equals(host) || "vignette.wikia.nocookie.net".equals(host)) {
            return true;
        }
        if (host.equals("fandom.com") || host.endsWith(".fandom.com")) {
            return path.contains("/images/");
        }
        return false;
    }

    @Override
    public boolean isManagedImageUrl(String value) {
        return false;
    }

    @Override
    public String localizeImageUrlOrFallback(String sourceUrl, String context) {
        if (isWikiImageUrl(sourceUrl)) {
            log.warn("Wiki image localization skipped because MinIO is disabled context={} url={}", context, sourceUrl);
        }
        return sourceUrl;
    }

    @Override
    public String localizeCachedImageUrlOrFallback(String sourceUrl, String context) {
        if (isWikiImageUrl(sourceUrl)) {
            log.warn("Wiki image suppressed in API response because MinIO is disabled context={} url={}", context, sourceUrl);
            return null;
        }
        return sourceUrl;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private URI parseHttpUri(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        if (normalized.startsWith("//")) {
            normalized = "https:" + normalized;
        }
        try {
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme();
            if (scheme == null) {
                return null;
            }
            String lowerScheme = scheme.toLowerCase(Locale.ROOT);
            return "http".equals(lowerScheme) || "https".equals(lowerScheme) ? uri : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
