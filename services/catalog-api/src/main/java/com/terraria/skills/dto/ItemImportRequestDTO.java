package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class ItemImportRequestDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String source;
    private Boolean overwriteExisting = true;
    private List<NormalizedItemImportDTO> items = new ArrayList<>();
}
