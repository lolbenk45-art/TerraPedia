package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("article_comments")
public class ArticleComment implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("article_id")
    private Long articleId;

    @TableField("parent_id")
    private Long parentId;

    @TableField("root_id")
    private Long rootId;

    @TableField("author_id")
    private Long authorId;

    @TableField("reply_to_user_id")
    private Long replyToUserId;

    @TableField("content")
    private String content;

    @TableField("like_count")
    private Integer likeCount;

    @TableField("reply_count")
    private Integer replyCount;

    @TableField("status")
    private String status;

    @TableField("deleted")
    private Integer deleted;

    @TableField("deleted_by_type")
    private String deletedByType;

    @TableField("deleted_by_id")
    private Long deletedById;

    @TableField("deleted_by_name")
    private String deletedByName;

    @TableField("deleted_reason")
    private String deletedReason;

    @TableField("deleted_at")
    private LocalDateTime deletedAt;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("updated_at")
    private LocalDateTime updatedAt;
}
