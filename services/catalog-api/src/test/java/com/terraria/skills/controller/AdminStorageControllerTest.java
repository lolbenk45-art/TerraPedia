package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.AdminWikiImageSyncResultDTO;
import com.terraria.skills.security.AdminJobLockProperties;
import com.terraria.skills.security.AdminJobLockService;
import com.terraria.skills.service.WikiImageSyncService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminStorageControllerTest {

    private final WikiImageSyncService wikiImageSyncService = mock(WikiImageSyncService.class);
    private final AdminJobLockService adminJobLockService = mock(AdminJobLockService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        AdminJobLockProperties lockProperties = new AdminJobLockProperties();
        mockMvc = MockMvcBuilders.standaloneSetup(
                new AdminStorageController(wikiImageSyncService, adminJobLockService, lockProperties)
            )
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnConflictWhenWikiImageSyncIsAlreadyRunning() throws Exception {
        when(adminJobLockService.tryAcquire("admin-job:wiki-image-sync", 1800L)).thenReturn(Optional.empty());

        mockMvc.perform(post("/admin/storage/wiki-images/sync").contentType("application/json").content("{}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.statusCode").value(409));
    }

    @Test
    void shouldReleaseWikiImageSyncLockAfterCompletion() throws Exception {
        AdminJobLockService.JobLock lock = new AdminJobLockService.JobLock("key", "token");
        when(adminJobLockService.tryAcquire("admin-job:wiki-image-sync", 1800L)).thenReturn(Optional.of(lock));
        when(wikiImageSyncService.syncWikiImages(any())).thenReturn(new AdminWikiImageSyncResultDTO());

        mockMvc.perform(post("/admin/storage/wiki-images/sync").contentType("application/json").content("{}"))
            .andExpect(status().isOk());

        verify(adminJobLockService).release(lock);
    }
}
