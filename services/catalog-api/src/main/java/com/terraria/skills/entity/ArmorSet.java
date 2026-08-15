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
@TableName("armor_sets")
public class ArmorSet implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("source_key")
    private String sourceKey;

    @TableField("text_key")
    private String textKey;

    @TableField("benefit_expression")
    private String benefitExpression;

    @TableField("primary_part")
    private String primaryPart;

    @TableField("set_count")
    private Integer setCount;

    @TableField("unique_item_count")
    private Integer uniqueItemCount;

    @TableField("sets_json")
    private String setsJson;

    @TableField("unique_item_ids_json")
    private String uniqueItemIdsJson;

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
