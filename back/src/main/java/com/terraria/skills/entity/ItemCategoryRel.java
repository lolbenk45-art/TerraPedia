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
@TableName("item_category_rel")
public class ItemCategoryRel implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("item_id")
    private Long itemId;

    @TableField("category_id")
    private Long categoryId;

    @TableField("is_primary")
    private Boolean isPrimary;

    @TableField("relation_type")
    private String relationType;

    @TableField("sort_order")
    private Integer sortOrder;

    @TableField("source_provider")
    private String sourceProvider;

    @TableField("source_page")
    private String sourcePage;

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
