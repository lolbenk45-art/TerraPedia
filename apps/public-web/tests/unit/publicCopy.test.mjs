import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PUBLIC_COPY_CURRENT_AVAILABLE_SHOP_DATA,
  PUBLIC_COPY_PAGE_READING_DATA,
  PUBLIC_COPY_UNDER_CONSTRUCTION,
} from '../../utils/publicCopy.ts'

test('exports the fixed public data-boundary promises', () => {
  assert.equal(PUBLIC_COPY_UNDER_CONSTRUCTION, '资料整理中')
  assert.equal(PUBLIC_COPY_PAGE_READING_DATA, '本页阅读数据')
  assert.equal(PUBLIC_COPY_CURRENT_AVAILABLE_SHOP_DATA, '当前可用商店资料')
})
