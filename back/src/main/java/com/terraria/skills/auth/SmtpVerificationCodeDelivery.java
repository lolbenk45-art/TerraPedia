package com.terraria.skills.auth;

import com.terraria.skills.mail.MailProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@Profile("!e2e")
@RequiredArgsConstructor
public class SmtpVerificationCodeDelivery implements VerificationCodeDelivery {

    private final JavaMailSender mailSender;
    private final MailProperties mailProperties;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Override
    public boolean deliver(String email, String subject, String body, String code) {
        String from = resolveFromAddress();
        if (!mailProperties.isEnabled() || from == null || from.isBlank()) {
            return false;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from.trim());
            message.setTo(email);
            message.setSubject(subjectPrefix() + " " + subject);
            message.setText(body);
            mailSender.send(message);
            return true;
        } catch (Exception exception) {
            log.warn("Verification email delivery unavailable");
            return false;
        }
    }

    private String resolveFromAddress() {
        if (mailProperties.getFromAddress() != null && !mailProperties.getFromAddress().isBlank()) {
            return mailProperties.getFromAddress();
        }
        return mailUsername;
    }

    private String subjectPrefix() {
        String configuredPrefix = mailProperties.getSubjectPrefix();
        return configuredPrefix == null || configuredPrefix.isBlank() ? "[TerraPedia]" : configuredPrefix.trim();
    }
}
