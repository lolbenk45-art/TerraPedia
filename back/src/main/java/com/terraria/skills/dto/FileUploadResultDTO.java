package com.terraria.skills.dto;

import lombok.Data;

@Data
public class FileUploadResultDTO {

    private String bucket;
    private String objectKey;
    private String url;
    private String originalFilename;
    private String contentType;
    private long size;
}
