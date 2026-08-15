package com.terraria.skills.config;

import com.terraria.skills.SkillsBackApplication;
import com.terraria.skills.auth.AdminAuthProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.DriverManager;
import java.sql.DriverPropertyInfo;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Logger;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class E2eEnvironmentPostProcessorTest {

    private final ApplicationContextRunner e2eAdminPropertiesContext = new ApplicationContextRunner()
        .withPropertyValues("terraria.auth.admin.username=e2e-admin")
        .withInitializer(context -> loadE2eProperties(context.getEnvironment()))
        .withUserConfiguration(E2eAdminPropertiesConfiguration.class);

    private FakeJdbcDriver registeredDriver;

    @AfterEach
    void unregisterFakeDriver() throws SQLException {
        if (registeredDriver != null) {
            DriverManager.deregisterDriver(registeredDriver);
        }
    }

    @Test
    void shouldDoNothingWhenE2eProfileIsInactive() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("legacy");
        environment.setProperty("spring.datasource.url", "jdbc:mysql://db.example.com:3306/terria_v1_local");

        assertDoesNotThrow(() -> process(environment));
    }

    @Test
    void shouldValidateUnsafeDatasourceWhenE2eIsTheDefaultProfile() {
        MockEnvironment environment = validDefaultE2eEnvironment();
        environment.setProperty("spring.datasource.url", "jdbc:mysql://127.0.0.1:3306/terria_v1_local");

        assertPropertyFailure(environment, "spring.datasource.url");
    }

    @Test
    void shouldRejectE2eDefaultProfileCombinedWithAnotherDefaultProfile() {
        MockEnvironment environment = validDefaultE2eEnvironment();
        environment.setDefaultProfiles("e2e", "legacy");

        assertPropertyFailure(environment, "spring.profiles.default");
    }

    @Test
    void shouldRejectE2eWithAnotherActiveProfile() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setActiveProfiles("e2e", "legacy");

        assertPropertyFailure(environment, "spring.profiles.active");
    }

    @Test
    void shouldRejectE2eWithAnIncludedProfile() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("spring.profiles.include", "legacy");

        assertPropertyFailure(environment, "spring.profiles.include");
    }

    @Test
    void shouldRequireLiteralE2eEnabledValue() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("terrapedia.e2e.enabled", "TRUE");

        assertPropertyFailure(environment, "terrapedia.e2e.enabled");
    }

    @Test
    void shouldRejectOrdinaryLocalDatabase() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("spring.datasource.url", "jdbc:mysql://127.0.0.1:3306/terria_v1_local");

        assertPropertyFailure(environment, "spring.datasource.url");
    }

    @Test
    void shouldRejectDottedFlywayUrlWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "jdbc:mysql://db.internal:3306/terria_v1_local";
        environment.setProperty("spring.flyway.url", unsafeValue);

        assertPropertyFailureWithoutValue(environment, "spring.flyway.url", unsafeValue);
    }

    @Test
    void shouldRejectRelaxedEnvironmentFlywayUrlWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String propertyName = "SPRING_FLYWAY_URL";
        String unsafeValue = "jdbc:mysql://db.internal:3306/terria_v1_local";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of(propertyName, unsafeValue)
        ));

        assertPropertyFailureWithoutValue(environment, "spring.flyway.url", unsafeValue);
    }

    @Test
    void shouldRejectAlternateHikariJdbcUrl() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("spring.datasource.hikari.jdbc-url", "jdbc:mysql://db.internal:3306/terria_v1_e2e_runner_01");

        assertPropertyFailure(environment, "spring.datasource.hikari.jdbc-url");
    }

    @Test
    void shouldRejectCompactEnvironmentHikariJdbcUrlWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "jdbc:mysql://db.internal:3306/terria_v1_e2e_runner_01";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of("SPRING_DATASOURCE_HIKARI_JDBCURL", unsafeValue)
        ));

        assertPropertyFailureWithoutValue(environment, "spring.datasource.hikari.jdbc-url", unsafeValue);
    }

    @Test
    void shouldRejectCompactEnvironmentHikariDataSourceClassNameWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "com.example.RemoteDataSource";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of("SPRING_DATASOURCE_HIKARI_DATASOURCECLASSNAME", unsafeValue)
        ));

        assertPropertyFailureWithoutValue(
            environment,
            "spring.datasource.hikari.data-source-class-name",
            unsafeValue
        );
    }

    @Test
    void shouldRejectCompactEnvironmentHikariDataSourceJndiWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "java:comp/env/jdbc/remote";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of("SPRING_DATASOURCE_HIKARI_DATASOURCEJNDI", unsafeValue)
        ));

        assertPropertyFailureWithoutValue(environment, "spring.datasource.hikari.data-source-jndi", unsafeValue);
    }

    @Test
    void shouldRejectCompactEnvironmentDatasourceJndiNameWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "java:comp/env/jdbc/remote";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of("SPRING_DATASOURCE_JNDINAME", unsafeValue)
        ));

        assertPropertyFailureWithoutValue(environment, "spring.datasource.jndi-name", unsafeValue);
    }

    @Test
    void shouldRejectRelaxedEnvironmentHikariDataSourcePropertiesWithoutExposingValues() {
        MockEnvironment environment = validE2eEnvironment();
        String propertyName = "SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_URL";
        String unsafeValue = "jdbc:mysql://db.internal:3306/terria_v1_e2e_runner_01";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of(propertyName, unsafeValue)
        ));

        IllegalStateException exception = assertThrows(IllegalStateException.class, () -> process(environment));

        assertTrue(exception.getMessage().contains(propertyName));
        assertFalse(exception.getMessage().contains(unsafeValue));
    }

    @Test
    void shouldRejectCompactEnvironmentHikariDataSourcePropertiesWithoutExposingValues() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "jdbc:mysql://db.internal:3306/terria_v1_e2e_runner_01";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of("SPRING_DATASOURCE_HIKARI_DATASOURCEPROPERTIES_URL", unsafeValue)
        ));

        assertPropertyFailureWithoutValue(
            environment,
            "SPRING_DATASOURCE_HIKARI_DATASOURCEPROPERTIES_URL",
            unsafeValue
        );
    }

    @Test
    void shouldRejectNonLoopbackMysqlHost() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty(
            "spring.datasource.url",
            "jdbc:mysql://mysql.internal:3306/terria_v1_e2e_runner_01"
        );

        assertPropertyFailure(environment, "spring.datasource.url");
    }

    @Test
    void shouldRejectNonLoopbackRedisHost() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("spring.data.redis.host", "redis.internal");

        assertPropertyFailure(environment, "spring.data.redis.host");
    }

    @Test
    void shouldRejectRelaxedCurrentRedisUrlWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "redis://redis.internal:6379/0";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of("SPRING_DATA_REDIS_URL", unsafeValue)
        ));

        assertPropertyFailureWithoutValue(environment, "spring.data.redis.url", unsafeValue);
    }

    @Test
    void shouldRejectRelaxedLegacyRedisUrlWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "redis://redis.internal:6379/0";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of("SPRING_REDIS_URL", unsafeValue)
        ));

        assertPropertyFailureWithoutValue(environment, "spring.redis.url", unsafeValue);
    }

    @Test
    void shouldRejectRedissonConfigWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "singleServerConfig:\n  address: redis://redis.internal:6379";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of("SPRING_REDIS_REDISSON_CONFIG", unsafeValue)
        ));

        assertPropertyFailureWithoutValue(environment, "SPRING_REDIS_REDISSON_CONFIG", unsafeValue);
    }

    @Test
    void shouldRejectDottedCurrentRedisSentinelNodesWithoutExposingThem() {
        MockEnvironment environment = validE2eEnvironment();
        String unsafeValue = "redis.internal:26379";
        environment.setProperty("spring.data.redis.sentinel.nodes", unsafeValue);

        assertPropertyFailureWithoutValue(environment, "spring.data.redis.sentinel.nodes", unsafeValue);
    }

    @Test
    void shouldRejectRelaxedLegacyRedisClusterNodesWithoutExposingThem() {
        MockEnvironment environment = validE2eEnvironment();
        String propertyName = "SPRING_REDIS_CLUSTER_NODES";
        String unsafeValue = "redis.internal:6379";
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource(
            "e2e-test-environment",
            Map.of(propertyName, unsafeValue)
        ));

        assertPropertyFailureWithoutValue(environment, propertyName, unsafeValue);
    }

    @Test
    void shouldRejectLegacyRedisDatabaseOutsideTheE2eIsolationDatabase() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("spring.redis.database", "0");

        assertPropertyFailure(environment, "spring.redis.database");
    }

    @Test
    void shouldRejectNonLoopbackServerAddress() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("server.address", "0.0.0.0");

        assertPropertyFailure(environment, "server.address");
    }

    @Test
    void shouldRejectUnsafeRunId() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("terrapedia.e2e.run-id", "Runner_01");

        assertPropertyFailure(environment, "terrapedia.e2e.run-id");
    }

    @Test
    void shouldRejectShortRunSecretWithoutExposingIt() {
        MockEnvironment environment = validE2eEnvironment();
        String shortSecret = "short-secret";
        environment.setProperty("terrapedia.e2e.run-secret", shortSecret);

        IllegalStateException exception = assertThrows(IllegalStateException.class, () -> process(environment));

        assertTrue(exception.getMessage().contains("terrapedia.e2e.run-secret"));
        assertFalse(exception.getMessage().contains(shortSecret));
    }

    @Test
    void shouldAllowOnlyTheLoopbackE2eConfigurationContract() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setProperty("spring.datasource.url", "jdbc:mysql://localhost:3307/terria_v1_e2e_runner_01");

        assertDoesNotThrow(() -> process(environment));
        assertEquals(ConfigDataEnvironmentPostProcessor.ORDER + 1, new E2eEnvironmentPostProcessor().getOrder());
    }

    @Test
    void shouldBindAnE2eOnlyAdminPasswordWithoutOrdinaryLocalConfiguration() {
        e2eAdminPropertiesContext.run(context -> {
            assertNull(context.getStartupFailure());
            assertEquals(
                "e2e-admin-password-not-for-production",
                context.getBean(AdminAuthProperties.class).getPassword()
            );
        });
    }

    @Test
    void shouldFailUnsafeE2eConfigurationBeforeJdbcCanConnect() throws SQLException {
        registeredDriver = new FakeJdbcDriver();
        DriverManager.registerDriver(registeredDriver);

        SpringApplication application = new SpringApplication(SkillsBackApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setRegisterShutdownHook(false);

        assertThrows(
            IllegalStateException.class,
            () -> application.run(
                "--spring.profiles.active=e2e",
                "--terrapedia.e2e.enabled=true",
                "--terrapedia.e2e.run-id=runner_01",
                "--terrapedia.e2e.run-secret=0123456789abcdefghijklmn",
                "--spring.datasource.driver-class-name=" + FakeJdbcDriver.class.getName(),
                "--spring.datasource.url=jdbc:fake:unsafe"
            )
        );

        assertFalse(registeredDriver.connectCalled.get());
    }

    @Test
    void shouldFailUnsafeFlywayConfigurationBeforeJdbcCanConnect() throws SQLException {
        registeredDriver = new FakeJdbcDriver();
        DriverManager.registerDriver(registeredDriver);

        SpringApplication application = new SpringApplication(SkillsBackApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setRegisterShutdownHook(false);

        assertThrows(
            RuntimeException.class,
            () -> application.run(
                "--spring.profiles.active=e2e",
                "--terrapedia.e2e.enabled=true",
                "--terrapedia.e2e.run-id=runner_01",
                "--terrapedia.e2e.run-secret=0123456789abcdefghijklmn",
                "--terraria.auth.admin.password=e2e-admin-test-password",
                "--spring.datasource.driver-class-name=" + FakeJdbcDriver.class.getName(),
                "--spring.datasource.url=jdbc:mysql://127.0.0.1:3306/terria_v1_e2e_runner_01",
                "--spring.flyway.url=jdbc:fake:unsafe-flyway"
            )
        );

        assertFalse(registeredDriver.connectCalled.get());
    }

    private MockEnvironment validE2eEnvironment() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("e2e");
        environment.setProperty("terrapedia.e2e.enabled", "true");
        environment.setProperty("terrapedia.e2e.run-id", "runner_01");
        environment.setProperty("terrapedia.e2e.run-secret", "0123456789abcdefghijklmn");
        environment.setProperty("spring.datasource.url", "jdbc:mysql://127.0.0.1:3306/terria_v1_e2e_runner_01");
        environment.setProperty("spring.data.redis.host", "127.0.0.1");
        environment.setProperty("spring.data.redis.database", "15");
        environment.setProperty("server.address", "127.0.0.1");
        return environment;
    }

    private MockEnvironment validDefaultE2eEnvironment() {
        MockEnvironment environment = validE2eEnvironment();
        environment.setActiveProfiles();
        environment.setDefaultProfiles("e2e");
        return environment;
    }

    private void process(MockEnvironment environment) {
        new E2eEnvironmentPostProcessor().postProcessEnvironment(
            environment,
            new SpringApplication(SkillsBackApplication.class)
        );
    }

    private void loadE2eProperties(org.springframework.core.env.ConfigurableEnvironment environment) {
        try {
            new YamlPropertySourceLoader()
                .load("application-e2e", new ClassPathResource("application-e2e.yml"))
                .forEach(propertySource -> environment.getPropertySources().addLast(propertySource));
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to load application-e2e.yml", exception);
        }
    }

    private void assertPropertyFailure(MockEnvironment environment, String propertyName) {
        IllegalStateException exception = assertThrows(IllegalStateException.class, () -> process(environment));
        assertTrue(exception.getMessage().contains(propertyName));
    }

    private void assertPropertyFailureWithoutValue(
        MockEnvironment environment,
        String propertyName,
        String unsafeValue
    ) {
        IllegalStateException exception = assertThrows(IllegalStateException.class, () -> process(environment));
        assertTrue(exception.getMessage().contains(propertyName));
        assertFalse(exception.getMessage().contains(unsafeValue));
    }

    private static final class FakeJdbcDriver implements Driver {

        private final AtomicBoolean connectCalled = new AtomicBoolean();

        @Override
        public Connection connect(String url, Properties info) throws SQLException {
            connectCalled.set(true);
            throw new SQLException("Unexpected JDBC connection attempt");
        }

        @Override
        public boolean acceptsURL(String url) {
            return url != null && (url.startsWith("jdbc:fake:") || url.startsWith("jdbc:mysql://127.0.0.1:"));
        }

        @Override
        public DriverPropertyInfo[] getPropertyInfo(String url, Properties info) {
            return new DriverPropertyInfo[0];
        }

        @Override
        public int getMajorVersion() {
            return 1;
        }

        @Override
        public int getMinorVersion() {
            return 0;
        }

        @Override
        public boolean jdbcCompliant() {
            return false;
        }

        @Override
        public Logger getParentLogger() throws SQLFeatureNotSupportedException {
            throw new SQLFeatureNotSupportedException();
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AdminAuthProperties.class)
    static class E2eAdminPropertiesConfiguration {
    }
}
