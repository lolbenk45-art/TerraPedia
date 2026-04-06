package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.AdminUserCreateRequestDTO;
import com.terraria.skills.dto.AdminUserListItemDTO;
import com.terraria.skills.dto.AdminUserResetPasswordRequestDTO;
import com.terraria.skills.dto.AdminUserResetPasswordResponseDTO;
import com.terraria.skills.dto.AdminUserStatusUpdateRequestDTO;
import com.terraria.skills.service.UserManagementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/admin/users")
@RequiredArgsConstructor
@Tag(name = "AdminUsers", description = "Admin user management")
@SecurityRequirement(name = "bearerAuth")
public class AdminUserController {

    private final UserManagementService userManagementService;

    @GetMapping
    @Operation(summary = "Get users")
    public ResponseEntity<ApiResponse<List<AdminUserListItemDTO>>> getUsers(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String email,
        @RequestParam(required = false) Integer status
    ) {
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20);
        Page<AdminUserListItemDTO> userPage = userManagementService.getUsers(resolvedPage, resolvedLimit, email, status);
        Pagination pagination = new Pagination(userPage.getTotal(), (int) userPage.getCurrent(), (int) userPage.getSize());
        ApiResponse<List<AdminUserListItemDTO>> response = ApiResponse.success(userPage.getRecords());
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @Operation(summary = "Create user")
    public ResponseEntity<ApiResponse<AdminUserListItemDTO>> createUser(
        @Valid @RequestBody AdminUserCreateRequestDTO request
    ) {
        AdminUserListItemDTO created = userManagementService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(created, "User created"));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Update user status")
    public ResponseEntity<ApiResponse<Void>> updateStatus(
        @PathVariable Long id,
        @Valid @RequestBody AdminUserStatusUpdateRequestDTO request
    ) {
        userManagementService.updateStatus(id, request.getStatus());
        return ResponseEntity.ok(ApiResponse.success(null, "User status updated"));
    }

    @PostMapping("/{id}/reset-password")
    @Operation(summary = "Reset user password")
    public ResponseEntity<ApiResponse<AdminUserResetPasswordResponseDTO>> resetPassword(
        @PathVariable Long id,
        @Valid @RequestBody AdminUserResetPasswordRequestDTO request
    ) {
        AdminUserResetPasswordResponseDTO result = userManagementService.resetPassword(id, request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success(result, "Password reset success"));
    }
}
