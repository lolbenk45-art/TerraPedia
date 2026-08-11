package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAccessDeniedException;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.common.AdminTextUtils;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemGroupDTO;
import com.terraria.skills.dto.ItemGroupMemberDTO;
import com.terraria.skills.dto.RecipeGroupDTO;
import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.service.ItemGroupCanonicalService;
import com.terraria.skills.service.RecipeTreeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/admin/recipe-groups")
@RequiredArgsConstructor
@Tag(name = "AdminRecipeGroups", description = "Admin canonical recipe group management")
@SecurityRequirement(name = "bearerAuth")
public class AdminRecipeGroupController {

    private final ItemGroupCanonicalService itemGroupCanonicalService;
    private final RecipeTreeService recipeTreeService;

    @GetMapping
    @Operation(summary = "Get canonical recipe groups")
    public ResponseEntity<ApiResponse<List<RecipeGroupDTO>>> getRecipeGroups(
        @RequestParam(required = false) String keyword
    ) {
        String normalizedKeyword = AdminTextUtils.trimToNull(keyword);
        List<RecipeGroupDTO> groups = itemGroupCanonicalService
            .listGroups(ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS)
            .stream()
            .map(this::toRecipeGroup)
            .filter(group -> normalizedKeyword == null || contains(group, normalizedKeyword))
            .toList();
        return ResponseEntity.ok(ApiResponse.success(groups));
    }

    @GetMapping("/{canonicalName}")
    @Operation(summary = "Get canonical recipe group detail")
    public ResponseEntity<ApiResponse<RecipeGroupDTO>> getRecipeGroup(@PathVariable String canonicalName) {
        return itemGroupCanonicalService.findGroup(
                ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS,
                canonicalName
            )
            .map(group -> ResponseEntity.ok(ApiResponse.success(toRecipeGroup(group))))
            .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Recipe group not found")));
    }

    @PostMapping
    @Operation(summary = "Create canonical recipe group override")
    public ResponseEntity<ApiResponse<RecipeGroupDTO>> createRecipeGroup(
        HttpServletRequest httpRequest,
        @RequestBody RecipeGroupDTO request
    ) {
        try {
            String actor = requireAdminActor(httpRequest);
            String canonicalName = request == null ? null : request.getCanonicalName();
            if (itemGroupCanonicalService.findGroup(
                ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS,
                canonicalName
            ).isPresent()) {
                return ResponseEntity.badRequest().body(ApiResponse.error(400, "Recipe group already exists"));
            }
            ItemGroupDTO committed = itemGroupCanonicalService.createCentralOverride(toItemGroup(request), actor);
            recipeTreeService.invalidateCaches();
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(toRecipeGroup(committed), "Recipe group created"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, exception.getMessage()));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(409, exception.getMessage()));
        }
    }

    @PutMapping("/{canonicalName}")
    @Operation(summary = "Update canonical recipe group override")
    public ResponseEntity<ApiResponse<RecipeGroupDTO>> updateRecipeGroup(
        HttpServletRequest httpRequest,
        @PathVariable String canonicalName,
        @RequestBody RecipeGroupDTO request
    ) {
        try {
            String actor = requireAdminActor(httpRequest);
            if (itemGroupCanonicalService.findGroup(
                ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS,
                canonicalName
            ).isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "Recipe group not found"));
            }
            ItemGroupDTO committed = itemGroupCanonicalService.updateCentralOverride(canonicalName, toItemGroup(request), actor);
            recipeTreeService.invalidateCaches();
            return ResponseEntity.ok(ApiResponse.success(toRecipeGroup(committed), "Recipe group updated"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, exception.getMessage()));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(409, exception.getMessage()));
        }
    }

    @DeleteMapping("/{canonicalName}")
    @Operation(summary = "Delete canonical recipe group override")
    public ResponseEntity<ApiResponse<Void>> deleteRecipeGroup(
        HttpServletRequest httpRequest,
        @PathVariable String canonicalName
    ) {
        try {
            itemGroupCanonicalService.deleteCentralOverride(canonicalName, requireAdminActor(httpRequest));
            recipeTreeService.invalidateCaches();
            return ResponseEntity.ok(ApiResponse.success(null, "Recipe group deleted"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, exception.getMessage()));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(409, exception.getMessage()));
        }
    }

    private ItemGroupDTO toItemGroup(RecipeGroupDTO source) {
        if (source == null) return null;
        ItemGroupDTO target = new ItemGroupDTO();
        target.setCanonicalName(source.getCanonicalName());
        target.setDisplayNameEn(source.getDisplayNameEn());
        target.setDisplayNameZh(source.getDisplayNameZh());
        target.setDomains(List.of("recipe"));
        target.setAliases(List.of());
        target.setMembers((source.getMembers() == null ? List.<RecipeGroupMemberDTO>of() : source.getMembers())
            .stream().map(this::toItemMember).toList());
        return target;
    }

    private RecipeGroupDTO toRecipeGroup(ItemGroupDTO source) {
        RecipeGroupDTO target = new RecipeGroupDTO();
        target.setCanonicalName(source.getCanonicalName());
        target.setDisplayNameEn(source.getDisplayNameEn());
        target.setDisplayNameZh(source.getDisplayNameZh());
        target.setMembers((source.getMembers() == null ? List.<ItemGroupMemberDTO>of() : source.getMembers())
            .stream().map(this::toRecipeMember).toList());
        return target;
    }

    private ItemGroupMemberDTO toItemMember(RecipeGroupMemberDTO source) {
        ItemGroupMemberDTO target = new ItemGroupMemberDTO();
        target.setItemId(source.getItemId());
        target.setInternalName(source.getInternalName());
        target.setName(source.getName());
        target.setNameZh(source.getNameZh());
        target.setImage(source.getImage());
        return target;
    }

    private RecipeGroupMemberDTO toRecipeMember(ItemGroupMemberDTO source) {
        RecipeGroupMemberDTO target = new RecipeGroupMemberDTO();
        target.setItemId(source.getItemId());
        target.setInternalName(source.getInternalName());
        target.setName(source.getName());
        target.setNameZh(source.getNameZh());
        target.setImage(source.getImage());
        return target;
    }

    private boolean contains(RecipeGroupDTO group, String keyword) {
        String needle = keyword.toLowerCase(Locale.ROOT);
        return contains(group.getCanonicalName(), needle)
            || contains(group.getDisplayNameEn(), needle)
            || contains(group.getDisplayNameZh(), needle);
    }

    private boolean contains(String value, String needle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(needle);
    }

    private String requireAdminActor(HttpServletRequest httpRequest) {
        Object attribute = httpRequest.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE);
        if (!(attribute instanceof AdminTokenClaims claims)
            || !"ADMIN".equalsIgnoreCase(claims.getRole())
            || AdminTextUtils.trimToNull(claims.getUsername()) == null) {
            throw new AdminAccessDeniedException("authenticated admin actor is required");
        }
        return claims.getUsername().trim();
    }
}
