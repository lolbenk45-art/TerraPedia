import { stripHtml } from '../lib/wiki-page-utils.mjs';

function toNullableText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractStatisticCell(html, label) {
  if (typeof html !== 'string' || html.trim() === '') {
    return null;
  }

  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const rowHtml of rows) {
    const headerMatch = rowHtml.match(/<th\b[\s\S]*?>([\s\S]*?)<\/th>/i);
    const cellMatch = rowHtml.match(/<td\b[\s\S]*?>([\s\S]*?)<\/td>/i);
    if (!headerMatch || !cellMatch) {
      continue;
    }
    const headerText = stripHtml(headerMatch[1]).toLowerCase();
    if (headerText !== String(label).trim().toLowerCase()) {
      continue;
    }
    return cellMatch[1];
  }

  return null;
}

export function extractItemSellStat(html) {
  const cellHtml = extractStatisticCell(html, 'Sell');
  if (!cellHtml) {
    return { sellText: null, sellValue: null };
  }

  const sortValueMatch = cellHtml.match(/data-sort-value="([^"]+)"/i);
  return {
    sellText: toNullableText(stripHtml(cellHtml)),
    sellValue: toNullableNumber(sortValueMatch?.[1] ?? null)
  };
}
