import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEmail, validatePassword, validateVerificationCode } from '../../lib/userAuthValidation.mjs'

test('AUTH-LOGIN-003 rejects malformed email before a request', () => {
  assert.deepEqual(validateEmail('not-an-email'), { ok: false, code: 'EMAIL_INVALID' })
})

test('AUTH-REGISTER-003 accepts only a 10-64 character password containing a letter and a digit', () => {
  assert.deepEqual(validatePassword('Abcdefg12'), { ok: false, code: 'PASSWORD_INVALID' })
  assert.deepEqual(validatePassword('Abcdefg123'), { ok: true, value: 'Abcdefg123' })
  assert.deepEqual(validatePassword(`A1${'x'.repeat(62)}`), { ok: true, value: `A1${'x'.repeat(62)}` })
  assert.deepEqual(validatePassword(`A1${'x'.repeat(63)}`), { ok: false, code: 'PASSWORD_INVALID' })
  assert.deepEqual(validatePassword('abcdefghij'), { ok: false, code: 'PASSWORD_INVALID' })
  assert.deepEqual(validatePassword('1234567890'), { ok: false, code: 'PASSWORD_INVALID' })
})

test('AUTH-REGISTER-004 accepts only 4-8 numeric verification-code characters', () => {
  assert.deepEqual(validateVerificationCode('123'), { ok: false, code: 'VERIFICATION_CODE_INVALID' })
  assert.deepEqual(validateVerificationCode('1234'), { ok: true, value: '1234' })
  assert.deepEqual(validateVerificationCode('123456'), { ok: true, value: '123456' })
  assert.deepEqual(validateVerificationCode('12345678'), { ok: true, value: '12345678' })
  assert.deepEqual(validateVerificationCode('123456789'), { ok: false, code: 'VERIFICATION_CODE_INVALID' })
  assert.deepEqual(validateVerificationCode('12ab'), { ok: false, code: 'VERIFICATION_CODE_INVALID' })
})

test('validators trim email and verification code but preserve password exactly', () => {
  assert.deepEqual(validateEmail('  test@example.com  '), { ok: true, value: 'test@example.com' })
  assert.deepEqual(validateVerificationCode('  123456  '), { ok: true, value: '123456' })
  assert.deepEqual(validatePassword(' Abcdefg123 '), { ok: true, value: ' Abcdefg123 ' })
})
