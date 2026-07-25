export function unwrapAutomationEnvelope(response) {
  if (!response || response.success !== true || response.statusCode !== 200 || response.data == null) {
    throw new Error(response?.message || 'invalid automation API envelope')
  }
  return response.data
}
