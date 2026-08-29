package com.terraria.skills;

import com.terraria.skills.config.LegacyLocalBackendStartupPreflight;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.terraria.skills.mapper")
public class SkillsBackApplication {

    public static void main(String[] args) {
        new LegacyLocalBackendStartupPreflight().prepare(args);
        SpringApplication.run(SkillsBackApplication.class, args);
    }

}
