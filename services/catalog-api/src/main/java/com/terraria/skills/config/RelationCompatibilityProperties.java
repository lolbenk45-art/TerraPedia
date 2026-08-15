package com.terraria.skills.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "terraria.relation.compatibility")
public class RelationCompatibilityProperties {

    private String relationDatabase = "terria_v1_relation";
    private boolean startupCheckEnabled = false;
    private boolean failOnStartupMismatch = true;
    private int sampleLimit = 10;
}
