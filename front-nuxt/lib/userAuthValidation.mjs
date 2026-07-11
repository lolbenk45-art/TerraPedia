const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{10,64}$/
const verificationCodePattern = /^\d{4,8}$/

export const validateEmail = (email) => {
  const value = email.trim()
  return emailPattern.test(value)
    ? { ok: true, value }
    : { ok: false, code: 'EMAIL_INVALID' }
}

export const validatePassword = (password) => passwordPattern.test(password)
  ? { ok: true, value: password }
  : { ok: false, code: 'PASSWORD_INVALID' }

export const validateVerificationCode = (code) => {
  const value = code.trim()
  return verificationCodePattern.test(value)
    ? { ok: true, value }
    : { ok: false, code: 'VERIFICATION_CODE_INVALID' }
}
