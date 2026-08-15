package com.terraria.skills.security;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "terraria.security.http-rate-limit")
public class HttpRateLimitProperties {

    private boolean enabled = true;
    private Tier publicRead = new Tier(120, 60);
    private Tier auth = new Tier(20, 60);
    private Tier userWrite = new Tier(60, 60);
    private Tier upload = new Tier(20, 60);
    private Tier adminWrite = new Tier(80, 60);

    @Data
    public static class Tier {
        private int requests;
        private long windowSeconds;

        public Tier() {
        }

        public Tier(int requests, long windowSeconds) {
            this.requests = requests;
            this.windowSeconds = windowSeconds;
        }
    }
}
