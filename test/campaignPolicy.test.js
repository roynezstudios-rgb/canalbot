import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCampaignCreate, campaignDueToday } from '../src/campaigns/policy.js';

test('campaign creation accepts a stable name, daily time, and timezone', () => {
  assert.deepEqual(parseCampaignCreate('FraseDelDia 09:30 America/Mexico_City'), {
    name: 'FraseDelDia', time: '09:30', timezone: 'America/Mexico_City'
  });
  assert.equal(parseCampaignCreate('FraseDelDia 25:00'), null);
});

test('campaign becomes due once after its local daily time', () => {
  const campaign = { schedule_time: '09:00', timezone: 'UTC', last_due_date: null };
  assert.equal(campaignDueToday(campaign, new Date('2030-01-01T08:59:00.000Z')), false);
  assert.equal(campaignDueToday(campaign, new Date('2030-01-01T09:00:00.000Z')), true);
  assert.equal(campaignDueToday({ ...campaign, last_due_date: '2030-01-01' }, new Date('2030-01-01T12:00:00.000Z')), false);
});
