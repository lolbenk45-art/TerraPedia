package com.terraria.skills.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
@Profile("e2e")
public class E2eVerificationCodeMailbox implements VerificationCodeDelivery {

    private final String runId;
    private final ConcurrentMap<MailboxKey, String> codesByMailbox = new ConcurrentHashMap<>();

    public E2eVerificationCodeMailbox(@Value("${terrapedia.e2e.run-id:}") String runId) {
        this.runId = runId;
    }

    @Override
    public boolean deliver(String email, String subject, String body, String code) {
        codesByMailbox.put(new MailboxKey(runId, normalize(email)), code);
        return true;
    }

    public Optional<String> latestCode(String email) {
        return Optional.ofNullable(codesByMailbox.get(new MailboxKey(runId, normalize(email))));
    }

    private String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private record MailboxKey(String runId, String email) {
    }
}
