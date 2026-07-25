import assert from 'node:assert/strict'
import test from 'node:test'
import { unwrapAutomationEnvelope } from './crawler-automation.state.mjs'

test('unwraps only successful automation API envelopes', () => {
  assert.deepEqual(unwrapAutomationEnvelope({ success: true, statusCode: 200, data: { readOnly: true } }), { readOnly: true })
  assert.throws(() => unwrapAutomationEnvelope({ success: false, statusCode: 500, data: null, message: 'failed' }), /failed/)
  assert.throws(() => unwrapAutomationEnvelope({ statusCode: 200, data: { readOnly: false } }), /invalid automation API envelope/)
})
