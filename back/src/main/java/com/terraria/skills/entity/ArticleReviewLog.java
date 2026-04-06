package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("article_review_log")
public class ArticleReviewLog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("article_id")
    private Long articleId;

    @TableField("action")
    private String action;

    @TableField("from_review_status")
    private String fromReviewStatus;

    @TableField("to_review_status")
    private String toReviewStatus;

    @TableField("comment")
    private String comment;

    @TableField("reviewer_name")
    private String reviewerName;

    @TableField("created_at")
    private LocalDateTime createdAt;
}
