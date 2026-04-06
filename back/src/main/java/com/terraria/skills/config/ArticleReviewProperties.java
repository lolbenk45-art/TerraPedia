package com.terraria.skills.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "terraria.article.review")
public class ArticleReviewProperties {

    private boolean enforceStrict = false;
}
