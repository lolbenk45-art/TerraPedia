package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class PublicNpcMoneyDropDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String mode;
    private String label;
    private List<PublicCoinTokenDTO> tokens = new ArrayList<>();
}
