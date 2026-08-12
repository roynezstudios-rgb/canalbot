import test from 'node:test';
import assert from 'node:assert/strict';
import { creatorMentionMessage, nextCreatorMentionAt } from '../src/creatorMention/policy.js';
import { creatorMentionSourceMessageId } from '../src/creatorMention/jobs.js';

test('creator mention cadence starts after one day and then becomes monthly', () => {
  const startedAt = new Date('2030-01-01T00:00:00.000Z');
  assert.equal(nextCreatorMentionAt({ mentionCount: 0, from: startedAt }).toISOString(), '2030-01-02T00:00:00.000Z');
  assert.equal(nextCreatorMentionAt({ mentionCount: 1, from: startedAt }).toISOString(), '2030-01-03T00:00:00.000Z');
  assert.equal(nextCreatorMentionAt({ mentionCount: 2, from: startedAt }).toISOString(), '2030-01-08T00:00:00.000Z');
  assert.equal(nextCreatorMentionAt({ mentionCount: 3, from: startedAt }).toISOString(), '2030-01-15T00:00:00.000Z');
  assert.equal(nextCreatorMentionAt({ mentionCount: 4, from: startedAt }).toISOString(), '2030-02-01T00:00:00.000Z');
  assert.equal(nextCreatorMentionAt({ mentionCount: 8, from: startedAt }).toISOString(), '2030-02-01T00:00:00.000Z');
});

test('creator mention is a short invitation with the configured channel link', () => {
  const message = creatorMentionMessage('https://whatsapp.com/channel/example');
  assert.match(message, /Únete/i);
  assert.match(message, /https:\/\/whatsapp\.com\/channel\/example/);
});

test('creator mention source IDs are stable and unique per scheduled appearance', () => {
  assert.equal(creatorMentionSourceMessageId({ id: 7, mention_count: 0 }), 'creator-mention:7:1');
  assert.equal(creatorMentionSourceMessageId({ id: 7, mention_count: 4 }), 'creator-mention:7:5');
});
