import assert from 'node:assert/strict';
import test from 'node:test';
import { sendOutboundMessage } from '../src/core/outboundQueue.js';

test('WA_DRY_RUN blocks the underlying WhatsApp send', async () => {
  let sends = 0;
  const sock = {
    async sendMessage() {
      sends++;
      return { key: { id: 'unexpected-send' } };
    }
  };

  const result = await sendOutboundMessage(sock, 'test@s.whatsapp.net', { text: 'No enviar' });
  assert.equal(sends, 0);
  assert.equal(result.dryRun, true);
});
