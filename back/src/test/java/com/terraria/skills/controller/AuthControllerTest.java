package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.AdminAuthProperties;
import com.terraria.skills.auth.AdminJwtService;
import com.terraria.skills.auth.AdminLoginRateLimitService;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.SecurityAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthControllerTest {

    private final AdminJwtService adminJwtService = mock(AdminJwtService.class);
    private final AdminLoginRateLimitService adminLoginRateLimitService = mock(AdminLoginRateLimitService.class);
    private final SecurityAuditService securityAuditService = mock(SecurityAuditService.class);
    private final ClientIpResolver clientIpResolver = mock(ClientIpResolver.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminAuthProperties properties = new AdminAuthProperties();
        properties.setUsername("admin");
        properties.setPassword("secret");
        properties.setDisplayName("Admin");

        when(clientIpResolver.resolve(org.mockito.ArgumentMatchers.any(MockHttpServletRequest.class)))
            .thenReturn("198.51.100.77");

        mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(
                properties,
                adminJwtService,
                adminLoginRateLimitService,
                securityAuditService,
                clientIpResolver
            ))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldRecordFailedAdminLoginAndAuditIt() throws Exception {
        mockMvc.perform(post("/auth/login")
                .contentType("application/json")
                .content("""
                    {
                      "username": "admin",
                      "password": "wrong"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("用户名或密码错误"));

        verify(adminLoginRateLimitService).recordFailure("admin", "198.51.100.77");
        verify(securityAuditService).log(
            eq("ADMIN_LOGIN_FAILED"),
            eq("ADMIN"),
            eq(null),
            eq(null),
            eq("198.51.100.77"),
            contains("username=admin")
        );
        verifyNoInteractions(adminJwtService);
    }

    @Test
    void shouldRejectLockedAdminLoginBeforePasswordCheck() throws Exception {
        when(adminLoginRateLimitService.isLocked("admin", "198.51.100.77")).thenReturn(true);

        mockMvc.perform(post("/auth/login")
                .contentType("application/json")
                .content("""
                    {
                      "username": "admin",
                      "password": "secret"
                    }
                    """))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.message").value("管理员登录失败次数过多，请稍后再试"));

        verify(securityAuditService).log(
            eq("ADMIN_LOGIN_LOCKED"),
            eq("ADMIN"),
            eq(null),
            eq(null),
            eq("198.51.100.77"),
            contains("username=admin")
        );
        verifyNoInteractions(adminJwtService);
    }

    @Test
    void shouldClearAdminLoginFailuresAfterSuccessfulLogin() throws Exception {
        AdminTokenClaims claims = AdminTokenClaims.builder()
            .username("admin")
            .displayName("Admin")
            .role("ADMIN")
            .expiresAt(1893456000000L)
            .build();
        when(adminJwtService.issueToken()).thenReturn(claims);
        when(adminJwtService.createToken(claims)).thenReturn("admin-token");
        when(adminJwtService.getExpiresAtMillis(claims)).thenReturn(1893456000000L);

        mockMvc.perform(post("/auth/login")
                .contentType("application/json")
                .content("""
                    {
                      "username": "admin",
                      "password": "secret"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.token").value("admin-token"));

        verify(adminLoginRateLimitService).recordSuccess("admin", "198.51.100.77");
        verify(securityAuditService).log(
            eq("ADMIN_LOGIN_SUCCESS"),
            eq("ADMIN"),
            eq(null),
            eq(null),
            eq("198.51.100.77"),
            contains("username=admin")
        );
    }
}
