import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNewsletterChannel } from '../src/wa/messages.js';

test('newsletter resolver rejects input that is not a channel reference', async () => {
  let calls = 0;
  const result = await resolveNewsletterChannel({
    async newsletterMetadata() {
      calls++;
    }
  }, 'x?');

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('newsletter resolver converts an invite URL to the canonical JID and metadata name', async () => {
  const calls = [];
  const result = await resolveNewsletterChannel({
    async newsletterMetadata(kind, key) {
      calls.push([kind, key]);
      return { id: '120363400000000001', name: { text: 'Canal desde WhatsApp' } };
    }
  }, 'https://whatsapp.com/channel/AbCdEf1234');

  assert.deepEqual(calls, [['invite', 'AbCdEf1234']]);
  assert.equal(result.channelJid, '120363400000000001@newsletter');
  assert.equal(result.name, 'Canal desde WhatsApp');
});

test('newsletter resolver lets an explicit dashboard name override metadata', async () => {
  const result = await resolveNewsletterChannel({
    async newsletterMetadata() {
      return { id: '120363400000000002@newsletter', name: 'Nombre remoto' };
    }
  }, 'BareInvite123 Nombre editorial local');

  assert.equal(result.channelJid, '120363400000000002@newsletter');
  assert.equal(result.name, 'Nombre editorial local');
});

test('newsletter resolver preserves an explicit JID when metadata is unavailable', async () => {
  const result = await resolveNewsletterChannel({
    async newsletterMetadata() {
      throw new Error('metadata offline');
    }
  }, '120363400000000003@newsletter Canal manual');

  assert.equal(result.channelJid, '120363400000000003@newsletter');
  assert.equal(result.name, 'Canal manual');
  assert.equal(result.metadata, null);
});

test('newsletter resolver fails clearly when an invite cannot be mapped to a JID', async () => {
  await assert.rejects(
    resolveNewsletterChannel({
      async newsletterMetadata() {
        return { name: { text: 'Sin identificador' } };
      }
    }, 'BareInvite123'),
    /No pude resolver el enlace a un JID de canal/
  );
});
