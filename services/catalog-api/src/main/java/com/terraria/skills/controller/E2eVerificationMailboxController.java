package com.terraria.skills.controller;

import com.terraria.skills.auth.E2eVerificationCodeMailbox;
import com.terraria.skills.common.ApiResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

@RestController
@Profile("e2e")
@RequestMapping("/e2e/verification-codes")
public class E2eVerificationMailboxController {

    private final E2eVerificationCodeMailbox mailbox;
    private final String runSecret;

    public E2eVerificationMailboxController(
        E2eVerificationCodeMailbox mailbox,
        @Value("${terrapedia.e2e.run-secret:}") String runSecret
    ) {
        this.mailbox = mailbox;
        this.runSecret = runSecret;
    }

    @GetMapping("/{email}")
    public ResponseEntity<ApiResponse<Map<String, String>>> latestCode(
        @PathVariable String email,
        @RequestHeader(name = "X-TerraPedia-E2E-Secret", required = false) String suppliedSecret
    ) {
        if (!secretMatches(suppliedSecret)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error(HttpStatus.FORBIDDEN.value(), "Forbidden"));
        }

        return mailbox.latestCode(email)
            .map(code -> ResponseEntity.ok(ApiResponse.success(Map.of("code", code))))
            .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(HttpStatus.NOT_FOUND.value(), "Verification code not found")));
    }

    private boolean secretMatches(String suppliedSecret) {
        if (suppliedSecret == null || runSecret == null) {
            return false;
        }
        return MessageDigest.isEqual(
            runSecret.getBytes(StandardCharsets.UTF_8),
            suppliedSecret.getBytes(StandardCharsets.UTF_8)
        );
    }
}
