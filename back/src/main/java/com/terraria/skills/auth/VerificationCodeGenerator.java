package com.terraria.skills.auth;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

@Component
public class VerificationCodeGenerator {

    private final SecureRandom random = new SecureRandom();

    public String generate(int length) {
        int safeLength = Math.max(4, Math.min(length, 8));
        StringBuilder builder = new StringBuilder(safeLength);
        for (int index = 0; index < safeLength; index++) {
            builder.append(random.nextInt(10));
        }
        return builder.toString();
    }
}
