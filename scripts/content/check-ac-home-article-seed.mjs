#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const failures = [];

const sqlSeedPath = path.join(repoRoot, 'back/src/main/resources/db/migration/V55__seed_ac_home_original_articles.sql');
const dataPath = path.join(repoRoot, 'scripts/content/ac-home-articles.mjs');
const seedPath = path.join(repoRoot, 'scripts/content/seed-ac-home-articles.mjs');
const homeDataPath = path.join(repoRoot, 'front-nuxt/composables/useHomeData.ts');

const expectedSlugs = [
  'ac-home-starting-route-2026-06-08',
  'ac-home-gear-foundation-route-2026-06-08',
  'ac-home-hardmode-first-hour-mining-2026-06-08',
  'ac-home-biome-exploration-route-2026-06-08',
  'ac-home-event-workshop-route-2026-06-08',
  'ac-home-boss-prep-route-2026-06-08',
  'ac-home-underworld-checklist-2026-06-08',
  'ac-home-mobility-upgrade-route-2026-06-08',
  'ac-home-resource-loop-fishing-2026-06-08',
  'ac-home-meteorite-planning-2026-06-08',
];

if (existsSync(sqlSeedPath)) {
  failures.push('AC home articles must not be maintained by Flyway SQL seed V55__seed_ac_home_original_articles.sql');
}

if (!existsSync(dataPath)) {
  failures.push('Missing scripts/content/ac-home-articles.mjs rich content source');
}

if (!existsSync(seedPath)) {
  failures.push('Missing scripts/content/seed-ac-home-articles.mjs admin API upsert script');
} else {
  const seedSource = readFileSync(seedPath, 'utf8');
  for (const marker of [
    'resolveBackendApiBase',
    'resolveAdminAuth',
    '/auth/login',
    '/admin/articles',
    '/status',
    'Authorization',
    'Bearer',
  ]) {
    if (!seedSource.includes(marker)) {
      failures.push(`seed-ac-home-articles.mjs must use admin API marker ${marker}`);
    }
  }

  for (const forbidden of [
    /\bmysql\b/i,
    /\bmysql2\b/i,
    /\bINSERT\s+INTO\s+`?articles`?/i,
    /\bUPDATE\s+`?articles`?\b/i,
    /V55__seed_ac_home_original_articles/i,
  ]) {
    if (forbidden.test(seedSource)) {
      failures.push(`seed-ac-home-articles.mjs must not use raw DB or SQL marker ${forbidden}`);
    }
  }
}

if (existsSync(dataPath)) {
  const moduleUrl = pathToFileURL(dataPath).href;
  const { acHomeArticles } = await import(`${moduleUrl}?check=${Date.now()}`);
  if (!Array.isArray(acHomeArticles)) {
    failures.push('ac-home-articles.mjs must export acHomeArticles array');
  } else {
    const slugs = acHomeArticles.map(article => String(article?.slug || '').trim());
    const slugSet = new Set(slugs);
    if (slugs.length !== expectedSlugs.length || slugSet.size !== expectedSlugs.length) {
      failures.push(`acHomeArticles must contain ${expectedSlugs.length} unique homepage articles`);
    }

    for (const slug of expectedSlugs) {
      if (!slugSet.has(slug)) {
        failures.push(`acHomeArticles missing homepage slug ${slug}`);
      }
    }

    const allContent = acHomeArticles.map(article => String(article?.contentHtml || '')).join('\n');
    const refMatches = [...allContent.matchAll(/class="tp-content-ref"[^>]*data-tp-ref-type="(item|npc|boss)"[^>]*data-tp-ref-id="\d+"[^>]*data-tp-ref-label="[^"]+"/g)];
    if (refMatches.length < expectedSlugs.length * 2) {
      failures.push('AC home article bodies must contain at least two item/npc/boss content references per article on average');
    }

    for (const type of ['item', 'npc', 'boss']) {
      if (!refMatches.some(match => match[1] === type)) {
        failures.push(`AC home article bodies must include ${type} content references`);
      }
    }

    if (!allContent.includes('class="tp-article-embed tp-recipe-tree"')) {
      failures.push('AC home article bodies must include at least one recipe-tree embed');
    }

    for (const article of acHomeArticles) {
      const slug = String(article?.slug || '').trim();
      const content = String(article?.contentHtml || '');
      const title = String(article?.title || '').trim();
      const summary = String(article?.summary || '').trim();
      const coverImage = String(article?.coverImage || '').trim();
      if (!title || !summary || !content) {
        failures.push(`${slug || '(missing slug)'} must define title, summary and contentHtml`);
      }
      if (!coverImage) {
        failures.push(`${slug} must define coverImage`);
      } else if (!coverImage.startsWith('/preview-assets/terrapedia-images/') && !coverImage.includes('/terrapedia-images/')) {
        failures.push(`${slug} coverImage must use a TerraPedia managed image path`);
      }
      const articleRefCount = (content.match(/class="tp-content-ref"/g) || []).length;
      if (articleRefCount < 2) {
        failures.push(`${slug} must contain at least two content references`);
      }
      if (content.includes('<script') || content.includes(' onclick=')) {
        failures.push(`${slug} must not contain unsafe inline script markup`);
      }
    }
  }
}

if (!existsSync(homeDataPath)) {
  failures.push('Missing front-nuxt/composables/useHomeData.ts');
} else {
  const homeData = readFileSync(homeDataPath, 'utf8');
  for (const slug of expectedSlugs) {
    if (!homeData.includes(`/articles/${slug}`)) {
      failures.push(`homepage data must link to /articles/${slug}`);
    }
  }
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`AC home article seed contract passed for ${expectedSlugs.length} API-managed rich articles.`);
