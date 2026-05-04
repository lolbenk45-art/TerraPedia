package com.terraria.skills.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Configuration
@EnableCaching
public class RedisCacheConfig {

    @Bean
    public CacheManager cacheManager(
        ObjectProvider<RedisConnectionFactory> connectionFactoryProvider,
        @Value("${terraria.cache.redis-enabled:true}") boolean redisEnabled
    ) {
        if (!redisEnabled) {
            return buildLocalCacheManager();
        }

        RedisConnectionFactory connectionFactory = connectionFactoryProvider.getIfAvailable();
        if (connectionFactory == null) {
            return buildLocalCacheManager();
        }

        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        objectMapper.activateDefaultTyping(
            BasicPolymorphicTypeValidator.builder()
                .allowIfSubType(Object.class)
                .build(),
            ObjectMapper.DefaultTyping.NON_FINAL
        );

        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .disableCachingNullValues()
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair.fromSerializer(
                    new GenericJackson2JsonRedisSerializer(objectMapper)
                )
            );

        Map<String, RedisCacheConfiguration> cacheConfigs = new HashMap<>();
        cacheConfigs.put("stats:overview", defaultConfig.entryTtl(Duration.ofMinutes(5)));
        cacheConfigs.put("item:list", defaultConfig.entryTtl(Duration.ofMinutes(3)));
        cacheConfigs.put("item:public:list", defaultConfig.entryTtl(Duration.ofMinutes(3)));
        cacheConfigs.put("item:public:detail", defaultConfig.entryTtl(Duration.ofMinutes(10)));
        cacheConfigs.put("item:public:suggestions", defaultConfig.entryTtl(Duration.ofMinutes(2)));
        cacheConfigs.put("item:detail", defaultConfig.entryTtl(Duration.ofMinutes(10)));
        cacheConfigs.put("item:suggestions", defaultConfig.entryTtl(Duration.ofMinutes(2)));
        cacheConfigs.put("item:aggregate", defaultConfig.entryTtl(Duration.ofMinutes(5)));

        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(defaultConfig)
            .withInitialCacheConfigurations(cacheConfigs)
            .build();
    }

    private CacheManager buildLocalCacheManager() {
        ConcurrentMapCacheManager cacheManager = new ConcurrentMapCacheManager(
            "stats:overview",
            "item:list",
            "item:public:list",
            "item:public:detail",
            "item:public:suggestions",
            "item:detail",
            "item:suggestions",
            "item:aggregate"
        );
        cacheManager.setAllowNullValues(false);
        return cacheManager;
    }
}
