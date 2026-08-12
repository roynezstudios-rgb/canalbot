import assert from 'node:assert/strict';
import test from 'node:test';

test('dashboard config parses an explicit origin allowlist', async () => {
  const previous = process.env.CANALBOT_DASHBOARD_ORIGINS;
  process.env.CANALBOT_DASHBOARD_ORIGINS = 'http://localhost:4000, https://panel.example.test, ,';

  try {
    const { config } = await import(`../src/config.js?dashboard-origins-${Date.now()}`);
    assert.deepEqual(config.dashboard.allowedOrigins, [
      'http://localhost:4000',
      'https://panel.example.test'
    ]);
  } finally {
    if (previous == null) delete process.env.CANALBOT_DASHBOARD_ORIGINS;
    else process.env.CANALBOT_DASHBOARD_ORIGINS = previous;
  }
});

test('dashboard config keeps localhost-safe defaults when the allowlist is blank', async () => {
  const previous = process.env.CANALBOT_DASHBOARD_ORIGINS;
  process.env.CANALBOT_DASHBOARD_ORIGINS = '';

  try {
    const { config } = await import(`../src/config.js?dashboard-default-origins-${Date.now()}`);
    assert.deepEqual(config.dashboard.allowedOrigins, [
      'http://127.0.0.1:3000',
      'http://localhost:3000'
    ]);
  } finally {
    if (previous == null) delete process.env.CANALBOT_DASHBOARD_ORIGINS;
    else process.env.CANALBOT_DASHBOARD_ORIGINS = previous;
  }
});
