import assert from 'node:assert/strict';
import test from 'node:test';

import { extractItemImageMemberEvidence } from './item-image-member-evidence.mjs';

const IDENTITY_TARGETS = ['AdamantiteLeggings', 'Adamantite Leggings'];

test('extractItemImageMemberEvidence accepts an exact image from the same table row', () => {
  const evidence = extractItemImageMemberEvidence({
    html: `
      <table>
        <tr><td><a title="Adamantite Breastplate">Breastplate</a></td></tr>
        <tr>
          <td>
            <a title="Adamantite Leggings">
              <img
                alt="Adamantite Leggings.png"
                src="https://terraria.wiki.gg/images/Adamantite_Leggings.png"
                width="18"
                height="26"
              />
            </a>
          </td>
        </tr>
      </table>
    `,
    identityTargets: IDENTITY_TARGETS
  });

  assert.deepEqual(evidence.summary, {
    matchingBlockCount: 1,
    candidateCount: 1,
    status: 'verified'
  });
  assert.deepEqual(evidence.candidates[0], {
    evidenceKind: 'table_row',
    blockOrdinal: 2,
    anchorTitle: 'Adamantite Leggings',
    fileTitle: 'Adamantite Leggings.png',
    url: 'https://terraria.wiki.gg/images/Adamantite_Leggings.png',
    width: 18,
    height: 26,
    contentType: 'image/png'
  });
});

test('extractItemImageMemberEvidence rejects an image from a neighboring row', () => {
  const evidence = extractItemImageMemberEvidence({
    html: `
      <table>
        <tr><td><a title="Adamantite Leggings">Adamantite Leggings</a></td></tr>
        <tr>
          <td>
            <a title="Adamantite Breastplate">
              <img alt="Adamantite Leggings.png" src="/images/Adamantite_Leggings.png" />
            </a>
          </td>
        </tr>
      </table>
    `,
    identityTargets: IDENTITY_TARGETS
  });

  assert.deepEqual(evidence.summary, {
    matchingBlockCount: 1,
    candidateCount: 0,
    status: 'unresolved'
  });
  assert.deepEqual(evidence.candidates, []);
});

test('extractItemImageMemberEvidence accepts an exact list-item image', () => {
  const evidence = extractItemImageMemberEvidence({
    html: `
      <ul>
        <li>
          <a title="Adamantite Leggings">
            <img alt="Adamantite Leggings.png" src="/images/Adamantite_Leggings.png" width="22" height="18" />
          </a>
        </li>
      </ul>
    `,
    identityTargets: IDENTITY_TARGETS
  });

  assert.equal(evidence.summary.status, 'verified');
  assert.equal(evidence.summary.candidateCount, 1);
  assert.equal(evidence.candidates[0].evidenceKind, 'list_item');
  assert.equal(evidence.candidates[0].anchorTitle, 'Adamantite Leggings');
  assert.equal(evidence.candidates[0].url, 'https://terraria.wiki.gg/images/Adamantite_Leggings.png');
});

test('extractItemImageMemberEvidence marks multiple exact candidates as ambiguous', () => {
  const evidence = extractItemImageMemberEvidence({
    html: `
      <table>
        <tr>
          <td>
            <a title="Adamantite Leggings">
              <img alt="Adamantite Leggings.png" src="/images/Adamantite_Leggings.png" />
              <img alt="Adamantite Leggings.gif" src="/images/Adamantite_Leggings.gif" />
            </a>
          </td>
        </tr>
      </table>
    `,
    identityTargets: IDENTITY_TARGETS
  });

  assert.equal(evidence.summary.matchingBlockCount, 1);
  assert.equal(evidence.summary.candidateCount, 2);
  assert.equal(evidence.summary.status, 'ambiguous');
});

test('extractItemImageMemberEvidence rejects placed, demo, and auto-icon images', () => {
  const evidence = extractItemImageMemberEvidence({
    html: `
      <div class="infobox item">
        <div class="title">Adamantite Leggings</div>
        <div class="section images">
          <img alt="Adamantite Leggings placed.png" src="/images/Adamantite_Leggings_placed.png" />
          <img alt="Adamantite Leggings (demo).gif" src="/images/Adamantite_Leggings_%28demo%29.gif" />
          <img alt="Adamantite Leggings" src="/images/Auto_icon.png" />
        </div>
      </div>
    `,
    identityTargets: IDENTITY_TARGETS
  });

  assert.deepEqual(evidence.summary, {
    matchingBlockCount: 1,
    candidateCount: 0,
    status: 'unresolved'
  });
  assert.deepEqual(evidence.candidates, []);
});
