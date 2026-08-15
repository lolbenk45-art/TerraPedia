package com.terraria.skills.controller;

import com.terraria.skills.auth.AdminAccessDeniedException;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.common.AdminTextUtils;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemGroupDTO;
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
@RequestMapping("/admin/item-groups")
@RequiredArgsConstructor
@Tag(name = "AdminItemGroups", description = "Admin canonical any item group management")
@SecurityRequirement(name = "bearerAuth")
public class AdminItemGroupController {

    private final ItemGroupCanonicalService itemGroupCanonicalService;
    private final RecipeTreeService recipeTreeService;

    @GetMapping
    @Operation(summary = "Get canonical item groups")
    public ResponseEntity<ApiResponse<List<ItemGroupDTO>>> getItemGroups(
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) String domain
    ) {
        List<ItemGroupDTO> groups = itemGroupCanonicalService.listGroups(
            ItemGroupCanonicalService.Consumer.ADMIN_ITEM_GROUPS
        );
        String normalizedDomain = normalizeDomain(domain);
        if (normalizedDomain != null && !"all".equals(normalizedDomain)) {
            groups = groups.stream()
                .filter(group -> group.getDomains() != null && group.getDomains().stream()
                    .map(this::normalizeDomain)
                    .anyMatch(normalizedDomain::equals))
                .toList();
        }
        String normalizedKeyword = AdminTextUtils.trimToNull(keyword);
        if (normalizedKeyword != null) {
            String needle = normalizedKeyword.toLowerCase(Locale.ROOT);
            groups = groups.stream().filter(group -> (
                contains(group.getCanonicalName(), needle)
                    || contains(group.getDisplayNameEn(), needle)
                    || contains(group.getDisplayNameZh(), needle)
                    || safeAliases(group).stream().anyMatch(alias -> contains(alias, needle))
            )).toList();
        }
        return ResponseEntity.ok(ApiResponse.success(groups));
    }

    @GetMapping("/write-availability")
    @Operation(summary = "Get canonical item group write availability")
    public ApiResponse<ItemGroupCanonicalService.WriteAvailability> getWriteAvailability() {
        return ApiResponse.success(itemGroupCanonicalService.getWriteAvailability());
    }

    @GetMapping("/{canonicalName}")
    @Operation(summary = "Get canonical item group detail")
    public ResponseEntity<ApiResponse<ItemGroupDTO>> getItemGroup(@PathVariable String canonicalName) {
        return itemGroupCanonicalService.findGroup(
                ItemGroupCanonicalService.Consumer.ADMIN_ITEM_GROUPS,
                canonicalName
            )
            .map(group -> ResponseEntity.ok(ApiResponse.success(group)))
            .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Item group not found")));
    }

    @PostMapping
    @Operation(summary = "Create canonical central item group override")
    public ResponseEntity<ApiResponse<ItemGroupDTO>> createItemGroup(
        HttpServletRequest httpRequest,
        @RequestBody ItemGroupDTO request
    ) {
        try {
            String actor = requireAdminActor(httpRequest);
            String canonicalName = request == null ? null : request.getCanonicalName();
            if (itemGroupCanonicalService.findGroup(
                ItemGroupCanonicalService.Consumer.ADMIN_ITEM_GROUPS,
                canonicalName
            ).isPresent()) {
                return ResponseEntity.badRequest().body(ApiResponse.error(400, "Item group already exists"));
            }
            ItemGroupDTO committed = itemGroupCanonicalService.createCentralOverride(request, actor);
            recipeTreeService.invalidateCaches();
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(committed, "Item group created"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, exception.getMessage()));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(409, exception.getMessage()));
        }
    }

    @PutMapping("/{canonicalName}")
    @Operation(summary = "Update canonical central item group override")
    public ResponseEntity<ApiResponse<ItemGroupDTO>> updateItemGroup(
        HttpServletRequest httpRequest,
        @PathVariable String canonicalName,
        @RequestBody ItemGroupDTO request
    ) {
        try {
            String actor = requireAdminActor(httpRequest);
            if (itemGroupCanonicalService.findGroup(
                ItemGroupCanonicalService.Consumer.ADMIN_ITEM_GROUPS,
                canonicalName
            ).isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "Item group not found"));
            }
            ItemGroupDTO committed = itemGroupCanonicalService.updateCentralOverride(canonicalName, request, actor);
            recipeTreeService.invalidateCaches();
            return ResponseEntity.ok(ApiResponse.success(committed, "Item group updated"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, exception.getMessage()));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(409, exception.getMessage()));
        }
    }

    @DeleteMapping("/{canonicalName}")
    @Operation(summary = "Delete canonical central item group override")
    public ResponseEntity<ApiResponse<Void>> deleteItemGroup(
        HttpServletRequest httpRequest,
        @PathVariable String canonicalName
    ) {
        try {
            itemGroupCanonicalService.deleteCentralOverride(canonicalName, requireAdminActor(httpRequest));
            recipeTreeService.invalidateCaches();
            return ResponseEntity.ok(ApiResponse.success(null, "Item group deleted"));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, exception.getMessage()));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(409, exception.getMessage()));
        }
    }

    private List<String> safeAliases(ItemGroupDTO group) {
        return group.getAliases() == null ? List.of() : group.getAliases();
    }

    private String normalizeDomain(String value) {
        String normalized = AdminTextUtils.trimToNull(value);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT).replace('-', '_');
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
