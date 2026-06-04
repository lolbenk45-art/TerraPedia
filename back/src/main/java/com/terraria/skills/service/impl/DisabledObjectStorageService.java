package com.terraria.skills.service.impl;

import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.dto.StoredObjectDTO;
import com.terraria.skills.service.ObjectStorageService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@ConditionalOnMissingBean(ObjectStorageService.class)
public class DisabledObjectStorageService implements ObjectStorageService {

    @Override
    public FileUploadResultDTO uploadItemImage(MultipartFile file) {
        throw disabled();
    }

    @Override
    public FileUploadResultDTO uploadItemImage(MultipartFile file, String entityDomain) {
        throw disabled();
    }

    @Override
    public FileUploadResultDTO uploadUserAvatar(MultipartFile file, Long userId, String contentType, String extension) {
        throw disabled();
    }

    @Override
    public void deleteUserAvatarObject(Long userId, String objectKey) {
        // Storage is disabled, so there is no remote avatar object to clean up.
    }

    @Override
    public StoredObjectDTO getObject(String objectKey) {
        throw disabled();
    }

    private IllegalStateException disabled() {
        return new IllegalStateException("MinIO storage is disabled");
    }
}
