package com.terraria.skills.auth;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class AdminJwtService {

    private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder URL_DECODER = Base64.getUrlDecoder();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final String ROLE_ADMIN = "ADMIN";

    private final AdminAuthProperties authProperties;
    private final ObjectMapper objectMapper;

    public AdminJwtService(AdminAuthProperties authProperties, ObjectMapper objectMapper) {
        this.authProperties = authProperties;
        this.objectMapper = objectMapper;
    }

    public AdminTokenClaims issueToken() {
        long issuedAt = Instant.now().getEpochSecond();
        long expiresAt = issuedAt + Math.max(authProperties.getTokenTtlSeconds(), 60L);

        return AdminTokenClaims.builder()
            .username(authProperties.getUsername())
            .displayName(authProperties.getDisplayName())
            .role(ROLE_ADMIN)
            .issuedAt(issuedAt)
            .expiresAt(expiresAt)
            .build();
    }

    public String createToken(AdminTokenClaims claims) {
        try {
            Map<String, Object> header = Map.of(
                "alg", "HS256",
                "typ", "JWT"
            );

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sub", claims.getUsername());
            payload.put("displayName", claims.getDisplayName());
            payload.put("role", claims.getRole());
            payload.put("iat", claims.getIssuedAt());
            payload.put("exp", claims.getExpiresAt());

            String encodedHeader = encodeJson(header);
            String encodedPayload = encodeJson(payload);
            String unsignedToken = encodedHeader + "." + encodedPayload;
            return unsignedToken + "." + sign(unsignedToken);
        } catch (Exception exception) {
            throw new IllegalStateException("生成令牌失败", exception);
        }
    }

    public AdminTokenClaims parseAndValidate(String token) {
        try {
            String[] segments = token.split("\\.");
            if (segments.length != 3) {
                throw new IllegalArgumentException("令牌格式不正确");
            }

            String unsignedToken = segments[0] + "." + segments[1];
            String expectedSignature = sign(unsignedToken);
            if (!MessageDigest.isEqual(
                expectedSignature.getBytes(StandardCharsets.UTF_8),
                segments[2].getBytes(StandardCharsets.UTF_8)
            )) {
                throw new IllegalArgumentException("令牌签名无效");
            }

            Map<String, Object> payload = objectMapper.readValue(URL_DECODER.decode(segments[1]), MAP_TYPE);
            long expiresAt = getLong(payload.get("exp"));
            long issuedAt = getLong(payload.get("iat"));
            long now = Instant.now().getEpochSecond();

            if (expiresAt <= now) {
                throw new IllegalArgumentException("登录已过期，请重新登录");
            }

            String username = String.valueOf(payload.getOrDefault("sub", ""));
            if (!authProperties.getUsername().equals(username)) {
                throw new IllegalArgumentException("令牌用户无效");
            }

            return AdminTokenClaims.builder()
                .username(username)
                .displayName(String.valueOf(payload.getOrDefault("displayName", authProperties.getDisplayName())))
                .role(String.valueOf(payload.getOrDefault("role", ROLE_ADMIN)))
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .build();
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("令牌解析失败", exception);
        }
    }

    public long getExpiresAtMillis(AdminTokenClaims claims) {
        return claims.getExpiresAt() * 1000L;
    }

    private String encodeJson(Object value) throws Exception {
        return URL_ENCODER.encodeToString(objectMapper.writeValueAsBytes(value));
    }

    private String sign(String content) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec secretKeySpec = new SecretKeySpec(
            authProperties.getTokenSecret().getBytes(StandardCharsets.UTF_8),
            "HmacSHA256"
        );
        mac.init(secretKeySpec);
        return URL_ENCODER.encodeToString(mac.doFinal(content.getBytes(StandardCharsets.UTF_8)));
    }

    private long getLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(String.valueOf(value));
    }
}
