package com.terraria.skills.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI terrariaOpenApi() {
        return new OpenAPI()
            .info(new Info()
                .title("TerraPedia API")
                .version("v1.0")
                .description("TerraPedia 本地开发 API，覆盖前台公开接口与管理端受保护接口。")
                .contact(new Contact().name("TerraPedia Local Dev")))
            .components(new Components()
                .addSecuritySchemes("bearerAuth", new SecurityScheme()
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("bearer")
                    .bearerFormat("JWT")
                    .description("管理端 Bearer Token，登录接口为 /api/auth/login")));
    }
}
