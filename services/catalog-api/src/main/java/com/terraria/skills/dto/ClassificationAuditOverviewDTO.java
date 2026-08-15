package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.Instant;

@Data
public class ClassificationAuditOverviewDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Instant generatedAt = Instant.now();
    private ClassificationAuditSectionDTO uncategorizedItems;
    private ClassificationAuditSectionDTO uncategorizedNpcs;
    private ClassificationAuditSectionDTO unknownDropSourceKinds;
    private ClassificationAuditSectionDTO missingReferences;
    private ClassificationAuditSectionDTO itemCategoryConflicts;
}
