import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScheduleState,
  closeWarningText,
  expectedScheduleState,
  scheduleGroupSettingForState,
  scheduleTransitionText,
  shouldSendScheduleCloseWarning
} from '../src/guardianbot/admin/schedules.js';

test('expectedScheduleState returns a valid state for normal schedule', () => {
  const state = expectedScheduleState({
    open_time: '00:00:00',
    close_time: '23:59:00',
    timezone: 'UTC',
    active_days: '1,2,3,4,5,6,7'
  });
  assert.match(state, /^(open|closed)$/);
});

test('expectedScheduleState closes inactive days', () => {
  const state = expectedScheduleState({
    open_time: '00:00:00',
    close_time: '23:59:00',
    timezone: 'UTC',
    active_days: '8'
  });
  assert.equal(state, 'closed');
});

test('scheduleTransitionText uses configured messages and fallbacks', () => {
  assert.equal(
    scheduleTransitionText({ open_message: 'Abrimos', close_message: 'Cerramos' }, 'open'),
    'Abrimos'
  );
  assert.match(
    scheduleTransitionText({ open_message: null, close_message: null }, 'closed'),
    /horario cerrado/
  );
});

test('scheduleGroupSettingForState maps schedule state to WhatsApp group setting', () => {
  assert.equal(scheduleGroupSettingForState('open'), 'not_announcement');
  assert.equal(scheduleGroupSettingForState('closed'), 'announcement');
});

test('applyScheduleState executes WhatsApp group setting update', async () => {
  const calls = [];
  const result = await applyScheduleState({
    sock: {
      groupSettingUpdate: async (jid, setting) => {
        calls.push({ jid, setting });
      }
    },
    schedule: { group_jid: '120363schedule@g.us' },
    expectedState: 'closed'
  });

  assert.equal(result.ok, true);
  assert.equal(result.setting, 'announcement');
  assert.deepEqual(calls, [{
    jid: '120363schedule@g.us',
    setting: 'announcement'
  }]);
});

test('shouldSendScheduleCloseWarning is due once within 20 minutes before close', () => {
  const result = shouldSendScheduleCloseWarning({
    group_jid: '120363schedule@g.us',
    open_time: '08:00:00',
    close_time: '22:00:00',
    timezone: 'America/Mexico_City',
    active_days: '1,2,3,4,5,6,7',
    expected_state: 'open',
    last_close_warning_key: null
  }, {
    nowParts: { day: 1, minutes: 21 * 60 + 40, year: 2026, month: 7, date: 13 }
  });

  assert.equal(result.due, true);
  assert.equal(result.minutesUntilClose, 20);
  assert.equal(result.warningKey, '2026-07-13T22:00:00#20');
  assert.equal(result.warningMinutes, 20);
});

test('shouldSendScheduleCloseWarning does not repeat an already sent warning', () => {
  const result = shouldSendScheduleCloseWarning({
    group_jid: '120363schedule@g.us',
    open_time: '08:00:00',
    close_time: '22:00:00',
    timezone: 'America/Mexico_City',
    active_days: '1,2,3,4,5,6,7',
    expected_state: 'open',
    last_close_warning_key: '2026-07-13T22:00:00#20'
  }, {
    nowParts: { day: 1, minutes: 21 * 60 + 45, year: 2026, month: 7, date: 13 }
  });

  assert.equal(result.due, false);
  assert.equal(result.reason, 'already_warned');
});

test('shouldSendScheduleCloseWarning accepts old 20 minute warning keys', () => {
  const result = shouldSendScheduleCloseWarning({
    group_jid: '120363schedule@g.us',
    open_time: '08:00:00',
    close_time: '22:00:00',
    timezone: 'America/Mexico_City',
    active_days: '1,2,3,4,5,6,7',
    expected_state: 'open',
    last_close_warning_key: '2026-07-13T22:00:00'
  }, {
    nowParts: { day: 1, minutes: 21 * 60 + 45, year: 2026, month: 7, date: 13 }
  });

  assert.equal(result.due, false);
  assert.equal(result.reason, 'already_warned');
  assert.equal(result.warningKey, '2026-07-13T22:00:00#20');
});

test('shouldSendScheduleCloseWarning sends the 5 minute warning after the 20 minute warning', () => {
  const result = shouldSendScheduleCloseWarning({
    group_jid: '120363schedule@g.us',
    open_time: '08:00:00',
    close_time: '22:00:00',
    timezone: 'America/Mexico_City',
    active_days: '1,2,3,4,5,6,7',
    expected_state: 'open',
    last_close_warning_key: '2026-07-13T22:00:00#20'
  }, {
    nowParts: { day: 1, minutes: 21 * 60 + 55, year: 2026, month: 7, date: 13 }
  });

  assert.equal(result.due, true);
  assert.equal(result.minutesUntilClose, 5);
  assert.equal(result.warningMinutes, 5);
  assert.equal(result.warningKey, '2026-07-13T22:00:00#5');
});

test('shouldSendScheduleCloseWarning handles schedules that close after midnight', () => {
  const result = shouldSendScheduleCloseWarning({
    group_jid: '120363schedule@g.us',
    open_time: '22:00:00',
    close_time: '01:00:00',
    timezone: 'America/Mexico_City',
    active_days: '1,2,3,4,5,6,7',
    expected_state: 'open',
    last_close_warning_key: null
  }, {
    nowParts: { day: 2, minutes: 40, year: 2026, month: 7, date: 14 }
  });

  assert.equal(result.due, true);
  assert.equal(result.minutesUntilClose, 20);
  assert.equal(result.warningKey, '2026-07-14T01:00:00#20');
});

test('closeWarningText explains that only admins will be able to write', () => {
  assert.match(closeWarningText({}, 20), /20 minutos/);
  assert.match(closeWarningText({}, 20), /solo admins/i);
});
