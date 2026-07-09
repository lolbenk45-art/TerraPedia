# 监控与运维

本文档描述 TerraPedia（类泰拉瑞亚 Wiki）项目的监控体系与运维方案。技术栈：Astro SSG 静态站点、Cloudflare Pages、GitHub、GitHub Actions。Solo 开发者场景。

---

## 1. 监控体系总览

对于 SSG 静态站点，运维重点不在服务器（无服务器状态），而在 **可用性 + 性能 + 内容质量** 三个方面。以下表格列出监控维度、工具及说明。

| 监控维度 | 工具 | 说明 |
|----------|------|------|
| **可用性** | Cloudflare Web Analytics、UptimeRobot / Betterstack | 站点是否可访问、响应是否正常 |
| **性能** | Core Web Vitals、Lighthouse CI、GitHub Actions 构建时间 | 用户体验指标、构建效率 |
| **内容质量** | Cloudflare Analytics、Google Search Console、linkinator、CI 数据校验 | 404 监控、死链检测、数据完整性 |
| **安全** | Dependabot、GitHub Security Advisories | 依赖漏洞、安全告警 |
| **日志** | Cloudflare 请求日志、GitHub Actions 日志 | 请求追踪、构建历史 |

---

## 2. 可用性监控

### 2.1 Cloudflare Web Analytics（免费，自带）

- **启用方式**：Cloudflare Dashboard → 站点 → Analytics → Web Analytics
- **覆盖范围**：所有通过 Cloudflare 的请求
- **主要指标**：请求量、访客数、带宽、响应状态码分布
- **优势**：零配置、无 Cookie、隐私友好、与 Pages 天然集成

### 2.2 外部探活（UptimeRobot / Betterstack）

| 工具 | 免费方案 | 检查频率 | 推荐用途 |
|------|----------|----------|----------|
| **UptimeRobot** | 50 个监控项、5 分钟间隔 | 5 分钟 | 主站 + 关键页面探活 |
| **Betterstack** | 10 个监控项、3 分钟间隔 | 3 分钟 | 替代方案，支持更多通知渠道 |

### 2.3 监控页面清单

| 页面/URL | 类型 | 检查频率 | 说明 |
|----------|------|----------|------|
| `https://terra.pedia.example.com/` | 首页 | 5 分钟 | 核心入口 |
| `https://terra.pedia.example.com/items/` | 物品列表 | 5 分钟 | 高频访问 |
| `https://terra.pedia.example.com/bosses/` | Boss 列表 | 5 分钟 | 核心内容 |
| `https://terra.pedia.example.com/search` | 搜索页 | 10 分钟 | 功能页 |
| `https://terra.pedia.example.com/sitemap.xml` | Sitemap | 30 分钟 | SEO 相关 |

> **建议**：Solo 场景下 5 个监控项足够，UptimeRobot 免费 50 个可覆盖主站 + 若干关键子页。

---

## 3. 性能监控

### 3.1 Core Web Vitals 监控

| 指标 | 含义 | 目标值 | 监控方式 |
|------|------|--------|----------|
| **LCP**（Largest Contentful Paint） | 最大内容绘制时间 | < 2.5s | Lighthouse CI、PageSpeed Insights |
| **FID**（First Input Delay） | 首次输入延迟 | < 100ms | 已由 INP 替代，Lighthouse 仍可测 |
| **CLS**（Cumulative Layout Shift） | 累积布局偏移 | < 0.1 | Lighthouse CI |

**实现方式**：

- **Google Search Console**：Search Console → 体验 → 核心网页指标（需站点已接入）
- **Lighthouse CI**：每周自动跑，输出报告（见 3.2）
- **Cloudflare Web Analytics**：部分 CWV 指标可在 Pro 及以上套餐查看

### 3.2 Lighthouse CI 定期报告

```yaml
# .github/workflows/lighthouse-ci.yml
name: Lighthouse CI (Weekly)

on:
  schedule:
    - cron: '0 8 * * 1'   # 每周一 UTC 8:00（北京时间 16:00）
  workflow_dispatch:

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            https://terra.pedia.example.com/
            https://terra.pedia.example.com/items/
          uploadArtifacts: true
          temporaryPublicStorage: true
```

**产出**：每次运行生成 HTML 报告，可上传为 Artifact 或发布到 GitHub Pages。

### 3.3 构建性能监控

在 `deploy.yml` 中记录构建时间，输出到 Job Summary：

```yaml
- name: Build
  id: build
  run: |
    start=$(date +%s)
    pnpm run build
    end=$(date +%s)
    echo "build_time=$((end - start))" >> $GITHUB_OUTPUT
    echo "### 构建耗时: $((end - start)) 秒" >> $GITHUB_STEP_SUMMARY
```

**趋势观察**：通过 GitHub Actions 运行历史，手动对比每次构建时间；若需自动化，可考虑将 `build_time` 上报到外部（如 Grafana Cloud 免费层）。

---

## 4. 内容监控

### 4.1 404 监控

| 工具 | 说明 |
|------|------|
| **Cloudflare Analytics** | Dashboard → Analytics → 请求 → 按状态码筛选 404，查看 Top 404 URLs |
| **Google Search Console** | 覆盖率 → 排除 → 查看「已发现 - 当前未编入索引」中的 404 页面 |

**处理流程**：发现 404 后，判断是预期（已删除内容）还是异常（错误链接），修复或添加 redirect。

### 4.2 死链检测（linkinator）

```yaml
# .github/workflows/link-check.yml
name: Link Check (Scheduled)

on:
  schedule:
    - cron: '0 6 * * 0'   # 每周日 UTC 6:00
  workflow_dispatch:

jobs:
  link-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install linkinator
        run: npm install -g linkinator

      - name: Build site
        run: |
          npm install -g pnpm
          pnpm install --frozen-lockfile
          pnpm run build

      - name: Check links (local)
        run: |
          npx linkinator ./dist --recurse --skip "^(?!http)" --format csv
        continue-on-error: true  # 不阻断，仅报告
```

> **说明**：也可对线上 URL 跑 `linkinator https://terra.pedia.example.com --recurse`，但会触发大量请求，建议用本地 `dist` 或限制深度。

### 4.3 数据完整性定期校验

在 CI 中已有 `pnpm run validate`，通过 **Schedule 工作流** 定期跑一遍，确保数据未被破坏：

```yaml
# .github/workflows/validate-data.yml
name: Validate Data (Scheduled)

on:
  schedule:
    - cron: '0 3 * * *'   # 每天 UTC 3:00
  workflow_dispatch:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run validate
```

---

## 5. 日志

### 5.1 Cloudflare 请求日志

| 套餐 | 日志能力 | 说明 |
|------|----------|------|
| **Free** | 无 Logpush / Logpull | 仅能查看 Analytics 聚合数据，无原始请求日志 |
| **Pro** | 可配置 Logpush | 需额外配置 Worker 或 Logpush 到外部存储 |
| **Workers Paid** | 实时日志 | 若使用 Workers，可查看请求日志 |

**Solo 建议**：Free 套餐下，依赖 Cloudflare Analytics 的聚合指标 + 外部探活（UptimeRobot）即可；若需原始日志，可考虑升级或使用第三方（如 Betterstack Logs）。

### 5.2 GitHub Actions 构建日志留存

| 项目 | 默认保留 | 说明 |
|------|----------|------|
| **Workflow 运行日志** | 90 天 | Settings → Actions → General → Artifact and log retention |
| **Artifacts** | 90 天 | 可调整 1–90 天 |
| **Lighthouse 报告** | 作为 Artifact 上传 | 建议保留 30 天 |

**建议**：将关键构建指标（构建时间、失败原因）记录在 Issue 或外部文档，便于长期趋势分析。

---

## 6. 告警策略

### 6.1 告警渠道配置

| 告警类型 | 工具 | 渠道 | 配置方式 |
|----------|------|------|----------|
| 站点宕机 | UptimeRobot | 邮件、Telegram | UptimeRobot → Alert Contacts |
| 构建失败 | GitHub Actions | 邮件 | GitHub 默认，Settings → Notifications |
| 依赖安全 | Dependabot | GitHub 通知、邮件 | 启用 Dependabot alerts |

### 6.2 告警分级

| 级别 | 场景 | 响应时间 | 示例 |
|------|------|----------|------|
| **P0** | 站点完全不可用 | 立即（< 15 分钟） | 首页 5 分钟连续不可访问 |
| **P1** | 核心功能异常 | 4 小时内 | 搜索失效、关键页面 404 激增 |
| **P2** | 非关键问题 | 1 个工作日内 | 构建失败、依赖有漏洞、Lighthouse 分数下降 |

### 6.3 具体告警配置

**UptimeRobot → 邮件/Telegram**：

1. 创建 Monitor：URL + 5 分钟间隔
2. Alert Contacts：添加邮箱或 Telegram Bot（需 Bot Token + Chat ID）
3. 告警阈值：连续 2 次失败即告警

**GitHub Actions 构建失败**：

- 默认：GitHub 会向仓库 Watch 者发送邮件
- 建议：将个人邮箱加入 Watch，或使用 `actions/github-script` 在失败时创建 Issue

**Dependabot**：

- 仓库 → Security → Dependabot → Enable alerts
- 在 Settings → Notifications 中勾选「Security alerts」

---

## 7. 灾备方案

### 7.1 代码备份

| 方式 | 说明 |
|------|------|
| **GitHub 主仓库** | 天然多副本，GitHub 自身有灾备 |
| **多 Remote** | 可添加 GitLab / Gitee 为 `origin-backup`，定期 `git push origin-backup main` |

```bash
# 添加备份 remote
git remote add origin-backup https://gitlab.com/username/terra-pedia.git
git push origin-backup main
```

### 7.2 数据备份策略

TerraPedia 为静态站点，**所有数据均在 Git 仓库**（`src/data/` 下的 YAML/JSON）：

| 备份对象 | 策略 |
|----------|------|
| 源码 + 数据 | GitHub 主仓库 + 多 Remote 推送 |
| 构建产物 | 无需单独备份，每次部署可重新构建 |
| 图片/静态资源 | 若在仓库内，随 Git 备份；若用 R2/外部 CDN，需单独备份策略 |

### 7.3 部署回滚方案

参考 `07_CICD与部署.md`：

1. **Cloudflare Pages 控制台回滚**：Deployments → 选择历史版本 → Rollback
2. **Git revert + Push**：`git revert HEAD --no-edit && git push`，触发重新部署

### 7.4 RTO/RPO 目标

| 指标 | 含义 | TerraPedia 目标 |
|------|------|-----------------|
| **RTO**（Recovery Time Objective） | 从故障到恢复的时间 | < 30 分钟（控制台回滚 < 5 分钟） |
| **RPO**（Recovery Point Objective） | 可接受的数据丢失时间点 | 0（Git 每次 commit 即持久化，无数据库） |

---

## 8. 运维日历

### 8.1 每日

| 事项 | 说明 |
|------|------|
| 查看 UptimeRobot 状态 | 确认无 P0 告警（可配置每日摘要邮件） |
| 查看 GitHub 通知 | 构建失败、Dependabot 告警 |

### 8.2 每周

| 事项 | 说明 |
|------|------|
| 查看 Lighthouse CI 报告 | 性能趋势、CWV 是否达标 |
| 查看 linkinator 结果 | 死链修复 |
| 查看 Cloudflare Analytics | 流量趋势、404 分布 |
| 检查构建时间 | GitHub Actions 历史，是否有异常增长 |

### 8.3 每月

| 事项 | 说明 |
|------|------|
| 依赖更新 | `pnpm update`，处理 Dependabot PR |
| Google Search Console 检查 | 覆盖率、索引状态、手动操作 |
| 备份 remote 同步 | `git push origin-backup main`（若配置） |
| 文档与流程回顾 | 更新运维文档、告警联系人 |

### 8.4 每季度

| 事项 | 说明 |
|------|------|
| 安全与依赖审计 | `pnpm audit`，处理已知漏洞 |
| 成本与配额检查 | Cloudflare、GitHub Actions 分钟数 |
| 灾备演练 | 模拟回滚流程，验证 RTO |
| 监控与告警策略复盘 | 调整监控项、告警阈值 |

---

## 附录：快速检查清单

**上线前**：

- [ ] UptimeRobot 已配置主站 + 关键页面
- [ ] Cloudflare Web Analytics 已启用
- [ ] GitHub 邮件通知已开启（构建失败、Dependabot）
- [ ] Dependabot alerts 已启用

**定期维护**：

- [ ] 每周查看 Lighthouse 报告
- [ ] 每月同步备份 remote（若配置）
- [ ] 每季度跑一次 `pnpm audit`

---

## 附录：相关文档

- [07_CICD与部署.md](./07_CICD与部署.md) - 部署与回滚流程
- [08_安全方案.md](./08_安全方案.md) - 安全与依赖管理
