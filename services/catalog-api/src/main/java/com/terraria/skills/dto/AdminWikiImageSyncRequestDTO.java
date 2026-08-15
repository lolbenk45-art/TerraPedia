package com.terraria.skills.dto;

public class AdminWikiImageSyncRequestDTO {

    private Integer limit;
    private Boolean force;
    private Boolean includeItemImages;
    private Boolean includeBuffs;
    private Boolean includeBiomes;
    private Boolean includeArmorSets;
    private Boolean includeWorldContexts;

    public Integer getLimit() {
        return limit;
    }

    public void setLimit(Integer limit) {
        this.limit = limit;
    }

    public Boolean getForce() {
        return force;
    }

    public void setForce(Boolean force) {
        this.force = force;
    }

    public Boolean getIncludeItemImages() {
        return includeItemImages;
    }

    public void setIncludeItemImages(Boolean includeItemImages) {
        this.includeItemImages = includeItemImages;
    }

    public Boolean getIncludeBuffs() {
        return includeBuffs;
    }

    public void setIncludeBuffs(Boolean includeBuffs) {
        this.includeBuffs = includeBuffs;
    }

    public Boolean getIncludeBiomes() {
        return includeBiomes;
    }

    public void setIncludeBiomes(Boolean includeBiomes) {
        this.includeBiomes = includeBiomes;
    }

    public Boolean getIncludeArmorSets() {
        return includeArmorSets;
    }

    public void setIncludeArmorSets(Boolean includeArmorSets) {
        this.includeArmorSets = includeArmorSets;
    }

    public Boolean getIncludeWorldContexts() {
        return includeWorldContexts;
    }

    public void setIncludeWorldContexts(Boolean includeWorldContexts) {
        this.includeWorldContexts = includeWorldContexts;
    }
}
