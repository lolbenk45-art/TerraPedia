package com.terraria.skills.auth;

import com.terraria.skills.controller.E2eVerificationMailboxController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RegisterVerificationServiceTest {

    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
    private final VerificationCodeDelivery delivery = mock(VerificationCodeDelivery.class);
    private final VerificationCodeGenerator generator = mock(VerificationCodeGenerator.class);
    private RegisterVerificationService service;

    @BeforeEach
    void setUp() {
        RegisterVerificationProperties properties = new RegisterVerificationProperties();
        properties.setCodeLength(6);
        properties.setCodeTtlSeconds(600L);
        properties.setSendCooldownSeconds(60L);

        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(anyString(), eq("1"), anyLong(), any())).thenReturn(true);
        when(valueOperations.increment(anyString())).thenReturn(1L);
        when(generator.generate(6)).thenReturn("123456");
        when(delivery.deliver(anyString(), anyString(), anyString(), anyString())).thenReturn(true);

        service = new RegisterVerificationService(properties, redisTemplate, delivery, generator);
    }

    @Test
    void shouldDeliverRegistrationCodeOnlyThroughTheDeliverySeam() {
        RegisterVerificationService.SendCodeResult result = service.sendCode(" User@Example.com ", "203.0.113.9");

        assertNull(result.debugVerificationCode());
        verify(generator).generate(6);
        verify(delivery).deliver(
            eq("user@example.com"),
            eq("Register Verification Code"),
            contains("123456"),
            eq("123456")
        );
    }

    @Test
    void shouldExposeOnlyTheLatestCodeForTheCurrentRunAndNormalizedEmail() {
        E2eVerificationCodeMailbox mailbox = new E2eVerificationCodeMailbox("runner_01");
        mailbox.deliver("User@Example.com", "subject", "body", "111111");
        mailbox.deliver(" user@example.com ", "subject", "body", "222222");

        assertEquals("222222", mailbox.latestCode("USER@example.com").orElseThrow());
        assertTrue(mailbox.latestCode("other@example.com").isEmpty());
    }

    @Test
    void shouldRejectWrongMailboxSecretAndReturnLatestCodeForCorrectSecret() throws Exception {
        E2eVerificationCodeMailbox mailbox = new E2eVerificationCodeMailbox("runner_01");
        mailbox.deliver("user@example.com", "subject", "body", "111111");
        mailbox.deliver("USER@example.com", "subject", "body", "222222");
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(
            new E2eVerificationMailboxController(mailbox, "e2e-test-secret-with-at-least-24-chars")
        ).build();

        mockMvc.perform(get("/e2e/verification-codes/user@example.com")
                .header("X-TerraPedia-E2E-Secret", "wrong-e2e-secret"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.data").doesNotExist());

        mockMvc.perform(get("/e2e/verification-codes/USER@example.com")
                .header("X-TerraPedia-E2E-Secret", "e2e-test-secret-with-at-least-24-chars"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.code").value("222222"))
            .andExpect(jsonPath("$.data.*", hasSize(1)));
    }
}
