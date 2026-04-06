package com.terraria.skills.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("projectiles")
public class Projectile implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("source_id")
    private Integer sourceId;

    @TableField("internal_name")
    private String internalName;

    @TableField("name")
    private String name;

    @TableField("name_zh")
    private String nameZh;

    @TableField("ai_style")
    private Integer aiStyle;

    @TableField("damage")
    private Integer damage;

    @TableField("knock_back")
    private BigDecimal knockBack;

    @TableField("penetrate")
    private Integer penetrate;

    @TableField("time_left")
    private Integer timeLeft;

    @TableField("width")
    private Integer width;

    @TableField("height")
    private Integer height;

    @TableField("scale")
    private BigDecimal scale;

    @TableField("friendly")
    private Boolean friendly;

    @TableField("hostile")
    private Boolean hostile;

    @TableField("tile_collide")
    private Boolean tileCollide;

    @TableField("raw_json")
    private String rawJson;

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
