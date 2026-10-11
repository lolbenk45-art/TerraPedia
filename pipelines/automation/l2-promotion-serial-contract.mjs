const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export const L2_SERIAL_PROMOTION_ORDER = Object.freeze([
  'items',
  'npcs',
  'projectiles',
  'armor_sets',
  'buffs',
  'audio',
  'bosses',
  'shimmer',
]);

export const L2_SERIAL_PROMOTION_OPERATION_IDS = Object.freeze(Object.fromEntries(
  L2_SERIAL_PROMOTION_ORDER.map((domainId) => [
    domainId,
    `automation-${domainId.replaceAll('_', '-')}-l2-promotion`,
  ]),
));

export function assertL2SerialTransition(value, { domainId, operationId } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('serial transition is required for eight-domain L2 promotion');
  }
  if (value.schemaVersion !== 1) throw new Error('serial transition schemaVersion must be 1');
  if (!Array.isArray(value.order)
      || value.order.length !== L2_SERIAL_PROMOTION_ORDER.length
      || value.order.some((entry, index) => entry !== L2_SERIAL_PROMOTION_ORDER[index])) {
    throw new Error('serial transition order is not the exact eight-domain order');
  }
  const index = Number(value.sequenceIndex);
  if (!Number.isSafeInteger(index)
      || index < 0 || index >= L2_SERIAL_PROMOTION_ORDER.length
      || value.order[index] !== domainId) {
    throw new Error('serial transition sequenceIndex does not match the exact domain order');
  }
  if (operationId != null && L2_SERIAL_PROMOTION_OPERATION_IDS[domainId] !== operationId) {
    throw new Error('serial transition operation identity does not match the domain');
  }
  if (index === 0) {
    if (value.predecessor !== null) {
      throw new Error('first serial L2 promotion must not declare a predecessor');
    }
    return Object.freeze({
      schemaVersion: 1,
      order: L2_SERIAL_PROMOTION_ORDER,
      sequenceIndex: index,
      predecessor: null,
    });
  }
  const predecessor = value.predecessor;
  if (!predecessor || typeof predecessor !== 'object' || Array.isArray(predecessor)) {
    throw new Error('non-first serial L2 promotion requires a predecessor');
  }
  const expectedDomain = L2_SERIAL_PROMOTION_ORDER[index - 1];
  const expectedOperationId = L2_SERIAL_PROMOTION_OPERATION_IDS[expectedDomain];
  if (predecessor.domainId !== expectedDomain
      || predecessor.operationId !== expectedOperationId
      || !String(predecessor.decisionIdentity ?? '').trim()
      || !HASH_PATTERN.test(predecessor.packetHash ?? '')
      || !HASH_PATTERN.test(predecessor.postPolicySetHash ?? '')) {
    throw new Error('serial predecessor identity is incomplete or does not match the immediately previous domain');
  }
  return Object.freeze({
    schemaVersion: 1,
    order: L2_SERIAL_PROMOTION_ORDER,
    sequenceIndex: index,
    predecessor: Object.freeze({
      domainId: predecessor.domainId,
      operationId: predecessor.operationId,
      decisionIdentity: predecessor.decisionIdentity,
      packetHash: predecessor.packetHash,
      postPolicySetHash: predecessor.postPolicySetHash,
    }),
  });
}

export function isSerialL2PromotionOperation(operationId) {
  return Object.values(L2_SERIAL_PROMOTION_OPERATION_IDS).includes(operationId);
}

export function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}
