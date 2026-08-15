import assert from 'node:assert/strict'
import test from 'node:test'

import { COVER_SPRITE_MAX_EDGE, classifyCoverMode } from '../../utils/articleCoverMode.ts'

test('treats small game sprites as pixel art rather than photos', () => {
  assert.equal(classifyCoverMode(16, 16), 'sprite')
  assert.equal(classifyCoverMode(36, 36), 'sprite')
  assert.equal(classifyCoverMode(46, 54), 'sprite')
  assert.equal(classifyCoverMode(165, 140), 'sprite')
})

test('treats real screenshots and photographs as croppable photos', () => {
  assert.equal(classifyCoverMode(1280, 720), 'photo')
  assert.equal(classifyCoverMode(400, 300), 'photo')
  assert.equal(classifyCoverMode(300, 900), 'photo')
})

test('splits exactly at the 400px native edge threshold', () => {
  assert.equal(COVER_SPRITE_MAX_EDGE, 400)
  assert.equal(classifyCoverMode(399, 399), 'sprite')
  assert.equal(classifyCoverMode(400, 10), 'photo')
})

test('degrades unmeasurable covers to the non-cropping sprite mode', () => {
  assert.equal(classifyCoverMode(0, 0), 'sprite')
  assert.equal(classifyCoverMode(undefined, undefined), 'sprite')
  assert.equal(classifyCoverMode(Number.NaN, 120), 'sprite')
  assert.equal(classifyCoverMode(-40, -40), 'sprite')
})
