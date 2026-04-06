package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class ItemImportResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String source;
    private int total;
    private int created;
    private int updated;
    private int skipped;
    private List<String> errors = new ArrayList<>();
}
