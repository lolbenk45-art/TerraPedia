package com.terraria.skills.controller;

import com.terraria.skills.service.ObjectStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FileStorageControllerTest {

    private final ObjectStorageService objectStorageService = mock(ObjectStorageService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new FileStorageController(objectStorageService)).build();
    }

    @Test
    void shouldForwardEntityDomainWhenUploadingImage() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "eye-of-cthulhu.png",
            "image/png",
            new byte[] {1, 2, 3}
        );

        mockMvc.perform(
                multipart("/files/images")
                    .file(file)
                    .param("entityDomain", "npcs")
            )
            .andExpect(status().isOk());

        ArgumentCaptor<String> domainCaptor = ArgumentCaptor.forClass(String.class);
        verify(objectStorageService).uploadItemImage(org.mockito.ArgumentMatchers.any(), domainCaptor.capture());
        org.junit.jupiter.api.Assertions.assertEquals("npcs", domainCaptor.getValue());
    }
}
