package com.terraria.skills.security;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@Data
@ConfigurationProperties(prefix = "terraria.security.network")
public class SecurityNetworkProperties {

    private List<String> trustedProxies = new ArrayList<>();
    private boolean trustLoopbackProxies = true;
    private boolean httpAuditEnabled = true;
}
