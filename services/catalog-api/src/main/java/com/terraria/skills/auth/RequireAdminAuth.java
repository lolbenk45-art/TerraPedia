package com.terraria.skills.auth;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 声明式管理端鉴权。标在 controller 类或方法上即强制要求有效的 admin JWT
 * (且 role 必须为 ADMIN),不依赖 AdminAuthenticationInterceptor 里的路径
 * 前缀清单——那份硬编码清单是 fail-open 的根因: 新端点漏登记就直接公开。
 *
 * 路径清单仍然保留作为兜底(防止忘了标注解的存量端点裸奔),两者取并集。
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface RequireAdminAuth {
}
