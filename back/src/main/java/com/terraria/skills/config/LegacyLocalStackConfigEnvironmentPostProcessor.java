package com.terraria.skills.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.Profiles;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public class LegacyLocalStackConfigEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String PROPERTY_SOURCE_NAME = "terrapediaLegacyLocalStackConfig";

    private static final Logger log =
        LoggerFactory.getLogger(LegacyLocalStackConfigEnvironmentPostProcessor.class);

    private static final String LOCAL_PROFILE = "legacy";
    private static final Path LOCAL_STACK_CONFIG_PATH = Path.of("scripts", "dev", "config", "local-stack.config.json");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final LegacyLocalBackendPortCleaner portCleaner;

    public LegacyLocalStackConfigEnvironmentPostProcessor() {
        this(new LegacyLocalBackendPortCleaner());
    }

    LegacyLocalStackConfigEnvironmentPostProcessor(LegacyLocalBackendPortCleaner portCleaner) {
        this.portCleaner = portCleaner;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (!isLegacyProfileActive(environment)) {
            return;
        }

        MutablePropertySources propertySources = environment.getPropertySources();
        if (propertySources.contains(PROPERTY_SOURCE_NAME)) {
            return;
        }

        ResolvedLocalConfig resolvedConfig = resolveLocalConfig();
        if (resolvedConfig == null) {
            log.info("Legacy profile active but local dev config not found at {}", LOCAL_STACK_CONFIG_PATH);
            return;
        }

        Map<String, Object> properties = loadProperties(resolvedConfig);
        if (properties.isEmpty()) {
            return;
        }

        propertySources.addLast(new MapPropertySource(PROPERTY_SOURCE_NAME, properties));
        portCleaner.releaseIfOwnedByOldBackend(resolveBackendPort(environment), resolvedConfig.repoRoot());
        log.info("Loaded legacy local dev config from {}", resolvedConfig.configPath());
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    private boolean isLegacyProfileActive(ConfigurableEnvironment environment) {
        if (environment.acceptsProfiles(Profiles.of(LOCAL_PROFILE))) {
            return true;
        }

        String configuredProfiles = environment.getProperty("spring.profiles.active");
        if (!StringUtils.hasText(configuredProfiles)) {
            return false;
        }

        for (String profile : StringUtils.commaDelimitedListToStringArray(configuredProfiles)) {
            if (LOCAL_PROFILE.equals(profile.trim())) {
                return true;
            }
        }
        return false;
    }

    private ResolvedLocalConfig resolveLocalConfig() {
        String userDir = System.getProperty("user.dir");
        Path current = StringUtils.hasText(userDir) ? Path.of(userDir).toAbsolutePath().normalize() : Path.of(".").toAbsolutePath().normalize();

        while (current != null) {
            Path candidate = current.resolve(LOCAL_STACK_CONFIG_PATH).normalize();
            if (Files.isRegularFile(candidate)) {
                return new ResolvedLocalConfig(current, candidate);
            }
            current = current.getParent();
        }
        return null;
    }

    private Map<String, Object> loadProperties(ResolvedLocalConfig resolvedConfig) {
        try {
            JsonNode root = objectMapper.readTree(resolvedConfig.configPath().toFile());
            Map<String, Object> properties = new LinkedHashMap<>();

            putNodeValueIfPresent(properties, "APP_PORT", root.path("backend").path("port"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_DB_NAME", root.path("database").path("name"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_DB_HOST", root.path("database").path("host"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_DB_PORT", root.path("database").path("port"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_DB_URL", root.path("database").path("url"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_DB_USERNAME", root.path("database").path("username"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_DB_PASSWORD", root.path("database").path("password"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_REDIS_HOST", root.path("redis").path("host"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_REDIS_PORT", root.path("redis").path("port"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_REDIS_DATABASE", root.path("redis").path("database"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_REDIS_PASSWORD", root.path("redis").path("password"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_ADMIN_USERNAME", root.path("auth").path("admin").path("username"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_ADMIN_PASSWORD", root.path("auth").path("admin").path("password"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_ADMIN_DISPLAY_NAME", root.path("auth").path("admin").path("displayName"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_AUTH_TOKEN_SECRET", root.path("auth").path("admin").path("tokenSecret"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_USER_TOKEN_SECRET", root.path("auth").path("user").path("tokenSecret"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_MINIO_ENABLED", root.path("minio").path("enabled"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_MINIO_ENDPOINT", root.path("minio").path("endpoint"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_MINIO_PUBLIC_ENDPOINT", root.path("minio").path("publicEndpoint"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_MINIO_BUCKET", root.path("minio").path("bucket"));
            putNodeValueIfPresent(properties, "TERRAPEDIA_MINIO_OBJECT_PREFIX", root.path("minio").path("objectPrefix"));
            putResolvedPathIfPresent(
                properties,
                "TERRAPEDIA_MINIO_CREDENTIALS_FILE",
                root.path("minio").path("credentialsFile"),
                resolvedConfig.repoRoot()
            );

            return properties;
        } catch (IOException exception) {
            throw new IllegalStateException(
                "Failed to read local dev config from " + resolvedConfig.configPath(),
                exception
            );
        }
    }

    private int resolveBackendPort(ConfigurableEnvironment environment) {
        String systemEnvPort = System.getenv("APP_PORT");
        if (StringUtils.hasText(systemEnvPort)) {
            return Integer.parseInt(systemEnvPort);
        }

        String systemPropertyPort = System.getProperty("APP_PORT");
        if (StringUtils.hasText(systemPropertyPort)) {
            return Integer.parseInt(systemPropertyPort);
        }

        String appPort = environment.getProperty("APP_PORT");
        if (StringUtils.hasText(appPort)) {
            return Integer.parseInt(appPort);
        }

        String serverPort = environment.getProperty("server.port");
        if (StringUtils.hasText(serverPort)) {
            return Integer.parseInt(serverPort);
        }

        return 8888;
    }

    private void putNodeValueIfPresent(Map<String, Object> properties, String key, JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return;
        }

        if (node.isTextual()) {
            String value = node.asText();
            if (StringUtils.hasText(value)) {
                properties.put(key, value);
            }
            return;
        }

        if (node.isNumber()) {
            properties.put(key, node.numberValue());
            return;
        }

        if (node.isBoolean()) {
            properties.put(key, node.booleanValue());
        }
    }

    private void putResolvedPathIfPresent(Map<String, Object> properties, String key, JsonNode node, Path repoRoot) {
        if (node == null || node.isMissingNode() || node.isNull() || !StringUtils.hasText(node.asText())) {
            return;
        }

        Path configuredPath = Path.of(node.asText());
        Path resolvedPath = configuredPath.isAbsolute()
            ? configuredPath.normalize()
            : repoRoot.resolve(configuredPath).normalize();
        properties.put(key, resolvedPath.toString());
    }

    private record ResolvedLocalConfig(Path repoRoot, Path configPath) {
    }
}
