package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BossMechanicNoteDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String kind;
    private String title;
    private String description;
    private String sourceText;
    private Double confidence;
    private Boolean derived;
}
