import test from 'node:test';
import assert from 'node:assert/strict';

import { getBuffAuditStatsSql } from './entity-audit-sql.mjs';

test('getBuffAuditStatsSql uses current buffs schema columns', () => {
  const sql = getBuffAuditStatsSql();

  assert.match(sql, /name_zh/);
  assert.match(sql, /image/);
  assert.doesNotMatch(sql, /image_path/);
  assert.doesNotMatch(sql, /SUM\(name IS NOT NULL/);
});
