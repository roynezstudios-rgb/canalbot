import test from 'node:test';
import assert from 'node:assert/strict';
import {
  botJidCandidates,
  canalBotAccessForChat,
  commandFromText,
  classifyChat,
  getQuotedMessageKey,
  normalizedJidIdentity,
  quotedMessageTargetsBot,
  sameJidIdentity
} from '../src/core/messageUtils.js';

test('commandFromText parses aliases, args and custom prefix', () => {
  const aliases = new Map([['ay', 'ayuda']]);
  assert.deepEqual(commandFromText('!ay hola mundo', aliases), {
    name: 'ayuda',
    rawName: 'ay',
    args: 'hola mundo'
  });
  assert.deepEqual(commandFromText('/guardian observe', new Map(), '/'), {
    name: 'guardian',
    rawName: 'guardian',
    args: 'observe'
  });
  assert.deepEqual(commandFromText('! hola', aliases), {
    name: 'hola',
    rawName: 'hola',
    args: ''
  });
  assert.equal(commandFromText('hola !ay', aliases), null);
});

test('classifyChat separates group, newsletter and private chats', () => {
  assert.equal(classifyChat('120363000000000000@g.us'), 'group');
  assert.equal(classifyChat('120363000000000000@newsletter'), 'newsletter');
  assert.equal(classifyChat('5215555555555@s.whatsapp.net'), 'private');
});

test('canalBotAccessForChat allows only the active control group when one is configured', () => {
  assert.deepEqual(canalBotAccessForChat({
    chatJid: '120363111111111111@g.us',
    activeControlChatJid: '120363111111111111@g.us'
  }), { allowed: true, reason: null });

  assert.deepEqual(canalBotAccessForChat({
    chatJid: '120363222222222222@g.us',
    activeControlChatJid: '120363111111111111@g.us'
  }), { allowed: false, reason: 'different_control_group' });

  assert.deepEqual(canalBotAccessForChat({
    chatJid: '5215555555555@s.whatsapp.net',
    activeControlChatJid: '120363111111111111@g.us'
  }), { allowed: true, reason: null });

  assert.deepEqual(canalBotAccessForChat({
    chatJid: '5215555555555@s.whatsapp.net',
    activeControlChatJid: '120363111111111111@g.us',
    requireActiveControl: true
  }), { allowed: false, reason: 'not_group_control_chat' });

  assert.deepEqual(canalBotAccessForChat({
    chatJid: '120363222222222222@g.us',
    activeControlChatJid: null,
    requireActiveControl: true
  }), { allowed: false, reason: 'no_active_control_group' });
});

test('getQuotedMessageKey extracts replied message evidence', () => {
  const msg = {
    key: { remoteJid: '120363000000000000@g.us' },
    message: {
      extendedTextMessage: {
        text: '!report',
        contextInfo: {
          stanzaId: 'ABC123',
          participant: '5211111111111@s.whatsapp.net'
        }
      }
    }
  };
  assert.deepEqual(getQuotedMessageKey(msg), {
    messageId: 'ABC123',
    participant: '5211111111111@s.whatsapp.net',
    remoteJid: '120363000000000000@g.us'
  });
});

test('sameJidIdentity ignores Baileys device suffixes', () => {
  assert.equal(normalizedJidIdentity('5211111111111:9@s.whatsapp.net'), '5211111111111@s.whatsapp.net');
  assert.equal(sameJidIdentity('5211111111111:9@s.whatsapp.net', '5211111111111@s.whatsapp.net'), true);
  assert.equal(sameJidIdentity('5211111111111@s.whatsapp.net', '5212222222222@s.whatsapp.net'), false);
});

test('quotedMessageTargetsBot detects reports against the bot session', () => {
  const sock = {
    user: { id: '5219999999999:42@s.whatsapp.net' },
    authState: {
      creds: {
        me: { id: '5219999999999:42@s.whatsapp.net' }
      }
    }
  };
  assert.deepEqual(botJidCandidates(sock), [
    '5219999999999:42@s.whatsapp.net',
    '5219999999999:42@s.whatsapp.net'
  ]);
  assert.equal(quotedMessageTargetsBot({
    sock,
    quoted: { participant: '5219999999999@s.whatsapp.net' }
  }), true);
  assert.equal(quotedMessageTargetsBot({
    sock,
    quoted: { participant: '5211111111111@s.whatsapp.net' }
  }), false);
});
