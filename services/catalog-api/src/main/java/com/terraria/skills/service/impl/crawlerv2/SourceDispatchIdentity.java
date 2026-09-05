package com.terraria.skills.service.impl.crawlerv2;

import java.time.Instant;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * Immutable identity tying a scheduler-owned attempt to the exact source
 * snapshot that admitted it.
 */
public record SourceDispatchIdentity(
    String sourceFingerprint,
    String sourceRunIdentity,
    String sourceContentIdentity
) {

    private static final Pattern SHA256 = Pattern.compile("sha256:[0-9a-f]{64}");

    public SourceDispatchIdentity {
        if (!isValidHash(sourceFingerprint)) {
            throw new IllegalArgumentException("sourceFingerprint 必须是 sha256:<64 位小写十六进制>");
        }
        if (sourceRunIdentity == null || sourceRunIdentity.isBlank()) {
            throw new IllegalArgumentException("sourceRunIdentity 不能为空");
        }
        try {
            Instant.parse(sourceRunIdentity);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("sourceRunIdentity 必须是 ISO-8601 时间", exception);
        }
        if (!isValidHash(sourceContentIdentity)) {
            throw new IllegalArgumentException("sourceContentIdentity 必须是 sha256:<64 位小写十六进制>");
        }
    }

    public Instant parsedSourceRunIdentity() {
        return Instant.parse(sourceRunIdentity);
    }

    public boolean matches(SourceDispatchIdentity other) {
        return Objects.equals(this, other);
    }

    public static boolean isValidHash(String value) {
        return value != null && SHA256.matcher(value).matches();
    }

    public static SourceDispatchIdentity require(SourceDispatchIdentity identity) {
        return Objects.requireNonNull(identity, "sourceDispatchIdentity");
    }
}
