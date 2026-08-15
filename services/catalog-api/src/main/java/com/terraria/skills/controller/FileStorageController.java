package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.dto.StoredObjectDTO;
import com.terraria.skills.service.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/files")
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "terraria.storage.minio", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FileStorageController {

    private final ObjectStorageService objectStorageService;

    @PostMapping(value = "/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<FileUploadResultDTO>> uploadImage(
        @RequestPart("file") MultipartFile file,
        @RequestParam(value = "entityDomain", required = false) String entityDomain
    ) {
        FileUploadResultDTO result = objectStorageService.uploadItemImage(file, entityDomain);
        return ResponseEntity.ok(ApiResponse.success(result, "Image uploaded"));
    }

    @GetMapping("/objects/{*objectKey}")
    public ResponseEntity<InputStreamResource> getObject(@PathVariable String objectKey) {
        StoredObjectDTO object = objectStorageService.getObject(objectKey);
        String contentType = object.getContentType() == null || object.getContentType().isBlank()
            ? MediaType.APPLICATION_OCTET_STREAM_VALUE
            : object.getContentType();

        ResponseEntity.BodyBuilder response = ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(contentType))
            .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600");
        if (object.getSize() >= 0) {
            response.contentLength(object.getSize());
        }
        return response.body(new InputStreamResource(object.getInputStream()));
    }
}
