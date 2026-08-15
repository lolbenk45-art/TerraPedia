package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class PublicCoinTokenDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String unit;
    private Integer amount;
    private String label;
    private String iconUrl;
}
