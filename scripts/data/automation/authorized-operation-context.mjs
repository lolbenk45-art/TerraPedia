import fs from 'node:fs';
import path from 'node:path';

import { verifyCanonicalAuthorizationPacket } from './build-canonical-cutover-authorization.mjs';

export function loadAuthorizedOperationContext({
  env = process.env,
  operationId,
  now = new Date().toISOString(),
} = {}) {
  const expectedOperationId = requireText(operationId, 'operationId');
  const packetPath = path.resolve(requireText(
    env?.TERRAPEDIA_AUTHORIZED_PACKET_PATH,
    'TERRAPEDIA_AUTHORIZED_PACKET_PATH',
  ));
  const stat = fs.lstatSync(packetPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('authorized packet path must be an ordinary file');
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('authorized packet file must be private');
  }
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  verifyCanonicalAuthorizationPacket(packet);
  if (packet.operationId !== expectedOperationId) {
    throw new Error(`authorized packet operationId must be ${expectedOperationId}`);
  }
  const verificationTime = requireTimestamp(now, 'authorization verification time');
  if (Date.parse(verificationTime) < Date.parse(packet.authorizedAt)
      || Date.parse(verificationTime) >= Date.parse(packet.expiresAt)) {
    throw new Error('authorized packet is not currently valid or is expired');
  }
  return Object.freeze({
    operationId: packet.operationId,
    actor: packet.actor,
    reason: packet.reason,
    authorizationReference: packet.authorizationReference,
    decisionIdentity: packet.decisionIdentity,
    packetHash: packet.packetHash,
    authorizedAt: packet.authorizedAt,
    expiresAt: packet.expiresAt,
  });
}

function requireTimestamp(value, label) {
  const timestamp = requireText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be a valid timestamp`);
  return timestamp;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
