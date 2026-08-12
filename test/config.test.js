import test from 'node:test';
import assert from 'node:assert/strict';

test('numeric config falls back when env value is blank', async () => {
  const previous = process.env.CANALBOT_OUTBOUND_MIN_DELAY_MS;
  process.env.CANALBOT_OUTBOUND_MIN_DELAY_MS = '';

  try {
    const { config } = await import(`../src/config.js?blank-number-${Date.now()}`);
    assert.equal(config.canalbot.outboundMinDelayMs, 2500);
  } finally {
    if (previous == null) {
      delete process.env.CANALBOT_OUTBOUND_MIN_DELAY_MS;
    } else {
      process.env.CANALBOT_OUTBOUND_MIN_DELAY_MS = previous;
    }
  }
});

test('CanalBot can keep commands enabled while automatic publishing is disabled', async () => {
  const previous = process.env.CANALBOT_PUBLISH_ENABLED;
  process.env.CANALBOT_PUBLISH_ENABLED = 'false';

  try {
    const { config } = await import(`../src/config.js?canalbot-publish-${Date.now()}`);
    assert.equal(config.canalbot.enabled, true);
    assert.equal(config.canalbot.publishEnabled, false);
  } finally {
    if (previous == null) delete process.env.CANALBOT_PUBLISH_ENABLED;
    else process.env.CANALBOT_PUBLISH_ENABLED = previous;
  }
});
