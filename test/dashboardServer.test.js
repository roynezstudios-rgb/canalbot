import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { config } from '../src/config.js';
import { closePool } from '../src/db.js';
import { startDashboardServer } from '../src/dashboard/server.js';
import { updateRuntimeStatus } from '../src/runtime/status.js';

const originalDashboard = { ...config.dashboard, allowedOrigins: [...config.dashboard.allowedOrigins] };
const originalQrImagePath = config.qrImagePath;
const port = 33000 + (process.pid % 20000);
const origin = `http://127.0.0.1:${port}`;
let controller;

before(async () => {
  config.dashboard.host = '127.0.0.1';
  config.dashboard.port = port;
  config.dashboard.accessToken = '';
  config.dashboard.allowedOrigins = ['http://localhost:3000'];
  controller = await startDashboardServer();
});

after(async () => {
  await controller?.stop?.();
  await closePool();
  Object.assign(config.dashboard, originalDashboard);
  config.qrImagePath = originalQrImagePath;
});

async function json(path, init) {
  const response = await fetch(`${origin}${path}`, init);
  return { response, payload: await response.json() };
}

test('dashboard status is available locally and reports safety state', async () => {
  const { response, payload } = await json('/api/v1/status');
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.runtime.status, 'string');
  assert.equal(payload.safety.dryRun, config.dryRun);
  assert.equal(payload.safety.commandsEnabled, config.canalbot.enabled);
  assert.equal(payload.safety.publishingEnabled, config.canalbot.publishEnabled);
  assert.equal(typeof payload.database.connected, 'boolean');
});

test('dashboard exposes CORS only to an allowed local origin', async () => {
  const allowed = await fetch(`${origin}/api/v1/status`, {
    headers: { Origin: 'http://localhost:3000' }
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');

  const denied = await fetch(`${origin}/api/v1/status`, {
    headers: { Origin: 'https://evil.example' }
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('dashboard handles local preflight without executing an action', async () => {
  const response = await fetch(`${origin}/api/v1/channels`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});

test('dashboard blocks state-changing requests from an untrusted browser origin', async () => {
  const { response, payload } = await json('/api/v1/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({})
  });
  assert.equal(response.status, 403);
  assert.match(payload.error, /origen no autorizado/i);
});

test('dashboard validates malformed JSON and channel registration fields', async () => {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' };

  const malformed = await json('/api/v1/channels', { method: 'POST', headers, body: '{' });
  assert.equal(malformed.response.status, 400);
  assert.match(malformed.payload.error, /JSON/i);

  const badReference = await json('/api/v1/channels', {
    method: 'POST', headers, body: JSON.stringify({ reference: 'invalid', name: 'Canal', adminConfirmed: true })
  });
  assert.equal(badReference.response.status, 400);

  const missingName = await json('/api/v1/channels', {
    method: 'POST', headers, body: JSON.stringify({ reference: '120363400000000001@newsletter', adminConfirmed: true })
  });
  assert.equal(missingName.response.status, 400);

  const adminNotConfirmed = await json('/api/v1/channels', {
    method: 'POST', headers, body: JSON.stringify({ reference: '120363400000000001@newsletter', name: 'Canal' })
  });
  assert.equal(adminNotConfirmed.response.status, 400);
});

test('dashboard accepts an empty JSON body safely and caps oversized requests', async () => {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' };

  const empty = await json('/api/v1/channels', { method: 'POST', headers });
  assert.equal(empty.response.status, 400);
  assert.match(empty.payload.error, /enlace de canal/i);

  const oversized = await json('/api/v1/channels', {
    method: 'POST',
    headers,
    body: JSON.stringify({ value: 'x'.repeat((1024 * 1024) + 1) })
  });
  assert.equal(oversized.response.status, 413);
  assert.match(oversized.payload.error, /tamaño permitido/i);
});

test('dashboard requires a connected WhatsApp socket before resolving a channel', async () => {
  const { response, payload } = await json('/api/v1/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({
      reference: '120363400000000001@newsletter',
      name: 'Canal',
      adminConfirmed: true
    })
  });
  assert.equal(response.status, 409);
  assert.match(payload.error, /vincula/i);
});

test('dashboard rejects unsafe channel and campaign mode transitions', async () => {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' };
  const invalidMode = await json('/api/v1/channels/test%40newsletter/mode', {
    method: 'POST', headers, body: JSON.stringify({ publishMode: 'unknown' })
  });
  assert.equal(invalidMode.response.status, 400);

  const activeMode = await json('/api/v1/channels/test%40newsletter/mode', {
    method: 'POST', headers, body: JSON.stringify({ publishMode: 'active' })
  });
  assert.equal(activeMode.response.status, 409);

  const invalidCampaign = await json('/api/v1/campaigns/9/status', {
    method: 'POST', headers, body: JSON.stringify({ status: 'finished' })
  });
  assert.equal(invalidCampaign.response.status, 400);

  const runningCampaign = await json('/api/v1/campaigns/9/status', {
    method: 'POST', headers, body: JSON.stringify({ status: 'running' })
  });
  assert.equal(runningCampaign.response.status, 409);
});

test('dashboard returns explicit QR and route-not-found states', async () => {
  const qr = await json('/api/v1/qr');
  assert.equal(qr.response.status, 404);
  assert.match(qr.payload.error, /QR/i);

  const unknown = await json('/api/v1/unknown');
  assert.equal(unknown.response.status, 404);
  assert.match(unknown.payload.error, /Ruta no encontrada/i);
});

test('dashboard serves the current QR image and recovers when its file disappears', async () => {
  const qrPath = path.join(os.tmpdir(), `canalbot-dashboard-${process.pid}.png`);
  config.qrImagePath = qrPath;
  await fs.writeFile(qrPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  updateRuntimeStatus({ qrAvailable: true, qrUpdatedAt: new Date().toISOString() });

  try {
    const available = await fetch(`${origin}/api/v1/qr`);
    assert.equal(available.status, 200);
    assert.equal(available.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await available.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await fs.unlink(qrPath);
    const missing = await json('/api/v1/qr');
    assert.equal(missing.response.status, 404);
    assert.match(missing.payload.error, /todavía no está listo/i);
  } finally {
    await fs.rm(qrPath, { force: true });
    updateRuntimeStatus({ qrAvailable: false });
    config.qrImagePath = originalQrImagePath;
  }
});

test('dashboard token mode rejects a missing token before any mutation', async () => {
  config.dashboard.accessToken = 'test-secret';
  try {
    const unauthorized = await json('/api/v1/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(unauthorized.response.status, 401);

    const authorized = await json('/api/v1/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CanalBot-Token': 'test-secret' },
      body: JSON.stringify({})
    });
    assert.equal(authorized.response.status, 400);
  } finally {
    config.dashboard.accessToken = '';
  }
});

test('dashboard refuses a public bind even when an access token is configured', async () => {
  const previousHost = config.dashboard.host;
  const previousToken = config.dashboard.accessToken;
  config.dashboard.host = '0.0.0.0';
  config.dashboard.accessToken = 'test-secret';
  try {
    await assert.rejects(startDashboardServer(), /sólo puede escuchar en localhost/i);
  } finally {
    config.dashboard.host = previousHost;
    config.dashboard.accessToken = previousToken;
  }
});
