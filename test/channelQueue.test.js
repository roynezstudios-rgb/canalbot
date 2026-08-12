import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queueItemContent,
  shouldBlockNewsletterMediaWithoutReadback
} from '../src/queue/channelQueue.js';

test('channel queue allows newsletter media after the newsletter upload patch', () => {
  assert.equal(shouldBlockNewsletterMediaWithoutReadback({
    channel_jid: '120363000000000000@newsletter',
    media_path: '/tmp/post.png',
    content_type: 'image'
  }), false);
});

test('channel queue still allows text-only newsletter posts', () => {
  assert.equal(shouldBlockNewsletterMediaWithoutReadback({
    channel_jid: '120363000000000000@newsletter',
    media_path: null,
    content_type: 'text'
  }), false);
});

test('channel queue permits captionless media posts', () => {
  assert.deepEqual(queueItemContent({
    channel_jid: 'chat@g.us',
    content_type: 'image',
    media_path: '/tmp/post.png',
    text_content: ''
  }), {
    image: { url: '/tmp/post.png' },
    mimetype: 'image/jpeg',
    caption: ''
  });
});

test('channel queue preserves image mime type for media posts', () => {
  assert.deepEqual(queueItemContent({
    channel_jid: 'chat@g.us',
    content_type: 'image',
    media_path: '/tmp/post.png',
    mime_type: 'image/png',
    text_content: 'caption'
  }), {
    image: { url: '/tmp/post.png' },
    mimetype: 'image/png',
    caption: 'caption'
  });
});
