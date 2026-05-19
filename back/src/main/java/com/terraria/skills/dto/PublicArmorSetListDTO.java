package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicArmorSetListDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String textKey;
    private String sourceKey;
    private String name;
    private String nameZh;
    private String nameEn;
    private String primaryPart;
    private Integer setCount;
    private Integer uniqueItemCount;
    private List<String> maleImages = new ArrayList<>();
    private List<String> femaleImages = new ArrayList<>();
    private List<String> specialImages = new ArrayList<>();
    private List<String> fallbackImages = new ArrayList<>();
}
