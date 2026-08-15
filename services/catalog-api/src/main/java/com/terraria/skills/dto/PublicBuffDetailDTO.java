package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Data;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicBuffDetailDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private Integer sourceId;
    private String internalName;
    private String name;
    private String nameZh;
    private String englishName;
    @JsonInclude(JsonInclude.Include.ALWAYS)
    private String imageUrl;
    private String buffType;
    private String tooltipZh;
    private String tooltipEn;
    private Integer sourceItemCount;
    private Integer inflictingNpcCount;
    private Integer immuneNpcCount;
    private List<FactSummary> sourceItems = List.of();
    private List<FactSummary> inflictingNpcs = List.of();
    private List<FactSummary> immuneNpcs = List.of();
    private Provenance provenance;
    private SourceEvidence sourceEvidence;

    @Data
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FactSummary implements Serializable {

        private static final long serialVersionUID = 1L;

        private Long id;
        private Integer sourceId;
        private String internalName;
        private String name;
        private String nameZh;
        private String imageUrl;
        private String relationType;
        private Integer durationTicks;
        private String chanceText;
        private String conditions;
        private String sourceProvider;
        private String sourcePage;
        private String sourceSection;
        private String sourceRevisionTimestamp;
    }

    @Data
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Provenance implements Serializable {

        private static final long serialVersionUID = 1L;

        private String provider;
        private String pageTitle;
        private String revisionTimestamp;
        private List<String> sectionAnchors;
    }

    @Data
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class SourceEvidence implements Serializable {

        private static final long serialVersionUID = 1L;

        private String provider;
        private String pageTitle;
        private String canonicalPageTitle;
        private Long revisionId;
        private String revisionTimestamp;
        private String parseStatus;
        private List<String> sectionAnchors;
        private List<Map<String, Object>> unresolvedFacts;
    }
}
