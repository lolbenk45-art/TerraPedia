package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("item_images")
public class ItemImage implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("item_id")
    private Long itemId;

    @TableField("role")
    private String role;

    @TableField("provider")
    private String provider;

    @TableField("source_file_title")
    private String sourceFileTitle;

    @TableField("source_page")
    private String sourcePage;

    @TableField("source_revision_timestamp")
    private LocalDateTime sourceRevisionTimestamp;

    @TableField("original_url")
    private String originalUrl;

    @TableField("cached_url")
    private String cachedUrl;

    @TableField("width")
    private Integer width;

    @TableField("height")
    private Integer height;

    @TableField("content_type")
    private String contentType;

    @TableField("is_primary")
    private Boolean isPrimary;

    @TableField("sort_order")
    private Integer sortOrder;

    @TableField("last_verified_at")
    private LocalDateTime lastVerifiedAt;

    @TableField("status")
    private Integer status;

    @TableLogic
    @TableField("deleted")
    private Integer deleted;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}
