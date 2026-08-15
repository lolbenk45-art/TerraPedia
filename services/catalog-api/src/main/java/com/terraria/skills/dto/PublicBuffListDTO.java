package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicBuffListDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Integer sourceId;
    private String internalName;
    private String name;
    private String nameZh;
    @JsonInclude(JsonInclude.Include.ALWAYS)
    private String imageUrl;
    private String buffType;
    private String tooltipZh;
    private Integer sourceItemCount;
    private Integer immuneNpcCount;
}
