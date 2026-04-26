#!/usr/bin/env node

import { createRequire } from 'node:module';

import { fetchWikiPagePayload, parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { extractItemSellStat } from './item-page-statistics-parser.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

export function buildMaintItemPageRefreshUpdate({
  existingRow,
  payload,
  sellStat,
}) {
  const acceptedSell = shouldAcceptSellRefresh({
    itemName: existingRow.item_name ?? existingRow.item_internal_name ?? null,
    pageTitle: payload.pageTitle ?? existingRow.page_title ?? null,
    sellText: sellStat.sellText ?? null,
    sellValue: sellStat.sellValue ?? null,
  }) ? sellStat : { sellText: null, sellValue: null };

  return {
    pageTitle: payload.pageTitle ?? existingRow.page_title ?? null,
    sourceRevisionTimestamp: payload.revisionTimestamp ?? null,
    wikitext: payload.wikitext ?? null,
    html: payload.html ?? null,
    sellText: acceptedSell.sellText ?? null,
    sellValue: acceptedSell.sellValue ?? null,
    rawJson: {
      ...payload,
      itemInternalName: existingRow.item_internal_name ?? null,
      itemName: existingRow.item_name ?? null,
      entityType: 'item',
    },
  };
}

export function shouldAcceptSellRefresh({
  itemName,
  pageTitle,
  sellText,
  sellValue,
}) {
  if (sellValue == null) {
    return false;
  }

  const normalizedTitle = String(pageTitle ?? '').trim().toLowerCase();
  const normalizedSellText = String(sellText ?? '').trim().toLowerCase();
  const normalizedItemName = String(itemName ?? '').trim().toLowerCase();

  if (!normalizedTitle) {
    return false;
  }

  if (normalizedSellText.includes('(set)')) {
    return false;
  }

  if (normalizedTitle.includes(' armor')) {
    return false;
  }

  if (normalizedTitle.endsWith(' set')) {
    return false;
  }

  if (normalizedItemName && normalizedTitle === normalizedItemName) {
    return true;
  }

  return true;
}

function toMysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function run() {
  const args = parseCliArgs(process.argv.slice(2));
  const apply = args.apply === true || args.apply === 'true';
  const internalNames = String(args.items ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const outputJson = [];

  const connection = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_maint',
  });

  try {
    if (internalNames.length === 0) {
      throw new Error('items is required');
    }

    const placeholders = internalNames.map(() => '?').join(',');
    const [rows] = await connection.query(
      `SELECT id, item_internal_name, item_name, page_title, requested_page_title FROM maint_item_pages WHERE deleted = 0 AND item_internal_name IN (${placeholders})`,
      internalNames
    );

    if (apply) {
      await connection.beginTransaction();
    }

    for (const row of rows) {
      const pageTitle = row.page_title ?? row.requested_page_title ?? row.item_name ?? row.item_internal_name;
      const payload = await fetchWikiPagePayload({ pageTitle });
      const sellStat = extractItemSellStat(payload.html ?? null);
      const update = buildMaintItemPageRefreshUpdate({ existingRow: row, payload, sellStat });
      outputJson.push({
        itemInternalName: row.item_internal_name,
        requestedPageTitle: pageTitle,
        refreshedPageTitle: update.pageTitle,
        sellText: update.sellText,
        sellValue: update.sellValue,
      });

      if (apply) {
        await connection.execute(
          `UPDATE maint_item_pages
           SET page_title = ?, source_revision_timestamp = ?, wikitext = ?, html = ?, sell_text = ?, sell_value = ?, raw_json = ?, updated_at = NOW()
           WHERE id = ?`,
          [
            update.pageTitle,
            toMysqlDateTime(update.sourceRevisionTimestamp),
            update.wikitext,
            update.html,
            update.sellText,
            update.sellValue,
            JSON.stringify(update.rawJson),
            row.id,
          ]
        );
      }
    }

    if (apply) {
      await connection.commit();
    }

    console.log(JSON.stringify({
      apply,
      refreshedCount: outputJson.length,
      rows: outputJson,
    }, null, 2));
  } catch (error) {
    if (apply) {
      await connection.rollback();
    }
    throw error;
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  await run();
}
