import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRuntimeSocket,
  getRuntimeStatus,
  setRuntimeSocket,
  updateRuntimeStatus
} from '../src/runtime/status.js';

test('runtime status merges connection updates and returns defensive copies', () => {
  const updated = updateRuntimeStatus({
    status: 'connected',
    qrAvailable: false,
    phoneJid: 'demo:1@s.whatsapp.net'
  });

  assert.equal(updated.status, 'connected');
  assert.equal(updated.phoneJid, 'demo:1@s.whatsapp.net');
  assert.ok(Date.parse(updated.updatedAt));

  updated.status = 'tampered';
  assert.equal(getRuntimeStatus().status, 'connected');
});

test('runtime socket can be attached and cleared without exposing stale state', () => {
  const socket = { user: { id: 'test@s.whatsapp.net' } };
  setRuntimeSocket(socket);
  assert.equal(getRuntimeSocket(), socket);

  setRuntimeSocket(undefined);
  assert.equal(getRuntimeSocket(), null);
});
