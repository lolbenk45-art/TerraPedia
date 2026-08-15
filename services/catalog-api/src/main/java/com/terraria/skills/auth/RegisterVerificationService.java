package com.terraria.skills.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class RegisterVerificationService {

    private final RegisterVerificationProperties properties;
    private final StringRedisTemplate redisTemplate;
    private final VerificationCodeDelivery verificationCodeDelivery;
    private final VerificationCodeGenerator verificationCodeGenerator;

    public SendCodeResult sendCode(String email, String ipAddress) {
        return sendCode(VerificationScene.REGISTER, email, ipAddress);
    }

    public SendCodeResult sendPasswordResetCode(String email, String ipAddress) {
        return sendCode(VerificationScene.PASSWORD_RESET, email, ipAddress);
    }

    public void verifyCode(String email, String code, String ipAddress) {
        verifyCode(VerificationScene.REGISTER, email, code, ipAddress);
    }

    public void verifyPasswordResetCode(String email, String code, String ipAddress) {
        verifyCode(VerificationScene.PASSWORD_RESET, email, code, ipAddress);
    }

    private SendCodeResult sendCode(VerificationScene scene, String email, String ipAddress) {
        String normalizedEmail = normalize(email);
        String normalizedIp = normalize(ipAddress);

        String cooldownKey = cooldownKey(scene, normalizedEmail);
        if (!acquireCooldown(cooldownKey, properties.getSendCooldownSeconds())) {
            throw new IllegalArgumentException("Please wait before requesting another verification code");
        }

        try {
            enforceSendQuota(scene, normalizedEmail, normalizedIp);
            String code = verificationCodeGenerator.generate(properties.getCodeLength());
            String debugVerificationCode = deliverCode(scene, normalizedEmail, code, properties.getCodeTtlSeconds());
            redisTemplate.opsForValue().set(codeKey(scene, normalizedEmail), hashCode(normalizedEmail, code), properties.getCodeTtlSeconds(), TimeUnit.SECONDS);
            clearVerifyFailures(scene, normalizedEmail, normalizedIp);
            return new SendCodeResult(properties.getCodeTtlSeconds(), properties.getSendCooldownSeconds(), debugVerificationCode);
        } catch (IllegalArgumentException exception) {
            redisTemplate.delete(cooldownKey);
            throw exception;
        } catch (Exception exception) {
            redisTemplate.delete(cooldownKey);
            log.warn("Failed to send {} verification code email={}", scene.keyPrefix(), normalizedEmail, exception);
            throw new IllegalArgumentException("Verification email send failed, please retry later");
        }
    }

    private void verifyCode(VerificationScene scene, String email, String code, String ipAddress) {
        String normalizedEmail = normalize(email);
        String normalizedIp = normalize(ipAddress);
        String lockKey = verifyLockKey(scene, normalizedEmail, normalizedIp);

        if (Boolean.TRUE.equals(redisTemplate.hasKey(lockKey))) {
            throw new IllegalArgumentException("Too many invalid verification attempts. Try again later");
        }

        String expectedHash = redisTemplate.opsForValue().get(codeKey(scene, normalizedEmail));
        if (expectedHash == null || expectedHash.isBlank()) {
            throw new IllegalArgumentException("Verification code is expired or not requested");
        }

        String actualHash = hashCode(normalizedEmail, code == null ? "" : code.trim());
        if (!constantTimeEquals(expectedHash, actualHash)) {
            recordVerifyFailure(scene, normalizedEmail, normalizedIp);
            throw new IllegalArgumentException("Invalid verification code");
        }

        clearVerificationState(scene, normalizedEmail, normalizedIp);
    }

    private boolean acquireCooldown(String key, long cooldownSeconds) {
        try {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(key, "1", Math.max(1L, cooldownSeconds), TimeUnit.SECONDS);
            return Boolean.TRUE.equals(acquired);
        } catch (Exception exception) {
            log.warn("Failed to acquire verification cooldown key={}", key, exception);
            throw new IllegalArgumentException("Verification service is temporarily unavailable");
        }
    }

    private void enforceSendQuota(VerificationScene scene, String email, String ipAddress) {
        long emailCount = incrementWithWindow(sendEmailHourKey(scene, email), 3600L);
        if (emailCount > properties.getMaxSendsPerEmailPerHour()) {
            throw new IllegalArgumentException("Too many verification code requests for this email");
        }

        long ipCount = incrementWithWindow(sendIpHourKey(scene, ipAddress), 3600L);
        if (ipCount > properties.getMaxSendsPerIpPerHour()) {
            throw new IllegalArgumentException("Too many verification code requests from this IP");
        }
    }

    private void recordVerifyFailure(VerificationScene scene, String email, String ipAddress) {
        String failureKey = verifyFailureKey(scene, email, ipAddress);
        String lockKey = verifyLockKey(scene, email, ipAddress);

        long failures = incrementWithWindow(failureKey, properties.getVerifyFailureWindowSeconds());
        if (failures >= properties.getMaxVerifyFailures()) {
            redisTemplate.opsForValue().set(lockKey, "1", properties.getVerifyLockSeconds(), TimeUnit.SECONDS);
        }
    }

    private void clearVerifyFailures(VerificationScene scene, String email, String ipAddress) {
        redisTemplate.delete(verifyFailureKey(scene, email, ipAddress));
        redisTemplate.delete(verifyLockKey(scene, email, ipAddress));
    }

    private void clearVerificationState(VerificationScene scene, String email, String ipAddress) {
        redisTemplate.delete(codeKey(scene, email));
        redisTemplate.delete(verifyFailureKey(scene, email, ipAddress));
        redisTemplate.delete(verifyLockKey(scene, email, ipAddress));
    }

    private long incrementWithWindow(String key, long windowSeconds) {
        try {
            Long count = redisTemplate.opsForValue().increment(key);
            if (count == null) {
                return 0L;
            }
            if (count == 1L) {
                redisTemplate.expire(key, Math.max(1L, windowSeconds), TimeUnit.SECONDS);
            }
            return count;
        } catch (Exception exception) {
            log.warn("Failed to increment verification key={}", key, exception);
            throw new IllegalArgumentException("Verification service is temporarily unavailable");
        }
    }

    private String deliverCode(VerificationScene scene, String email, String code, long ttlSeconds) {
        boolean delivered = verificationCodeDelivery.deliver(
            email,
            scene.subjectSuffix(),
            buildBody(scene, code, ttlSeconds),
            code
        );
        if (delivered) {
            return null;
        }

        if (!properties.isLocalDevFallbackEnabled()) {
            throw new IllegalArgumentException("Verification email delivery is unavailable");
        }

        log.info("Using local development verification fallback for scene={}", scene.keyPrefix());
        return code;
    }

    private String buildBody(VerificationScene scene, String code, long ttlSeconds) {
        long minutes = Math.max(1L, ttlSeconds / 60L);
        return String.join(
            "\n",
            "TerraPedia " + scene.bodyPurpose() + " verification code:",
            code,
            "",
            "This code is valid for " + minutes + " minute(s).",
            "If you did not request this, please ignore this email."
        );
    }

    private String hashCode(String email, String code) {
        return digest(email + "|" + code);
    }

    private String cooldownKey(VerificationScene scene, String email) {
        return "security:" + scene.keyPrefix() + ":cooldown:" + digest(email);
    }

    private String codeKey(VerificationScene scene, String email) {
        return "security:" + scene.keyPrefix() + ":value:" + digest(email);
    }

    private String sendEmailHourKey(VerificationScene scene, String email) {
        return "security:" + scene.keyPrefix() + ":send:email-hour:" + digest(email);
    }

    private String sendIpHourKey(VerificationScene scene, String ipAddress) {
        return "security:" + scene.keyPrefix() + ":send:ip-hour:" + digest(ipAddress);
    }

    private String verifyFailureKey(VerificationScene scene, String email, String ipAddress) {
        return "security:" + scene.keyPrefix() + ":verify:failure:" + digest(email + "|" + ipAddress);
    }

    private String verifyLockKey(VerificationScene scene, String email, String ipAddress) {
        return "security:" + scene.keyPrefix() + ":verify:lock:" + digest(email + "|" + ipAddress);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private boolean constantTimeEquals(String left, String right) {
        return MessageDigest.isEqual(left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
    }

    private String digest(String value) {
        try {
            MessageDigest messageDigest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(messageDigest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to hash verification content", exception);
        }
    }

    public record SendCodeResult(long expiresInSeconds, long cooldownSeconds, String debugVerificationCode) {
    }

    private enum VerificationScene {
        REGISTER("register-code", "Register Verification Code", "register"),
        PASSWORD_RESET("password-reset-code", "Password Reset Verification Code", "password reset");

        private final String keyPrefix;
        private final String subjectSuffix;
        private final String bodyPurpose;

        VerificationScene(String keyPrefix, String subjectSuffix, String bodyPurpose) {
            this.keyPrefix = keyPrefix;
            this.subjectSuffix = subjectSuffix;
            this.bodyPurpose = bodyPurpose;
        }

        public String keyPrefix() {
            return keyPrefix;
        }

        public String subjectSuffix() {
            return subjectSuffix;
        }

        public String bodyPurpose() {
            return bodyPurpose;
        }
    }
}
