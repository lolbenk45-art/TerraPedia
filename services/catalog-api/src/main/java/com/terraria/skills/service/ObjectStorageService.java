package com.terraria.skills.service;

import com.terraria.skills.dto.FileUploadResultDTO;
import com.terraria.skills.dto.StoredObjectDTO;
import org.springframework.web.multipart.MultipartFile;

public interface ObjectStorageService {

    FileUploadResultDTO uploadItemImage(MultipartFile file);

    FileUploadResultDTO uploadItemImage(MultipartFile file, String entityDomain);

    FileUploadResultDTO uploadUserAvatar(MultipartFile file, Long userId, String contentType, String extension);

    void deleteUserAvatarObject(Long userId, String objectKey);

    StoredObjectDTO getObject(String objectKey);
}
