package com.terraria.skills.dto;

import com.terraria.skills.common.Pagination;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Data
public class ClassificationAuditSectionDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String key;
    private String label;
    private long count;
    private Pagination pagination = new Pagination(0, 1, 20);
    private List<Map<String, Object>> rows = new ArrayList<>();
}
