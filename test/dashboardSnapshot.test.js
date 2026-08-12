import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmChannelAdmin,
  dashboardSnapshot,
  getCampaignById
} from '../src/db/dashboard.js';
import { setCampaignStatus } from '../src/db/campaigns.js';

function queryPool(resultSets) {
  let index = 0;
  return {
    async query() {
      return [resultSets[index++]];
    }
  };
}

test('dashboard snapshot normalizes MySQL counters, booleans, and active totals', async () => {
  const pool = queryPool([
    [{ session_name: 'main', status: 'connected' }],
    [{ published_count: '8', queued_count: '3', failed_count: null, next_scheduled_at: '2026-08-13T09:00:00.000Z' }],
    [{ channel_jid: 'one@newsletter', name: 'Uno', enabled: 1, queued_count: '2', published_count: '8', failed_count: null }],
    [
      { id: 1, status: 'running', pending_count: '5', queued_count: '1', published_count: '2', failed_count: '0', text_count: '3', image_count: '2', video_count: null, total_count: '7' },
      { id: 2, status: 'waiting', pending_count: '4', queued_count: null, published_count: '1', failed_count: '1', text_count: '1', image_count: '2', video_count: '2', total_count: '5' },
      { id: 3, status: 'paused', pending_count: '9', queued_count: '0', published_count: '0', failed_count: '0', text_count: '9', image_count: '0', video_count: '0', total_count: '9' }
    ],
    [{ id: 10, status: 'queued' }],
    [{ action_key: 'publication_queued_from_dashboard' }],
    [{ chat_jid: 'control@g.us', name: 'Mesa' }]
  ]);

  const snapshot = await dashboardSnapshot(pool);
  assert.equal(snapshot.summary.published, 8);
  assert.equal(snapshot.summary.queued, 3);
  assert.equal(snapshot.summary.failed, 0);
  assert.equal(snapshot.summary.activeCampaigns, 2);
  assert.equal(snapshot.summary.campaignStock, 18);
  assert.equal(snapshot.channels[0].enabled, true);
  assert.equal(snapshot.channels[0].queued_count, 2);
  assert.equal(snapshot.channels[0].failed_count, 0);
  assert.equal(snapshot.campaigns[0].total_count, 7);
  assert.equal(snapshot.campaigns[0].video_count, 0);
  assert.equal(snapshot.queue[0].id, 10);
  assert.equal(snapshot.actions[0].action_key, 'publication_queued_from_dashboard');
  assert.equal(snapshot.controlChat.chat_jid, 'control@g.us');
});

test('dashboard snapshot returns stable empty-state values', async () => {
  const snapshot = await dashboardSnapshot(queryPool([[], [], [], [], [], [], []]));
  assert.equal(snapshot.session, null);
  assert.equal(snapshot.controlChat, null);
  assert.deepEqual(snapshot.summary, {
    published: 0,
    queued: 0,
    failed: 0,
    nextScheduledAt: null,
    activeCampaigns: 0,
    campaignStock: 0
  });
  assert.deepEqual(snapshot.channels, []);
  assert.deepEqual(snapshot.campaigns, []);
  assert.deepEqual(snapshot.queue, []);
  assert.deepEqual(snapshot.actions, []);
});

test('dashboard persistence helpers use bound parameters and report missing rows', async () => {
  const calls = [];
  const adminPool = {
    async execute(sql, params) {
      calls.push({ sql, params });
      return [{}];
    }
  };
  await confirmChannelAdmin('one@newsletter', adminPool);
  assert.match(calls[0].sql, /admin_confirmed_at=UTC_TIMESTAMP\(\)/);
  assert.deepEqual(calls[0].params, { channelJid: 'one@newsletter' });

  const found = await getCampaignById(9, {
    async execute(_sql, params) {
      assert.deepEqual(params, { id: 9 });
      return [[{ id: 9, status: 'paused' }]];
    }
  });
  assert.deepEqual(found, { id: 9, status: 'paused' });

  const missing = await getCampaignById(10, { async execute() { return [[]]; } });
  assert.equal(missing, null);
});

test('campaign status persistence reports whether one row changed', async () => {
  const calls = [];
  const changed = await setCampaignStatus({ campaignId: 7, status: 'paused', error: null }, {
    async execute(sql, params) {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  });
  assert.equal(changed, true);
  assert.match(calls[0].sql, /UPDATE wa_campaigns SET status=:status/);
  assert.deepEqual(calls[0].params, { campaignId: 7, status: 'paused', error: null });

  const unchanged = await setCampaignStatus({ campaignId: 99, status: 'running' }, {
    async execute() {
      return [{ affectedRows: 0 }];
    }
  });
  assert.equal(unchanged, false);
});
