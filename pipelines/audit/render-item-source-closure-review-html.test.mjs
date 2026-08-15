import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseRenderItemSourceClosureReviewHtmlArgs,
  renderItemSourceClosureReviewHtml,
  writeItemSourceClosureReviewHtml
} from './render-item-source-closure-review-html.mjs';

test('parseRenderItemSourceClosureReviewHtmlArgs rejects mutation flags', () => {
  for (const flag of ['apply', 'write-db', 'sync', 'import', 'backfill', 'crawler', 'fetch', 'pipeline', 'materialize', 'flyway', 'refresh']) {
    assert.throws(
      () => parseRenderItemSourceClosureReviewHtmlArgs([`--${flag}=true`]),
      /read-only item source closure HTML renderer refuses mutation flag/
    );
  }
});

test('renderItemSourceClosureReviewHtml embeds review summary and escapes script JSON', () => {
  const html = renderItemSourceClosureReviewHtml({
    generatedAt: '2026-06-11T00:00:00.000Z',
    summary: {
      totalRows: 2,
      candidatesWithExtractedSources: 1,
      candidateSourceRows: 1,
      hardBlockedRows: 1,
      terminalHardBlockedRows: 1,
      actionableParserHardBlockedRows: 0,
      unresolvedTotal: 0,
      missingRawPage: 1
    },
    candidates: [
      {
        itemId: 1,
        itemInternalName: 'SafeItem',
        name: 'Safe <Item>',
        categoryCode: 'TOOL',
        categoryName: '工具',
        rawPath: '/tmp/safe.latest.json',
        pageTitle: 'Safe Item',
        extractedSourceCount: 1,
        reviewLane: 'direct_page_candidate',
        extractedSources: [
          {
            sourceType: 'container',
            sourceRefType: 'container',
            sourceRefName: 'Chest',
            quantityText: '1',
            chanceText: '1/6'
          }
        ]
      }
    ],
    hardBlockedRows: [
      {
        itemId: 2,
        itemInternalName: 'ScriptBreaker',
        name: '</script><img src=x onerror=alert(1)>',
        pageTitle: 'Missing',
        attemptedRawPath: '/tmp/missing.latest.json',
        hardBlockLane: 'missing_raw_page',
        priorUnresolvedLane: 'missing_raw_page',
        terminalClosureStatus: 'missing_bait_raw',
        terminalClosureReason: 'Needs verified raw page.',
        terminalClosureEvidence: 'No raw page exists.',
        recommendedNextAction: 'Fetch verified raw page.'
      }
    ],
    pageResolutionSummary: [
      {
        pageTitle: 'Safe Item',
        convertedToCandidate: 1,
        remainingHardBlocked: 0,
        reason: 'converted'
      }
    ]
  });

  assert.match(html, /Item Source Terminal Closure Review/);
  assert.match(html, /只读审核页/);
  assert.match(html, /"totalRows":2/);
  assert.match(html, /"terminalHardBlockedRows":1/);
  assert.doesNotMatch(html, /<\/script><img/i);
  assert.match(html, /\\u003c\/script\\u003e/);
});

test('writeItemSourceClosureReviewHtml writes an html file from a report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-closure-html-'));
  const inputPath = path.join(root, 'report.json');
  const outputPath = path.join(root, 'review.html');
  fs.writeFileSync(inputPath, JSON.stringify({
    generatedAt: '2026-06-11T00:00:00.000Z',
    summary: {
      totalRows: 0,
      candidatesWithExtractedSources: 0,
      candidateSourceRows: 0,
      hardBlockedRows: 0,
      terminalHardBlockedRows: 0,
      actionableParserHardBlockedRows: 0,
      unresolvedTotal: 0,
      missingRawPage: 0
    },
    candidates: [],
    hardBlockedRows: [],
    pageResolutionSummary: []
  }));

  const result = writeItemSourceClosureReviewHtml({ inputPath, outputPath });
  assert.equal(result.outputPath, outputPath);
  assert.ok(result.bytes > 1000);
  assert.equal(fs.existsSync(outputPath), true);
  assert.match(fs.readFileSync(outputPath, 'utf8'), /Item Source Terminal Closure Review/);
});
