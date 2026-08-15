package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.auth.UnauthenticatedException;
import com.terraria.skills.auth.UserAuthenticationInterceptor;
import com.terraria.skills.auth.UserTokenClaims;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.dto.UserArticleUpsertRequestDTO;
import com.terraria.skills.security.ClientIpResolver;
import com.terraria.skills.service.ArticleService;
import com.terraria.skills.service.ObjectStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/user/articles")
@RequiredArgsConstructor
@Tag(name = "UserArticles", description = "User self article management")
public class UserArticleController {

    private final ArticleService articleService;
    private final ObjectStorageService objectStorageService;
    private final ClientIpResolver clientIpResolver;

    @GetMapping
    @Operation(summary = "Get current user articles")
    public ResponseEntity<ApiResponse<List<ArticleDTO>>> getUserArticles(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String keyword,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        int resolvedPage = PaginationParams.resolvePage(page);
        int resolvedLimit = PaginationParams.resolveLimit(limit, size, 20);
        Page<ArticleDTO> articlePage = articleService.getUserArticles(claims.getUserId(), resolvedPage, resolvedLimit, keyword);
        ApiResponse<List<ArticleDTO>> response = ApiResponse.success(articlePage.getRecords());
        response.setPagination(new Pagination(articlePage.getTotal(), (int) articlePage.getCurrent(), (int) articlePage.getSize()));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get current user article detail")
    public ResponseEntity<ApiResponse<ArticleDTO>> getUserArticle(
        @PathVariable Long id,
        HttpServletRequest request
    ) {
        UserTokenClaims claims = getRequiredClaims(request);
        return ResponseEntity.ok(ApiResponse.success(articleService.getUserArticleById(claims.getUserId(), id)));
    }

    @PostMapping
    @Operation(summary = "Create current user draft article")
    public ResponseEntity<ApiResponse<ArticleDTO>> createArticle(
        @Valid @RequestBody UserArticleUpsertRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
            articleService.createUserArticle(
                claims.getUserId(),
                request,
                claims.getDisplayName(),
                clientIpResolver.resolve(httpRequest)
            ),
            "Article created"
        ));
    }

    @PostMapping(value = "/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload current user article image")
    public ResponseEntity<ApiResponse<FileUploadResultDTO>> uploadArticleImage(
        @RequestPart("file") MultipartFile file,
        HttpServletRequest httpRequest
    ) {
        getRequiredClaims(httpRequest);
        FileUploadResultDTO result = objectStorageService.uploadItemImage(file, "articles");
        return ResponseEntity.ok(ApiResponse.success(result, "Article image uploaded"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update current user article")
    public ResponseEntity<ApiResponse<ArticleDTO>> updateArticle(
        @PathVariable Long id,
        @Valid @RequestBody UserArticleUpsertRequestDTO request,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.updateUserArticle(
                claims.getUserId(),
                id,
                request,
                claims.getDisplayName(),
                clientIpResolver.resolve(httpRequest)
            ),
            "Article updated"
        ));
    }

    @PostMapping("/{id}/submit-review")
    @Operation(summary = "Submit current user article for review")
    public ResponseEntity<ApiResponse<ArticleDTO>> submitReview(
        @PathVariable Long id,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.submitUserArticleReview(
                claims.getUserId(),
                id,
                claims.getDisplayName(),
                clientIpResolver.resolve(httpRequest)
            ),
            "Article submitted for review"
        ));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete current user draft or rejected article")
    public ResponseEntity<ApiResponse<ArticleDTO>> deleteArticle(
        @PathVariable Long id,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.deleteUserArticle(claims.getUserId(), id),
            "Article deleted"
        ));
    }

    @PostMapping("/{id}/withdraw")
    @Operation(summary = "Withdraw current user article from review")
    public ResponseEntity<ApiResponse<ArticleDTO>> withdrawArticle(
        @PathVariable Long id,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.withdrawUserArticle(claims.getUserId(), id),
            "Article withdrawn"
        ));
    }

    @PostMapping("/{id}/offline")
    @Operation(summary = "Take current user published article offline")
    public ResponseEntity<ApiResponse<ArticleDTO>> offlineArticle(
        @PathVariable Long id,
        HttpServletRequest httpRequest
    ) {
        UserTokenClaims claims = getRequiredClaims(httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
            articleService.offlineUserArticle(claims.getUserId(), id),
            "Article taken offline"
        ));
    }

    private UserTokenClaims getRequiredClaims(HttpServletRequest request) {
        Object claims = request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
        if (!(claims instanceof UserTokenClaims userTokenClaims) || userTokenClaims.getUserId() == null) {
            throw new UnauthenticatedException("未登录或登录状态已失效");
        }
        return userTokenClaims;
    }
}
