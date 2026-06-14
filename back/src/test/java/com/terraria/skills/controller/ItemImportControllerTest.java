package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemImportRequestDTO;
import com.terraria.skills.dto.ItemImportResultDTO;
import com.terraria.skills.security.AdminJobLockProperties;
import com.terraria.skills.security.AdminJobLockService;
import com.terraria.skills.service.ItemImportService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ItemImportControllerTest {

    @Mock
    private ItemImportService itemImportService;
    @Mock
    private AdminJobLockService adminJobLockService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ItemImportController(itemImportService, adminJobLockService, new AdminJobLockProperties()))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void importItemsPassesDryRunQueryParameterToService() throws Exception {
        ItemImportResultDTO result = new ItemImportResultDTO();
        result.setTotal(1);
        when(itemImportService.importItems(any(ItemImportRequestDTO.class), eq(true))).thenReturn(result);

        mockMvc.perform(post("/items/import?dryRun=true")
                .contentType("application/json")
                .content("""
                    {
                      "source": "controller-test",
                      "items": [
                        {"name": "Iron Pickaxe", "internalName": "IronPickaxe", "categoryCode": "PICKAXE"}
                      ]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.total").value(1));

        verify(adminJobLockService, never()).tryAcquire(any(), org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void importItemsReturnsConflictWhenNonDryRunImportIsAlreadyRunning() throws Exception {
        when(adminJobLockService.tryAcquire("admin-job:item-import", 1800L)).thenReturn(Optional.empty());

        mockMvc.perform(post("/items/import")
                .contentType("application/json")
                .content("""
                    {
                      "source": "controller-test",
                      "items": [
                        {"name": "Iron Pickaxe", "internalName": "IronPickaxe", "categoryCode": "PICKAXE"}
                      ]
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.statusCode").value(409));
    }

    @Test
    void importItemsReleasesLockAfterNonDryRunImportCompletes() throws Exception {
        AdminJobLockService.JobLock lock = new AdminJobLockService.JobLock("key", "token");
        ItemImportResultDTO result = new ItemImportResultDTO();
        result.setTotal(1);
        when(adminJobLockService.tryAcquire("admin-job:item-import", 1800L)).thenReturn(Optional.of(lock));
        when(itemImportService.importItems(any(ItemImportRequestDTO.class))).thenReturn(result);

        mockMvc.perform(post("/items/import")
                .contentType("application/json")
                .content("""
                    {
                      "source": "controller-test",
                      "items": [
                        {"name": "Iron Pickaxe", "internalName": "IronPickaxe", "categoryCode": "PICKAXE"}
                      ]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.total").value(1));

        verify(adminJobLockService).release(lock);
    }
}
