package com.terraria.skills.service;

import com.terraria.skills.dto.FileUploadResultDTO;
import org.springframework.web.multipart.MultipartFile;

public interface ObjectStorageService {

    FileUploadResultDTO uploadItemImage(MultipartFile file);

    FileUploadResultDTO uploadItemImage(MultipartFile file, String entityDomain);
}
