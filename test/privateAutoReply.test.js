import test from 'node:test';
import assert from 'node:assert/strict';
import {
  privateAutoReplyCommand,
  privateAutoReplyText,
  shouldSendPrivateAutoReply
} from '../src/wa/privateAutoReply.js';

test('privateAutoReplyCommand maps private FAQ aliases', () => {
  assert.equal(privateAutoReplyCommand('!ayuda')?.name, 'faq');
  assert.equal(privateAutoReplyCommand('!reportar')?.name, 'reportar');
  assert.equal(privateAutoReplyCommand('hola')?.name, undefined);
});

test('privateAutoReplyText clearly says the number is a bot, not immediate human support', () => {
  const text = privateAutoReplyText('bot');
  assert.match(text, /principalmente a un bot/);
  assert.match(text, /No es un chat de atencion humana inmediata/);
  assert.match(text, /!reportar/);
});

test('privateAutoReplyText redirects group issues to in-group moderation tools', () => {
  const text = privateAutoReplyText('reportar');
  assert.match(text, /dentro del grupo/);
  assert.match(text, /!report/);
  assert.match(text, /3 reportes distintos/);
  assert.match(text, /!mal/);
  assert.match(text, /!respeto/);
});

test('shouldSendPrivateAutoReply responds to private commands and ignores groups', () => {
  assert.equal(shouldSendPrivateAutoReply({
    chatJid: '5211111111111@s.whatsapp.net',
    text: '!grupo'
  }).send, true);
  assert.deepEqual(shouldSendPrivateAutoReply({
    chatJid: '5211111111111@s.whatsapp.net',
    text: '!canalbot'
  }), { send: false, reason: 'unknown_command', command: null });
  assert.equal(shouldSendPrivateAutoReply({
    chatJid: '120363000000000000@g.us',
    text: '!grupo'
  }).send, false);
});
