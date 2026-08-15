package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicBossLootOwnerDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Long gameId;
    private String internalName;
    private String name;
    private String nameZh;
    private String bossRole;
    private String displayName;
}
