import test from 'node:test';
import assert from 'node:assert/strict';
import { proto } from '@whiskeysockets/baileys';
import { config } from '../src/config.js';
import { normalizeText } from '../src/guardianbot/moderation/normalizer.js';
import {
  badWordMatchTypeForPattern,
  evaluateBadWordsWithRules,
  guardianBadWordWarningText
} from '../src/guardianbot/moderation/badWords.js';
import { guardianRulesText } from '../src/guardianbot/rules.js';
import { communityReportThresholdDecision } from '../src/guardianbot/index.js';
import {
  adminBadNoticeText,
  adminRespectNoticeText
} from '../src/guardianbot/admin/manualModeration.js';
import { quotedMessageDeleteKey } from '../src/core/messageUtils.js';
import { evaluateStickerSpam, evaluateMediaSpam } from '../src/guardianbot/moderation/spamGuard.js';
import { muteAttemptDecision } from '../src/guardianbot/moderation/index.js';
import { actionForInfractionCount, guardianCanExecuteActions } from '../src/guardianbot/moderation/infractions.js';
import {
  groupCallViolationFromEvent,
  groupCallViolationFromMessage,
  groupVoiceChatViolationFromMessage,
  recentGroupCallSnapshot,
  resolveGroupCallForManualEnd,
  rememberRecentGroupCallEvent,
  rememberRecentGroupCallIdentity
} from '../src/guardianbot/moderation/groupCalls.js';

test('normalizeText lowers accents, repeated letters and basic substitutions', () => {
  assert.equal(normalizeText('  CAAAFÉ\u200B 4migo!!!  '), 'caafe amigo');
});

test('guardian bad-word warning explains observe-only behavior', () => {
  const text = guardianBadWordWarningText();
  assert.match(text, /lenguaje/i);
  assert.match(text, /observación/i);
  assert.match(text, /no borro/i);
});

test('bad-word single-word rules do not match inside hello', () => {
  const rules = [{
    id: 53,
    pattern: 'hell',
    normalizedPattern: 'hell',
    matchType: 'word_boundary',
    severity: 'moderada',
    exceptions: []
  }];

  assert.equal(evaluateBadWordsWithRules({ rules, text: 'hello' }), null);
  assert.equal(evaluateBadWordsWithRules({ rules, text: 'Helloo' }), null);

  const result = evaluateBadWordsWithRules({ rules, text: 'hell' });
  assert.equal(result.matched, true);
  assert.equal(result.evidence.matchType, 'word_boundary');
});

test('bad-word command defaults single words to word boundary and phrases to phrase', () => {
  assert.equal(badWordMatchTypeForPattern(normalizeText('hell')), 'word_boundary');
  assert.equal(badWordMatchTypeForPattern(normalizeText('frase ofensiva')), 'phrase');
});

test('guardianRulesText explains core group rules and safety commands', () => {
  const text = guardianRulesText({ settings: { enabled: true, mode: 'active' } });
  assert.match(text, /Reglas del grupo/i);
  assert.match(text, /No chats de voz/i);
  assert.match(text, /!report/i);
  assert.match(text, /!cerrarvoz/i);
  assert.doesNotMatch(text, /llamadas grupales/i);
  assert.match(text, /Modo GuardianBot: active/i);
});

test('quotedMessageDeleteKey builds a Baileys delete key for a quoted group message', () => {
  assert.deepEqual(quotedMessageDeleteKey({
    chatJid: '120363bad@g.us',
    quoted: {
      messageId: 'BADMSG1',
      participant: '5211111111111:9@s.whatsapp.net'
    }
  }), {
    remoteJid: '120363bad@g.us',
    fromMe: false,
    id: 'BADMSG1',
    participant: '5211111111111:9@s.whatsapp.net'
  });
});

test('adminBadNoticeText mentions the user and explains the infraction', () => {
  const text = adminBadNoticeText({
    targetJid: '5211111111111:9@s.whatsapp.net',
    totalInfractions: 2,
    deleted: true
  });
  assert.match(text, /@5211111111111/);
  assert.match(text, /Infracción registrada: 2/);
  assert.match(text, /mensaje fue eliminado/i);
});

test('adminRespectNoticeText explains conflict moderation', () => {
  const text = adminRespectNoticeText({
    targetJid: '5211111111111:9@s.whatsapp.net',
    totalInfractions: 1,
    deleted: true
  });
  assert.match(text, /@5211111111111/);
  assert.match(text, /falta de respeto o conflicto/i);
  assert.match(text, /bajar la tensión/i);
});

test('groupVoiceChatViolationFromMessage extracts WhatsApp voice chat messages', () => {
  assert.equal(groupVoiceChatViolationFromMessage({
    key: { remoteJid: 'user@s.whatsapp.net', id: 'private-voice-chat' },
    message: { callLogMessage: { callType: proto.Message.CallLogMessage.CallType.VOICE_CHAT } }
  }), null);

  assert.deepEqual(groupVoiceChatViolationFromMessage({
    key: {
      remoteJid: '120363voicechat@g.us',
      participant: 'voice-starter@s.whatsapp.net',
      id: 'voice-chat-msg-1'
    },
    messageTimestamp: 1783900100,
    message: {
      callLogMessage: {
        callType: proto.Message.CallLogMessage.CallType.VOICE_CHAT,
        isVideo: false
      }
    }
  }), {
    callId: 'voice-chat-msg-1',
    groupJid: '120363voicechat@g.us',
    callerJid: 'voice-starter@s.whatsapp.net',
    isVideo: false,
    offline: false,
    date: new Date(1783900100 * 1000),
    source: 'voice_chat_call_log'
  });

  assert.deepEqual(groupVoiceChatViolationFromMessage({
    key: {
      remoteJid: '120363voicechat@g.us',
      participant: 'voice-starter@s.whatsapp.net',
      id: 'event-msg-1'
    },
    message: {
      eventMessage: {
        joinLink: 'https://call.whatsapp.com/voice/abc123',
        startTime: 1783900200,
        isScheduleCall: true
      }
    }
  }), {
    callId: 'abc123',
    groupJid: '120363voicechat@g.us',
    callerJid: 'voice-starter@s.whatsapp.net',
    isVideo: false,
    offline: false,
    date: new Date(1783900200 * 1000),
    source: 'event_message_voice_chat'
  });
});

test('evaluateStickerSpam triggers on sixth sticker in short window', () => {
  let result = null;
  for (let i = 1; i <= 6; i++) {
    result = evaluateStickerSpam({
      groupJid: 'test-sticker@g.us',
      userJid: 'user@s.whatsapp.net',
      messageId: `sticker-${i}`
    });
  }
  assert.equal(result.matched, true);
  assert.equal(result.spamType, 'sticker_spam');
  assert.equal(result.observedCount, 6);
  assert.equal(result.thresholdCount, 5);
});

test('evaluateMediaSpam keeps separate counters by media kind', () => {
  for (let i = 1; i <= 3; i++) {
    assert.equal(evaluateMediaSpam({
      groupJid: 'test-media@g.us',
      userJid: 'user@s.whatsapp.net',
      messageId: `image-${i}`,
      mediaKind: 'image',
      limit: 3
    }), null);
  }
  const imageResult = evaluateMediaSpam({
    groupJid: 'test-media@g.us',
    userJid: 'user@s.whatsapp.net',
    messageId: 'image-4',
    mediaKind: 'image',
    limit: 3
  });
  assert.equal(imageResult.spamType, 'image_spam');

  const videoResult = evaluateMediaSpam({
    groupJid: 'test-media@g.us',
    userJid: 'user@s.whatsapp.net',
    messageId: 'video-1',
    mediaKind: 'video',
    limit: 3
  });
  assert.equal(videoResult, null);
});

test('muteAttemptDecision warns at 10 and kicks at 15 attempts only', () => {
  assert.deepEqual(muteAttemptDecision(9), { action: 'none', threshold: null });
  assert.deepEqual(muteAttemptDecision(10), { action: 'warn', threshold: 10 });
  assert.deepEqual(muteAttemptDecision(11), { action: 'none', threshold: null });
  assert.deepEqual(muteAttemptDecision(15), { action: 'kick', threshold: 15 });
  assert.deepEqual(muteAttemptDecision(16), { action: 'none', threshold: null });
});

test('communityReportThresholdDecision acts exactly at the report action threshold', () => {
  assert.deepEqual(communityReportThresholdDecision(2, 3), { action: 'count_only', threshold: 3 });
  assert.deepEqual(communityReportThresholdDecision(3, 3), { action: 'delete_and_infraction', threshold: 3 });
  assert.deepEqual(communityReportThresholdDecision(4, 3), { action: 'count_only', threshold: 3 });
});

test('actionForInfractionCount escalates with configured thresholds only in active mode', () => {
  const previous = {
    globalDryRun: config.dryRun,
    dryRun: config.guardian.dryRun,
    observeOnly: config.guardian.observeOnly,
    destructiveActions: config.guardian.destructiveActions,
    infractionKickThreshold: config.guardian.infractionKickThreshold
  };

  config.dryRun = false;
  config.guardian.dryRun = false;
  config.guardian.observeOnly = false;
  config.guardian.destructiveActions = true;

  try {
    assert.equal(actionForInfractionCount(2, 'bad_words_guard', { groupMode: 'observe' }).action, 'observe');
    assert.equal(actionForInfractionCount(2, 'bad_words_guard').action, 'observe');
    config.guardian.infractionKickThreshold = 13;

    assert.equal(actionForInfractionCount(2, 'bad_words_guard', { groupMode: 'active' }).action, 'warn');
    assert.equal(actionForInfractionCount(1, 'group_call_guard', { groupMode: 'active' }).action, 'warn');
    assert.equal(actionForInfractionCount(10, 'group_call_guard', { groupMode: 'active' }).action, 'warn');
    assert.equal(actionForInfractionCount(10, 'active_mute_attempt', { groupMode: 'active' }).action, 'delete');
    assert.equal(actionForInfractionCount(3, 'bad_words_guard', { groupMode: 'active' }).action, 'warn');
    assert.equal(actionForInfractionCount(5, 'bad_words_guard', { groupMode: 'active' }).action, 'warn');
    assert.equal(actionForInfractionCount(13, 'bad_words_guard', { groupMode: 'active' }).action, 'kick');
  } finally {
    config.dryRun = previous.globalDryRun;
    config.guardian.dryRun = previous.dryRun;
    config.guardian.observeOnly = previous.observeOnly;
    config.guardian.destructiveActions = previous.destructiveActions;
    config.guardian.infractionKickThreshold = previous.infractionKickThreshold;
  }
});

test('groupCallViolationFromEvent extracts group call offers only', () => {
  assert.equal(groupCallViolationFromEvent({ status: 'ringing', isGroup: true }), null);
  assert.equal(groupCallViolationFromEvent({ status: 'offer', isGroup: false }), null);
  assert.equal(groupCallViolationFromEvent({ status: 'offer', isGroup: true, chatId: 'private@s.whatsapp.net', from: 'user@s.whatsapp.net' }), null);

  assert.deepEqual(groupCallViolationFromEvent({
    id: 'call-1',
    status: 'offer',
    isGroup: true,
    chatId: '120363000000000000@g.us',
    from: 'user@s.whatsapp.net',
    isVideo: true,
    offline: false,
    date: new Date('2026-07-13T01:30:00.000Z')
  }), {
    callId: 'call-1',
    groupJid: '120363000000000000@g.us',
    callerJid: 'user@s.whatsapp.net',
    isVideo: true,
    offline: false,
    date: new Date('2026-07-13T01:30:00.000Z'),
    source: 'call_event'
  });
});

test('groupCallViolationFromMessage extracts call message fallback', () => {
  assert.equal(groupCallViolationFromMessage({
    key: { remoteJid: 'user@s.whatsapp.net', id: 'msg-1' },
    message: { call: { callKey: Buffer.from('abc') } }
  }), null);

  assert.deepEqual(groupCallViolationFromMessage({
    key: {
      remoteJid: '120363000000000000@g.us',
      participant: 'user@s.whatsapp.net',
      id: 'msg-2'
    },
    messageTimestamp: 1783900000,
    message: { call: { callKey: Buffer.from('call-2') } }
  }), {
    callId: Buffer.from('call-2').toString('hex'),
    groupJid: '120363000000000000@g.us',
    callerJid: 'user@s.whatsapp.net',
    isVideo: null,
    offline: false,
    date: new Date(1783900000 * 1000),
    source: 'message_call'
  });
});

test('rememberRecentGroupCallEvent keeps latest group call identity for manual close', () => {
  rememberRecentGroupCallEvent({
    id: 'manual-close-call-1',
    status: 'offer',
    isGroup: true,
    chatId: '120363manualclose@g.us',
    from: 'caller@s.whatsapp.net',
    isVideo: false,
    offline: false,
    date: new Date('2026-07-13T01:50:00.000Z')
  }, 1783900000000);

  rememberRecentGroupCallEvent({
    id: 'manual-close-call-1',
    status: 'transport',
    isGroup: true,
    chatId: '120363manualclose@g.us',
    date: new Date('2026-07-13T01:51:00.000Z')
  }, 1783900060000);

  const [latest] = recentGroupCallSnapshot();
  assert.equal(latest.callId, 'manual-close-call-1');
  assert.equal(latest.groupJid, '120363manualclose@g.us');
  assert.equal(latest.callerJid, 'caller@s.whatsapp.net');
  assert.equal(latest.status, 'transport');
});

test('rememberRecentGroupCallIdentity stores voice chat messages for manual close', () => {
  rememberRecentGroupCallIdentity({
    callId: 'voice-chat-message-1',
    groupJid: '120363voicechatmessage@g.us',
    callerJid: 'voice-message-starter@s.whatsapp.net',
    isVideo: false,
    offline: false,
    date: new Date('2026-07-13T02:35:00.000Z'),
    source: 'voice_chat_call_log',
    status: 'message_detected'
  }, 1783900500000);

  const [latest] = recentGroupCallSnapshot();
  assert.equal(latest.callId, 'voice-chat-message-1');
  assert.equal(latest.groupJid, '120363voicechatmessage@g.us');
  assert.equal(latest.callerJid, 'voice-message-starter@s.whatsapp.net');
  assert.equal(latest.source, 'voice_chat_call_log');
  assert.equal(latest.status, 'message_detected');
});

test('rememberRecentGroupCallIdentity keeps latest per group above other groups', () => {
  rememberRecentGroupCallIdentity({
    callId: 'voice-chat-other-group',
    groupJid: '120363othergroup@g.us',
    callerJid: 'other-starter@s.whatsapp.net',
    source: 'voice_chat_call_log'
  }, 1783900600000);

  rememberRecentGroupCallIdentity({
    callId: 'voice-chat-target-group',
    groupJid: '120363targetgroup@g.us',
    callerJid: 'target-starter@s.whatsapp.net',
    source: 'voice_chat_call_log'
  }, 1783900500000);

  const latestForTarget = resolveGroupCallForManualEnd({
    callId: 'latest',
    groupJid: '120363targetgroup@g.us'
  });
  assert.equal(latestForTarget.callId, 'voice-chat-target-group');
  assert.equal(latestForTarget.callerJid, 'target-starter@s.whatsapp.net');

  const latestForOther = resolveGroupCallForManualEnd({
    callId: 'latest',
    groupJid: '120363othergroup@g.us'
  });
  assert.equal(latestForOther.callId, 'voice-chat-other-group');
  assert.equal(latestForOther.callerJid, 'other-starter@s.whatsapp.net');
});

test('guardianCanExecuteActions requires all destructive guardrails to be active', () => {
  const previous = {
    globalDryRun: config.dryRun,
    dryRun: config.guardian.dryRun,
    observeOnly: config.guardian.observeOnly,
    destructiveActions: config.guardian.destructiveActions
  };

  try {
    config.dryRun = true;
    config.guardian.dryRun = false;
    config.guardian.observeOnly = false;
    config.guardian.destructiveActions = true;
    assert.equal(guardianCanExecuteActions({ groupMode: 'active' }), false);

    config.dryRun = false;
    config.guardian.dryRun = true;
    config.guardian.observeOnly = false;
    config.guardian.destructiveActions = true;
    assert.equal(guardianCanExecuteActions({ groupMode: 'active' }), false);

    config.guardian.dryRun = false;
    config.guardian.observeOnly = true;
    config.guardian.destructiveActions = true;
    assert.equal(guardianCanExecuteActions({ groupMode: 'active' }), false);

    config.guardian.dryRun = false;
    config.guardian.observeOnly = false;
    config.guardian.destructiveActions = true;
    assert.equal(guardianCanExecuteActions(), false);
    assert.equal(guardianCanExecuteActions({ groupMode: 'observe' }), false);
    assert.equal(guardianCanExecuteActions({ groupMode: 'soft' }), false);
    assert.equal(guardianCanExecuteActions({ groupMode: 'active' }), true);
  } finally {
    config.dryRun = previous.globalDryRun;
    config.guardian.dryRun = previous.dryRun;
    config.guardian.observeOnly = previous.observeOnly;
    config.guardian.destructiveActions = previous.destructiveActions;
  }
});
