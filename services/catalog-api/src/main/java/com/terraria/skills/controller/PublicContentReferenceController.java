package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveRequestDTO;
import com.terraria.skills.service.PublicContentReferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/public/content-references")
@RequiredArgsConstructor
@Tag(name = "Public Content References", description = "Unified public references for article embeds and external callers")
public class PublicContentReferenceController {

    private final PublicContentReferenceService publicContentReferenceService;

    @GetMapping
    @Operation(summary = "Search item and NPC references")
    public ResponseEntity<ApiResponse<List<PublicContentReferenceDTO>>> searchReferences(
        @RequestParam(required = false) String types,
        @RequestParam(required = false, name = "q") String query,
        @RequestParam(defaultValue = "20") int limit
    ) {
        List<PublicContentReferenceDTO> results = publicContentReferenceService.search(
            parseTypes(types),
            normalizeText(query),
            limit
        );
        return ResponseEntity.ok(ApiResponse.success(results));
    }

    @PostMapping("/resolve")
    @Operation(summary = "Resolve article content references")
    public ResponseEntity<ApiResponse<List<PublicContentReferenceDTO>>> resolveReferences(
        @RequestBody(required = false) PublicContentReferenceResolveRequestDTO request
    ) {
        List<PublicContentReferenceDTO> results = publicContentReferenceService.resolve(
            request == null || request.getRefs() == null ? List.of() : request.getRefs()
        );
        return ResponseEntity.ok(ApiResponse.success(results));
    }

    private Set<String> parseTypes(String types) {
        if (types == null || types.isBlank()) {
            return Set.of();
        }
        Set<String> parsed = new LinkedHashSet<>();
        Arrays.stream(types.split(","))
            .map(this::normalizeText)
            .filter(value -> !value.isEmpty())
            .forEach(parsed::add);
        return parsed;
    }

    private String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }
}
