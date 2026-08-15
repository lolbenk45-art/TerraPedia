package com.terraria.skills.mail;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "terraria.mail")
public class MailProperties {

    private boolean enabled = true;
    private String fromAddress;
    private String fromName = "TerraPedia";
    private String subjectPrefix = "[TerraPedia]";
}
