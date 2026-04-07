#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const USER_AGENT = 'TerraPedia-item-categories/1.0';
const API_URL = 'https://terraria.wiki.gg/api.php';
const repoRoot = process.cwd();
const generatedAt = new Date().toISOString();
const dateTag = generatedAt.slice(0, 10);

const outputJsonPath = path.join(repoRoot, 'data', 'generated', 'wiki-item-categories.latest.json');
const outputMdPath = path.join(repoRoot, 'reports', `wiki-item-categories-summary-${dateTag}.md`);

const TEMPLATE_DEFINITIONS = [
  { title: 'Template:Master Template Tiles', topLevel: 'Tiles' },
  { title: 'Template:Master Template Weapons', topLevel: 'Weapons' },
  { title: 'Template:Master Template Tools', topLevel: 'Tools' },
  { title: 'Template:Master Template Consumables', topLevel: 'Consumables' },
  { title: 'Template:Master Template Furniture', topLevel: 'Furniture' },
  { title: 'Template:Master Template Equipables', topLevel: 'Equipables' },
];

const templates = [];
for (const definition of TEMPLATE_DEFINITIONS) {
  const revision = await fetchRevision(definition.title);
  const renderedHtml = await fetchRenderedHtml(definition.title);
  const sections = parseTemplateSections(renderedHtml);
  templates.push(buildTemplateRecord(definition, revision, renderedHtml, sections));
}

const summary = summarizeTemplates(templates);
const payload = {
  entity: 'wiki_item_categories',
  generatedAt,
  schemaVersion: '1.0.0',
  sourceApi: API_URL,
  templates,
  summary,
};

fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
fs.mkdirSync(path.dirname(outputMdPath), { recursive: true });
fs.writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
fs.writeFileSync(outputMdPath, buildMarkdownReport(payload), 'utf8');

console.log(JSON.stringify({
  outputJsonPath,
  outputMdPath,
  summary,
}, null, 2));

async function fetchRevision(title) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('titles', title);
  url.searchParams.set('rvprop', 'timestamp|ids');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  const json = await fetchJson(url);
  const page = json?.query?.pages?.[0] ?? {};
  const revision = page?.revisions?.[0] ?? {};
  return {
    pageId: page?.pageid ?? null,
    pageTitle: page?.title ?? title,
    revisionId: revision?.revid ?? null,
    revisionTimestamp: revision?.timestamp ?? null,
  };
}

async function fetchRenderedHtml(title) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', title);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  const json = await fetchJson(url);
  const text = String(json?.parse?.text ?? '');
  if (!text.trim()) {
    throw new Error(`Rendered HTML is empty for ${title}`);
  }
  return text;
}

async function fetchJson(url) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === 6) {
        throw error;
      }
      await sleep(Math.min(attempt * 1000, 4000));
    }
  }
  throw new Error('fetchJson exhausted retries');
}

function parseTemplateSections(html) {
  const navBox = findFirstBlockByClass(html, 'div', 'ranger-navbox');
  const rootSections = navBox
    ? extractDirectChildBlocks(navBox, 'div').filter(block => hasClass(block, 'ranger-section'))
    : [];
  return rootSections
    .map(parseSectionBlock)
    .filter(section => section.title);
}

function parseSectionBlock(sectionBlock) {
  const titleBlock = findFirstBlockByClass(sectionBlock, 'div', 'ranger-header-text');
  const bodyBlock = findDirectChildBlockByClass(sectionBlock, 'div', 'ranger-section-body');
  const title = normalizeText(stripTags(titleBlock ?? ''));
  const rows = bodyBlock
    ? extractDirectChildBlocks(bodyBlock, 'div')
      .filter(block => hasClass(block, 'ranger-row'))
      .map(parseRowBlock)
      .filter(row => row.group || row.items.length > 0 || row.subSections.length > 0)
    : [];

  return {
    title,
    rowCount: rows.length,
    itemCount: countSectionItems(rows),
    rows,
  };
}

function parseRowBlock(rowBlock) {
  const groupBlock = findDirectChildBlockByClass(rowBlock, 'div', 'ranger-group');
  const listBoxBlock = findDirectChildBlockByClass(rowBlock, 'div', 'ranger-listbox');
  const groupWrap = groupBlock ? findFirstBlockByClass(groupBlock, 'div', 'ranger-wrap') : null;
  const group = normalizeText(stripTags(groupWrap ?? ''));

  let items = [];
  let subSections = [];
  if (listBoxBlock) {
    for (const child of extractDirectChildBlocks(listBoxBlock, 'div')) {
      if (hasClass(child, 'ranger-wrap')) {
        const listBlock = findFirstBlockByClass(child, 'div', 'ranger-list');
        if (listBlock) {
          items = items.concat(parseListBlock(listBlock));
        }
      } else if (hasClass(child, 'ranger-sublist')) {
        subSections = subSections.concat(
          extractDirectChildBlocks(child, 'div')
            .filter(block => hasClass(block, 'ranger-section'))
            .map(parseSectionBlock)
            .filter(section => section.title)
        );
      }
    }
  }

  return {
    group,
    itemCount: countItems(items) + subSections.reduce((sum, section) => sum + section.itemCount, 0),
    items,
    subSections,
  };
}

function parseListBlock(listBlock) {
  const directUls = extractDirectChildBlocks(listBlock, 'ul');
  const source = directUls[0] ?? listBlock;
  return extractDirectChildBlocks(source, 'li')
    .map(parseListItemBlock)
    .filter(item => item.name);
}

function parseListItemBlock(liBlock) {
  const inner = getInnerHtml(liBlock, 'li');
  const directChildren = extractDirectChildBlocks(liBlock, 'ul')
    .flatMap(ulBlock => extractDirectChildBlocks(ulBlock, 'li').map(parseListItemBlock))
    .filter(item => item.name);

  const nestedUlStarts = findDirectChildTagStarts(inner, 'ul');
  const mainHtml = nestedUlStarts.length > 0 ? inner.slice(0, nestedUlStarts[0]) : inner;
  const link = extractFirstWikiLink(mainHtml);
  const fallbackName = normalizeText(stripTags(mainHtml));
  const href = link?.href ?? null;
  const name = normalizeText(link?.text ?? fallbackName);

  return {
    name,
    href: normalizeWikiHref(href),
    itemCount: 1 + directChildren.reduce((sum, child) => sum + child.itemCount, 0),
    children: directChildren,
  };
}

function buildTemplateRecord(definition, revision, renderedHtml, sections) {
  return {
    topLevel: definition.topLevel,
    templateTitle: definition.title,
    sourcePageId: revision.pageId,
    sourceRevisionId: revision.revisionId,
    sourceRevisionTimestamp: revision.revisionTimestamp,
    renderedHtmlLength: renderedHtml.length,
    sectionCount: sections.length,
    itemCount: sections.reduce((sum, section) => sum + section.itemCount, 0),
    sections,
  };
}

function summarizeTemplates(templates) {
  const totalSections = templates.reduce((sum, template) => sum + template.sectionCount, 0);
  const totalItems = templates.reduce((sum, template) => sum + template.itemCount, 0);
  const topSections = templates.flatMap(template =>
    template.sections.map(section => ({
      topLevel: template.topLevel,
      section: section.title,
      itemCount: section.itemCount,
    }))
  ).sort((a, b) => b.itemCount - a.itemCount || a.section.localeCompare(b.section));

  return {
    templateCount: templates.length,
    totalSections,
    totalItems,
    largestSections: topSections.slice(0, 20),
  };
}

function buildMarkdownReport(payload) {
  const lines = [];
  lines.push('# Wiki 物品分类抓取汇总');
  lines.push('');
  lines.push(`- 生成时间: \`${payload.generatedAt}\``);
  lines.push(`- 来源 API: \`${payload.sourceApi}\``);
  lines.push(`- 模板数: \`${payload.summary.templateCount}\``);
  lines.push(`- 一级分区数: \`${payload.summary.totalSections}\``);
  lines.push(`- 抽取到的物品链接节点数: \`${payload.summary.totalItems}\``);
  lines.push(`- JSON 输出: \`${toRepoRelative(outputJsonPath)}\``);
  lines.push('');
  lines.push('## 最大分类');
  lines.push('');
  for (const section of payload.summary.largestSections.slice(0, 10)) {
    lines.push(`- ${section.topLevel} / ${section.section}: ${section.itemCount}`);
  }

  for (const template of payload.templates) {
    lines.push('');
    lines.push(`## ${template.topLevel}`);
    lines.push('');
    lines.push(`- 模板: \`${template.templateTitle}\``);
    lines.push(`- 源修订时间: \`${template.sourceRevisionTimestamp ?? 'unknown'}\``);
    lines.push(`- 分区数: \`${template.sectionCount}\``);
    lines.push(`- 物品链接节点数: \`${template.itemCount}\``);

    for (const section of template.sections) {
      lines.push('');
      lines.push(`### ${section.title}`);
      lines.push('');
      lines.push(`- 行分组数: \`${section.rowCount}\``);
      lines.push(`- 物品链接节点数: \`${section.itemCount}\``);
      const nonEmptyRows = section.rows.filter(row => row.group || row.itemCount > 0);
      for (const row of nonEmptyRows.slice(0, 12)) {
        const label = row.group || '(未命名分组)';
        const preview = row.items.slice(0, 6).map(item => item.name).filter(Boolean).join(', ');
        lines.push(`- ${label}: ${row.itemCount}${preview ? ` | 例: ${preview}` : ''}`);
        for (const subSection of row.subSections.slice(0, 6)) {
          const subPreview = subSection.rows
            .flatMap(subRow => subRow.items)
            .slice(0, 6)
            .map(item => item.name)
            .filter(Boolean)
            .join(', ');
          lines.push(`- ${label} / ${subSection.title}: ${subSection.itemCount}${subPreview ? ` | 例: ${subPreview}` : ''}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('## 说明');
  lines.push('');
  lines.push('- 这里抓的是 Wiki `Items` 页面底部使用的 `Master Template *` 导航模板。');
  lines.push('- `itemCount` 统计的是分类树中的物品链接节点数，不等于去重后的物品总数。');
  lines.push('- 某些物品会在多个分类节点下重复出现。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function countSectionItems(rows) {
  return rows.reduce((sum, row) => sum + row.itemCount, 0);
}

function countItems(items) {
  return items.reduce((sum, item) => sum + item.itemCount, 0);
}

function toRepoRelative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function extractTopLevelBlocks(html, tagName) {
  const blocks = [];
  const starts = findDirectChildTagStarts(html, tagName);
  for (const start of starts) {
    blocks.push(extractTagBlock(html, tagName, start));
  }
  return blocks;
}

function extractDirectChildBlocks(block, tagName) {
  return extractTopLevelBlocks(getInnerHtml(block, getTagName(block)), tagName);
}

function findDirectChildBlockByClass(block, tagName, className) {
  return extractDirectChildBlocks(block, tagName).find(child => hasClass(child, className)) ?? null;
}

function findFirstBlockByClass(block, tagName, className) {
  const openTagRegex = new RegExp(`<${tagName}\\b[^>]*class=\"[^\"]*${escapeRegExp(className)}[^\"]*\"[^>]*>`, 'i');
  const match = openTagRegex.exec(block);
  if (!match) return null;
  return extractTagBlock(block, tagName, match.index);
}

function hasClass(block, className) {
  const openingTag = getOpeningTag(block);
  const classValue = getAttribute(openingTag, 'class');
  if (!classValue) return false;
  return classValue.split(/\s+/).includes(className);
}

function findDirectChildTagStarts(html, tagName) {
  const starts = [];
  let depth = 0;
  let index = 0;
  while (index < html.length) {
    const nextOpen = html.indexOf(`<${tagName}`, index);
    const nextClose = html.indexOf(`</${tagName}>`, index);
    if (nextOpen === -1 && nextClose === -1) break;

    if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
      if (depth === 0) {
        starts.push(nextOpen);
      }
      depth += 1;
      index = html.indexOf('>', nextOpen);
      if (index === -1) break;
      index += 1;
      continue;
    }

    if (nextClose !== -1) {
      depth = Math.max(0, depth - 1);
      index = nextClose + tagName.length + 3;
    }
  }
  return starts;
}

function extractTagBlock(html, tagName, startIndex) {
  let depth = 0;
  let index = startIndex;
  while (index < html.length) {
    const nextOpen = html.indexOf(`<${tagName}`, index);
    const nextClose = html.indexOf(`</${tagName}>`, index);

    if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
      depth += 1;
      index = html.indexOf('>', nextOpen);
      if (index === -1) break;
      index += 1;
      continue;
    }

    if (nextClose !== -1) {
      depth -= 1;
      index = nextClose + tagName.length + 3;
      if (depth === 0) {
        return html.slice(startIndex, index);
      }
      continue;
    }

    break;
  }
  return html.slice(startIndex);
}

function getOpeningTag(block) {
  const end = block.indexOf('>');
  return end >= 0 ? block.slice(0, end + 1) : block;
}

function getTagName(block) {
  const match = /^<([a-z0-9]+)/i.exec(block.trim());
  return match?.[1]?.toLowerCase() ?? 'div';
}

function getInnerHtml(block, tagName) {
  const openingEnd = block.indexOf('>');
  const closingTag = `</${tagName}>`;
  const closingStart = block.lastIndexOf(closingTag);
  if (openingEnd < 0 || closingStart < 0 || closingStart <= openingEnd) {
    return '';
  }
  return block.slice(openingEnd + 1, closingStart);
}

function getAttribute(openingTag, attributeName) {
  const regex = new RegExp(`${attributeName}=\"([^\"]*)\"`, 'i');
  const match = regex.exec(openingTag);
  return match?.[1] ?? null;
}

function extractFirstWikiLink(html) {
  const match = /<a\b[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
  if (!match) return null;
  return {
    href: match[1],
    text: stripTags(match[2]),
  };
}

function normalizeWikiHref(href) {
  if (!href) return null;
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('/')) return `https://terraria.wiki.gg${href}`;
  return href;
}

function stripTags(html) {
  return decodeHtmlEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
