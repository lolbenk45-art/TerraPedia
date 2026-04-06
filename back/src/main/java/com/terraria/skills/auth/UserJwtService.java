package com.terraria.skills.auth;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.entity.User;
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
public class UserJwtService {

    private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder URL_DECODER = Base64.getUrlDecoder();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final UserAuthProperties authProperties;
    private final ObjectMapper objectMapper;

    public UserJwtService(UserAuthProperties authProperties, ObjectMapper objectMapper) {
        this.authProperties = authProperties;
        this.objectMapper = objectMapper;
    }

    public UserTokenClaims issueToken(User user) {
        long issuedAt = Instant.now().getEpochSecond();
        long expiresAt = issuedAt + Math.max(authProperties.getAccessTokenTtlSeconds(), 60L);

        return UserTokenClaims.builder()
            .userId(user.getId())
            .email(user.getEmail())
            .displayName(user.getDisplayName())
            .role("USER")
            .issuedAt(issuedAt)
            .expiresAt(expiresAt)
            .build();
    }

    public String createToken(UserTokenClaims claims) {
        try {
            Map<String, Object> header = Map.of(
                "alg", "HS256",
                "typ", "JWT"
            );

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sub", String.valueOf(claims.getUserId()));
            payload.put("email", claims.getEmail());
            payload.put("displayName", claims.getDisplayName());
            payload.put("role", claims.getRole());
            payload.put("iat", claims.getIssuedAt());
            payload.put("exp", claims.getExpiresAt());

            String encodedHeader = encodeJson(header);
            String encodedPayload = encodeJson(payload);
            String unsignedToken = encodedHeader + "." + encodedPayload;
            return unsignedToken + "." + sign(unsignedToken);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to create user token", exception);
        }
    }

    public UserTokenClaims parseAndValidate(String token) {
        try {
            String[] segments = token.split("\\.");
            if (segments.length != 3) {
                throw new IllegalArgumentException("Invalid token format");
            }

            String unsignedToken = segments[0] + "." + segments[1];
            String expectedSignature = sign(unsignedToken);
            if (!MessageDigest.isEqual(
                expectedSignature.getBytes(StandardCharsets.UTF_8),
                segments[2].getBytes(StandardCharsets.UTF_8)
            )) {
                throw new IllegalArgumentException("Invalid token signature");
            }

            Map<String, Object> payload = objectMapper.readValue(URL_DECODER.decode(segments[1]), MAP_TYPE);
            long expiresAt = getLong(payload.get("exp"));
            long issuedAt = getLong(payload.get("iat"));
            long now = Instant.now().getEpochSecond();

            if (expiresAt <= now) {
                throw new IllegalArgumentException("Login session expired");
            }

            Long userId = Long.valueOf(String.valueOf(payload.getOrDefault("sub", "0")));
            if (userId <= 0) {
                throw new IllegalArgumentException("Invalid token subject");
            }

            return UserTokenClaims.builder()
                .userId(userId)
                .email(String.valueOf(payload.getOrDefault("email", "")))
                .displayName(String.valueOf(payload.getOrDefault("displayName", "")))
                .role(String.valueOf(payload.getOrDefault("role", "USER")))
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .build();
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("Failed to parse token", exception);
        }
    }

    public long getExpiresAtMillis(UserTokenClaims claims) {
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
