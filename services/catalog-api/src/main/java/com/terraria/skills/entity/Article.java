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
@TableName("articles")
public class Article implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("title")
    private String title;

    @TableField("slug")
    private String slug;

    @TableField("summary")
    private String summary;

    @TableField("cover_image")
    private String coverImage;

    @TableField("content_html")
    private String contentHtml;

    @TableField("status")
    private String status;

    @TableField("review_status")
    private String reviewStatus;

    @TableField("review_comment")
    private String reviewComment;

    @TableField("reviewed_at")
    private LocalDateTime reviewedAt;

    @TableField("submitted_at")
    private LocalDateTime submittedAt;

    @TableField("reviewer_name")
    private String reviewerName;

    @TableField("published_at")
    private LocalDateTime publishedAt;

    @TableField("author_id")
    private Long authorId;

    @TableLogic
    @TableField("deleted")
    private Integer deleted;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}
