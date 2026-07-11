package com.terraria.skills.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class E2eEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final String E2E_PROFILE = "e2e";
    private static final Pattern SAFE_RUN_ID = Pattern.compile("[a-z0-9][a-z0-9_-]{5,40}");
    private static final Pattern E2E_DATABASE_URL = Pattern.compile(
        "^jdbc:mysql://(127\\.0\\.0\\.1|localhost):(\\d{1,5})/terria_v1_e2e_([a-z0-9][a-z0-9_-]{5,40})$"
    );

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        ProfileConfiguration profiles = profileConfiguration(environment);
        if (!profiles.e2eActive()) {
            return;
        }

        rejectAdditionalProfiles(profiles);
        requireLiteralTrue(environment, "terrapedia.e2e.enabled");

        String runId = requireSafeRunId(environment);
        requireRunSecret(environment);
        requireE2eDatasourceUrl(environment, runId);
        rejectAlternateDatasourceTargets(environment);
        rejectAlternateFlywayTarget(environment);
        rejectAlternateRedisTargets(environment);
        requireLoopback(environment, "spring.data.redis.host");
        requireOptionalLoopback(environment, "spring.redis.host");
        requireExactValue(environment, "spring.data.redis.database", "15");
        requireOptionalExactValue(environment, "spring.redis.database", "15");
        requireLoopback(environment, "server.address");
    }

    @Override
    public int getOrder() {
        return ConfigDataEnvironmentPostProcessor.ORDER + 1;
    }

    private ProfileConfiguration profileConfiguration(ConfigurableEnvironment environment) {
        Set<String> activeProfiles = new LinkedHashSet<>();
        activeProfiles.addAll(Arrays.asList(environment.getActiveProfiles()));
        activeProfiles.addAll(splitProfiles(environment.getProperty("spring.profiles.active")));

        Set<String> defaultProfiles = new LinkedHashSet<>();
        defaultProfiles.addAll(Arrays.asList(environment.getDefaultProfiles()));
        defaultProfiles.addAll(splitProfiles(environment.getProperty("spring.profiles.default")));

        Set<String> includedProfiles = splitProfiles(environment.getProperty("spring.profiles.include"));
        boolean useDefaultProfiles = activeProfiles.isEmpty();
        Set<String> effectiveProfiles = useDefaultProfiles ? defaultProfiles : activeProfiles;
        boolean e2eActive = effectiveProfiles.contains(E2E_PROFILE) || includedProfiles.contains(E2E_PROFILE);
        return new ProfileConfiguration(
            e2eActive,
            useDefaultProfiles,
            activeProfiles,
            defaultProfiles,
            includedProfiles
        );
    }

    private Set<String> splitProfiles(String rawProfiles) {
        Set<String> profiles = new LinkedHashSet<>();
        if (!StringUtils.hasText(rawProfiles)) {
            return profiles;
        }

        for (String profile : StringUtils.commaDelimitedListToStringArray(rawProfiles)) {
            if (StringUtils.hasText(profile)) {
                profiles.add(profile.trim());
            }
        }
        return profiles;
    }

    private void rejectAdditionalProfiles(ProfileConfiguration profiles) {
        if (profiles.activeProfiles().stream().anyMatch(profile -> !E2E_PROFILE.equals(profile))) {
            throw unsafe("spring.profiles.active", "must contain only the e2e profile");
        }
        if (profiles.useDefaultProfiles()
            && profiles.defaultProfiles().contains(E2E_PROFILE)
            && profiles.defaultProfiles().stream().anyMatch(profile -> !E2E_PROFILE.equals(profile))) {
            throw unsafe("spring.profiles.default", "must contain only the e2e profile");
        }
        if (profiles.includedProfiles().stream().anyMatch(profile -> !E2E_PROFILE.equals(profile))) {
            throw unsafe("spring.profiles.include", "must not include a non-e2e profile");
        }
    }

    private void requireLiteralTrue(ConfigurableEnvironment environment, String propertyName) {
        if (!"true".equals(environment.getProperty(propertyName))) {
            throw unsafe(propertyName, "must be the literal value true");
        }
    }

    private String requireSafeRunId(ConfigurableEnvironment environment) {
        String runId = environment.getProperty("terrapedia.e2e.run-id");
        if (runId == null || !SAFE_RUN_ID.matcher(runId).matches()) {
            throw unsafe("terrapedia.e2e.run-id", "must be a safe E2E run identifier");
        }
        return runId;
    }

    private void requireRunSecret(ConfigurableEnvironment environment) {
        String runSecret = environment.getProperty("terrapedia.e2e.run-secret");
        if (!StringUtils.hasText(runSecret) || runSecret.length() < 24) {
            throw unsafe("terrapedia.e2e.run-secret", "must be at least 24 characters");
        }
    }

    private void requireE2eDatasourceUrl(ConfigurableEnvironment environment, String runId) {
        String datasourceUrl = environment.getProperty("spring.datasource.url");
        Matcher matcher = datasourceUrl == null ? null : E2E_DATABASE_URL.matcher(datasourceUrl);
        if (matcher == null || !matcher.matches()) {
            throw unsafe("spring.datasource.url", "must be a loopback E2E MySQL database URL");
        }

        int port = Integer.parseInt(matcher.group(2));
        if (port < 1 || port > 65535 || !runId.equals(matcher.group(3))) {
            throw unsafe("spring.datasource.url", "must match the current E2E run identifier");
        }
    }

    private void rejectAlternateDatasourceTargets(ConfigurableEnvironment environment) {
        String requirement = "must not override the guarded datasource URL";
        rejectConfiguredProperty(environment, "spring.datasource.hikari.jdbc-url", requirement);
        rejectConfiguredProperty(environment, "spring.datasource.hikari.data-source-class-name", requirement);
        rejectConfiguredProperty(environment, "spring.datasource.hikari.data-source-jndi", requirement);
        rejectConfiguredProperty(environment, "spring.datasource.jndi-name", requirement);
        rejectConfiguredProperty(environment, "spring.datasource.type", requirement);
        rejectPropertiesWithPrefix(environment, "spring.datasource.hikari.data-source-properties.", requirement);
    }

    private void rejectAlternateFlywayTarget(ConfigurableEnvironment environment) {
        rejectConfiguredProperty(environment, "spring.flyway.url", "must not configure an alternate Flyway target");
    }

    private void rejectAlternateRedisTargets(ConfigurableEnvironment environment) {
        String requirement = "must not configure an alternate Redis target";
        rejectConfiguredProperty(environment, "spring.data.redis.url", requirement);
        rejectConfiguredProperty(environment, "spring.redis.url", requirement);
        rejectPropertiesWithPrefix(environment, "spring.data.redis.sentinel.", requirement);
        rejectPropertiesWithPrefix(environment, "spring.data.redis.cluster.", requirement);
        rejectPropertiesWithPrefix(environment, "spring.redis.sentinel.", requirement);
        rejectPropertiesWithPrefix(environment, "spring.redis.cluster.", requirement);
        rejectPropertiesWithPrefix(environment, "spring.redis.redisson.", requirement);
        rejectPropertiesWithPrefix(environment, "spring.data.redis.redisson.", requirement);
    }

    private void rejectConfiguredProperty(
        ConfigurableEnvironment environment,
        String propertyName,
        String requirement
    ) {
        if (isConfiguredProperty(environment, propertyName)) {
            throw unsafe(propertyName, requirement);
        }
    }

    private boolean isConfiguredProperty(ConfigurableEnvironment environment, String propertyName) {
        if (StringUtils.hasText(environment.getProperty(propertyName))) {
            return true;
        }

        String compactPropertyName = compactPropertyName(propertyName);
        for (PropertySource<?> propertySource : environment.getPropertySources()) {
            if (!(propertySource instanceof EnumerablePropertySource<?> enumerablePropertySource)) {
                continue;
            }
            for (String configuredPropertyName : enumerablePropertySource.getPropertyNames()) {
                if (compactPropertyName(configuredPropertyName).equals(compactPropertyName)
                    && hasTextValue(propertySource.getProperty(configuredPropertyName))) {
                    return true;
                }
            }
        }
        return false;
    }

    private void rejectPropertiesWithPrefix(
        ConfigurableEnvironment environment,
        String propertyPrefix,
        String requirement
    ) {
        String normalizedPrefix = normalizePropertyName(propertyPrefix);
        String compactPrefix = compactPropertyName(propertyPrefix);
        for (PropertySource<?> propertySource : environment.getPropertySources()) {
            if (!(propertySource instanceof EnumerablePropertySource<?> enumerablePropertySource)) {
                continue;
            }
            for (String propertyName : enumerablePropertySource.getPropertyNames()) {
                if (matchesPropertyPrefix(propertyName, normalizedPrefix, compactPrefix)) {
                    throw unsafe(propertyName, requirement);
                }
            }
        }
    }

    private boolean matchesPropertyPrefix(String propertyName, String normalizedPrefix, String compactPrefix) {
        String normalizedName = normalizePropertyName(propertyName);
        if (normalizedName.equals(normalizedPrefix) || normalizedName.startsWith(normalizedPrefix + ".")) {
            return true;
        }

        String compactName = compactPropertyName(propertyName);
        return compactName.equals(compactPrefix)
            || (compactName.startsWith(compactPrefix) && hasSeparatorAfterCompactPrefix(propertyName, compactPrefix.length()));
    }

    private String normalizePropertyName(String propertyName) {
        StringBuilder normalized = new StringBuilder();
        boolean separatorPending = false;
        for (int index = 0; index < propertyName.length(); index++) {
            char character = propertyName.charAt(index);
            if (Character.isLetterOrDigit(character)) {
                if (separatorPending && !normalized.isEmpty()) {
                    normalized.append('.');
                }
                normalized.append(Character.toLowerCase(character));
                separatorPending = false;
            } else {
                separatorPending = true;
            }
        }
        return normalized.toString();
    }

    private String compactPropertyName(String propertyName) {
        StringBuilder compact = new StringBuilder();
        for (int index = 0; index < propertyName.length(); index++) {
            char character = propertyName.charAt(index);
            if (Character.isLetterOrDigit(character)) {
                compact.append(Character.toLowerCase(character));
            }
        }
        return compact.toString();
    }

    private boolean hasSeparatorAfterCompactPrefix(String propertyName, int compactPrefixLength) {
        int compactLength = 0;
        for (int index = 0; index < propertyName.length(); index++) {
            if (Character.isLetterOrDigit(propertyName.charAt(index))) {
                compactLength++;
                if (compactLength == compactPrefixLength) {
                    return index + 1 < propertyName.length()
                        && !Character.isLetterOrDigit(propertyName.charAt(index + 1));
                }
            }
        }
        return false;
    }

    private boolean hasTextValue(Object value) {
        return value != null && StringUtils.hasText(value.toString());
    }

    private void requireExactValue(ConfigurableEnvironment environment, String propertyName, String expected) {
        if (!expected.equals(environment.getProperty(propertyName))) {
            throw unsafe(propertyName, "must be " + expected);
        }
    }

    private void requireOptionalExactValue(ConfigurableEnvironment environment, String propertyName, String expected) {
        String value = environment.getProperty(propertyName);
        if (StringUtils.hasText(value) && !expected.equals(value)) {
            throw unsafe(propertyName, "must be " + expected);
        }
    }

    private void requireLoopback(ConfigurableEnvironment environment, String propertyName) {
        String host = environment.getProperty(propertyName);
        if (!isLoopback(host)) {
            throw unsafe(propertyName, "must use a loopback address");
        }
    }

    private void requireOptionalLoopback(ConfigurableEnvironment environment, String propertyName) {
        String host = environment.getProperty(propertyName);
        if (StringUtils.hasText(host) && !isLoopback(host)) {
            throw unsafe(propertyName, "must use a loopback address");
        }
    }

    private boolean isLoopback(String host) {
        return "127.0.0.1".equals(host) || "localhost".equals(host) || "::1".equals(host);
    }

    private IllegalStateException unsafe(String propertyName, String requirement) {
        return new IllegalStateException("Unsafe E2E configuration: " + propertyName + " " + requirement);
    }

    private record ProfileConfiguration(
        boolean e2eActive,
        boolean useDefaultProfiles,
        Set<String> activeProfiles,
        Set<String> defaultProfiles,
        Set<String> includedProfiles
    ) {
    }
}
