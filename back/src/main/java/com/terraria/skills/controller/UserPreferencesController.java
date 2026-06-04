package com.terraria.skills.controller;

import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.UserPreferencesDTO;
import com.terraria.skills.dto.UserPreferencesRequestDTO;
import com.terraria.skills.service.UserPreferencesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/user/preferences")
@RequiredArgsConstructor
@Tag(name = "UserPreferences", description = "Authenticated user display preferences APIs")
public class UserPreferencesController {

    private final UserPreferencesService userPreferencesService;

    @GetMapping
    @Operation(summary = "Get current user's display preferences")
    public ResponseEntity<ApiResponse<UserPreferencesDTO>> getPreferences(HttpServletRequest request) {
        UserTokenClaims claims = getRequiredClaims(request);
        return ResponseEntity.ok(ApiResponse.success(userPreferencesService.getPreferences(claims.getUserId())));
    }

    @PatchMapping
    @Operation(summary = "Update current user's display preferences")
    public ResponseEntity<ApiResponse<UserPreferencesDTO>> updatePreferences(
        @Valid @RequestBody UserPreferencesRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        UserPreferencesDTO preferences = userPreferencesService.updatePreferences(claims.getUserId(), request);
        return ResponseEntity.ok(ApiResponse.success(preferences, "Preferences updated"));
    }

    private UserTokenClaims getRequiredClaims(HttpServletRequest request) {
        Object claims = request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
        if (claims instanceof UserTokenClaims userTokenClaims && userTokenClaims.getUserId() != null) {
            return userTokenClaims;
        }
        throw new IllegalArgumentException("Invalid login session");
    }
}
