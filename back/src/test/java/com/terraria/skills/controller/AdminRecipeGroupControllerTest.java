package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemGroupDTO;
import com.terraria.skills.dto.ItemGroupMemberDTO;
import com.terraria.skills.dto.RecipeGroupDTO;
import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.service.ItemGroupCanonicalService;
import com.terraria.skills.service.RecipeTreeService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminRecipeGroupControllerTest {

    private ItemGroupCanonicalService itemGroupCanonicalService;
    private RecipeTreeService recipeTreeService;
    private HttpServletRequest httpRequest;
    private AdminRecipeGroupController controller;

    @BeforeEach
    void setUp() {
        itemGroupCanonicalService = mock(ItemGroupCanonicalService.class);
        recipeTreeService = mock(RecipeTreeService.class);
        httpRequest = mock(HttpServletRequest.class);
        when(httpRequest.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE))
            .thenReturn(AdminTokenClaims.builder().username("alice").role("ADMIN").build());
        controller = new AdminRecipeGroupController(itemGroupCanonicalService, recipeTreeService);
    }

    @Test
    void getRecipeGroupsReadsCanonicalRecipeAllowlist() {
        when(itemGroupCanonicalService.listGroups(ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS))
            .thenReturn(List.of(itemGroup("Any Wood")));

        ResponseEntity<ApiResponse<List<RecipeGroupDTO>>> response = controller.getRecipeGroups(null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("Any Wood", response.getBody().getData().get(0).getCanonicalName());
        assertEquals(9L, response.getBody().getData().get(0).getMembers().get(0).getItemId());
        verify(itemGroupCanonicalService).listGroups(ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS);
    }

    @Test
    void createRecipeGroupWritesCentralOverrideThroughCanonicalService() {
        RecipeGroupDTO request = new RecipeGroupDTO();
        request.setCanonicalName("Any Wood");
        RecipeGroupMemberDTO member = new RecipeGroupMemberDTO();
        member.setItemId(9L);
        member.setInternalName("Wood");
        request.setMembers(List.of(member));
        when(itemGroupCanonicalService.findGroup(
            ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS,
            "Any Wood"
        )).thenReturn(java.util.Optional.empty());
        when(itemGroupCanonicalService.createCentralOverride(any(), eq("alice"))).thenReturn(itemGroup("Any Wood"));

        ResponseEntity<ApiResponse<RecipeGroupDTO>> response = controller.createRecipeGroup(httpRequest, request);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertEquals("Any Wood", response.getBody().getData().getCanonicalName());
        verify(itemGroupCanonicalService).createCentralOverride(any(), eq("alice"));
        verify(recipeTreeService).invalidateCaches();
    }

    @Test
    void crossServerWriteFailureReturnsConflict() {
        RecipeGroupDTO request = new RecipeGroupDTO();
        request.setCanonicalName("Any Wood");
        when(itemGroupCanonicalService.findGroup(
            ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS,
            "Any Wood"
        )).thenReturn(java.util.Optional.empty());
        when(itemGroupCanonicalService.createCentralOverride(any(), eq("alice")))
            .thenThrow(new IllegalStateException("same-server topology required"));

        ResponseEntity<ApiResponse<RecipeGroupDTO>> response = controller.createRecipeGroup(httpRequest, request);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals(409, response.getBody().getStatusCode());
    }

    private ItemGroupDTO itemGroup(String canonicalName) {
        ItemGroupDTO group = new ItemGroupDTO();
        group.setCanonicalName(canonicalName);
        group.setDisplayNameEn(canonicalName);
        ItemGroupMemberDTO member = new ItemGroupMemberDTO();
        member.setItemId(9L);
        member.setInternalName("Wood");
        group.setMembers(List.of(member));
        return group;
    }
}
