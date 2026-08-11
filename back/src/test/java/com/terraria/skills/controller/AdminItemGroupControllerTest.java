package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemGroupDTO;
import com.terraria.skills.service.ItemGroupCanonicalService;
import com.terraria.skills.service.RecipeTreeService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminItemGroupControllerTest {

    private ItemGroupCanonicalService itemGroupCanonicalService;
    private RecipeTreeService recipeTreeService;
    private HttpServletRequest httpRequest;
    private AdminItemGroupController controller;

    @BeforeEach
    void setUp() {
        itemGroupCanonicalService = mock(ItemGroupCanonicalService.class);
        recipeTreeService = mock(RecipeTreeService.class);
        httpRequest = mock(HttpServletRequest.class);
        when(httpRequest.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE))
            .thenReturn(AdminTokenClaims.builder().username("alice").role("ADMIN").build());
        controller = new AdminItemGroupController(itemGroupCanonicalService, recipeTreeService);
    }

    @Test
    void getItemGroupsReadsCanonicalAdminAllowlistAndPreservesFilters() {
        ItemGroupDTO recipe = group("Any Wood", List.of("recipe"));
        ItemGroupDTO shimmer = group("Any Pylon", List.of("shimmer"));
        when(itemGroupCanonicalService.listGroups(ItemGroupCanonicalService.Consumer.ADMIN_ITEM_GROUPS))
            .thenReturn(List.of(recipe, shimmer));

        ResponseEntity<ApiResponse<List<ItemGroupDTO>>> response = controller.getItemGroups("pylon", "shimmer");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(List.of(shimmer), response.getBody().getData());
        verify(itemGroupCanonicalService).listGroups(ItemGroupCanonicalService.Consumer.ADMIN_ITEM_GROUPS);
    }

    @Test
    void createItemGroupCommitsCanonicalOverrideAndInvalidatesRecipeTreeCache() {
        ItemGroupDTO request = group("Any Pylon", List.of("shimmer"));
        when(itemGroupCanonicalService.findGroup(
            ItemGroupCanonicalService.Consumer.ADMIN_ITEM_GROUPS,
            "Any Pylon"
        )).thenReturn(java.util.Optional.empty());
        when(itemGroupCanonicalService.createCentralOverride(request, "alice")).thenReturn(request);

        ResponseEntity<ApiResponse<ItemGroupDTO>> response = controller.createItemGroup(httpRequest, request);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertEquals(request, response.getBody().getData());
        verify(itemGroupCanonicalService).createCentralOverride(request, "alice");
        verify(recipeTreeService).invalidateCaches();
    }

    @Test
    void writeAvailabilityReportsCrossServerReadOnlyMode() {
        when(itemGroupCanonicalService.getWriteAvailability()).thenReturn(
            new ItemGroupCanonicalService.WriteAvailability(false, "same-server topology required")
        );

        ApiResponse<ItemGroupCanonicalService.WriteAvailability> response = controller.getWriteAvailability();

        assertFalse(response.getData().enabled());
        assertTrue(response.getData().reason().contains("same-server"));
    }

    @Test
    void mutationReturnsConflictWhenTopologyDisablesWrites() {
        ItemGroupDTO request = group("Any Pylon", List.of("shimmer"));
        when(itemGroupCanonicalService.findGroup(
            ItemGroupCanonicalService.Consumer.ADMIN_ITEM_GROUPS,
            "Any Pylon"
        )).thenReturn(java.util.Optional.empty());
        when(itemGroupCanonicalService.createCentralOverride(request, "alice"))
            .thenThrow(new IllegalStateException("same-server topology required"));

        ResponseEntity<ApiResponse<ItemGroupDTO>> response = controller.createItemGroup(httpRequest, request);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals(409, response.getBody().getStatusCode());
    }

    private ItemGroupDTO group(String canonicalName, List<String> domains) {
        ItemGroupDTO group = new ItemGroupDTO();
        group.setCanonicalName(canonicalName);
        group.setDisplayNameEn(canonicalName);
        group.setDomains(domains);
        group.setAliases(List.of());
        group.setMembers(List.of());
        return group;
    }
}
