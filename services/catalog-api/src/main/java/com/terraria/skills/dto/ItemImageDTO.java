package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ItemImageDTO {
    private Long id;
    private Long itemId;
    private String role;
    private String provider;
    private String sourceFileTitle;
    private String sourcePage;
    private LocalDateTime sourceRevisionTimestamp;
    private String originalUrl;
    private String cachedUrl;
    private String imageUrl;
    private Integer width;
    private Integer height;
    private String contentType;
    private Boolean isPrimary;
    private Integer sortOrder;
    private LocalDateTime lastVerifiedAt;
}
