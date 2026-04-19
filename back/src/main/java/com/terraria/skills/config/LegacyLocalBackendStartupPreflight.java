package com.terraria.skills.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class LegacyLocalBackendStartupPreflight {

    private static final Path LOCAL_STACK_CONFIG_PATH = Path.of("scripts", "dev", "config", "local-stack.config.json");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final LegacyLocalBackendPortCleaner portCleaner;

    public LegacyLocalBackendStartupPreflight() {
        this(new LegacyLocalBackendPortCleaner());
    }

    LegacyLocalBackendStartupPreflight(LegacyLocalBackendPortCleaner portCleaner) {
        this.portCleaner = portCleaner;
    }

    public void prepare(String[] args) {
        if (!isLegacyProfileActive(args)) {
            return;
        }

        Path repoRoot = resolveRepoRoot();
        if (repoRoot == null) {
            return;
        }

        portCleaner.releaseIfOwnedByOldBackend(resolveBackendPort(args, repoRoot), repoRoot);
    }

    private boolean isLegacyProfileActive(String[] args) {
        if (containsLegacyProfile(System.getProperty("spring.profiles.active"))) {
            return true;
        }
        if (containsLegacyProfile(System.getenv("SPRING_PROFILES_ACTIVE"))) {
            return true;
        }
        if (args == null) {
            return false;
        }

        for (String arg : args) {
            if (!StringUtils.hasText(arg)) {
                continue;
            }
            if (arg.startsWith("--spring.profiles.active=") && containsLegacyProfile(arg.substring("--spring.profiles.active=".length()))) {
                return true;
            }
        }
        return false;
    }

    private boolean containsLegacyProfile(String profiles) {
        if (!StringUtils.hasText(profiles)) {
            return false;
        }
        for (String profile : StringUtils.commaDelimitedListToStringArray(profiles)) {
            if ("legacy".equals(profile.trim())) {
                return true;
            }
        }
        return false;
    }

    private Path resolveRepoRoot() {
        String userDir = System.getProperty("user.dir");
        Path current = StringUtils.hasText(userDir) ? Path.of(userDir).toAbsolutePath().normalize() : Path.of(".").toAbsolutePath().normalize();

        while (current != null) {
            Path candidate = current.resolve(LOCAL_STACK_CONFIG_PATH).normalize();
            if (Files.isRegularFile(candidate)) {
                return current;
            }
            current = current.getParent();
        }
        return null;
    }

    private int resolveBackendPort(String[] args, Path repoRoot) {
        if (StringUtils.hasText(System.getProperty("APP_PORT"))) {
            return Integer.parseInt(System.getProperty("APP_PORT"));
        }
        if (StringUtils.hasText(System.getenv("APP_PORT"))) {
            return Integer.parseInt(System.getenv("APP_PORT"));
        }
        if (args != null) {
            for (String arg : args) {
                if (StringUtils.hasText(arg) && arg.startsWith("--server.port=")) {
                    return Integer.parseInt(arg.substring("--server.port=".length()));
                }
            }
        }

        Path configPath = repoRoot.resolve(LOCAL_STACK_CONFIG_PATH).normalize();
        try {
            JsonNode root = objectMapper.readTree(configPath.toFile());
            JsonNode backendPort = root.path("backend").path("port");
            if (!backendPort.isMissingNode() && !backendPort.isNull()) {
                return backendPort.asInt(8888);
            }
        } catch (IOException ignored) {
        }
        return 8888;
    }
}
