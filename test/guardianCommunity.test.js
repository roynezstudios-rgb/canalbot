import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { achievementHelpText, levelLabel, xpHelpText } from '../src/guardianbot/community/reputation.js';
import {
  localDateKeyForTimezone,
  renderDailyQuestion,
  shouldPublishDailyQuestionForSchedule
} from '../src/guardianbot/community/dailyQuestions.js';

test('levelLabel maps internal keys to user labels', () => {
  assert.equal(levelLabel('nuevo_miembro'), 'Nuevo miembro');
  assert.equal(levelLabel('participante'), 'Participante');
  assert.equal(levelLabel('colaborador'), 'Colaborador');
  assert.equal(levelLabel('destacado'), 'Destacado');
  assert.equal(levelLabel('leyenda'), 'Leyenda');
});

test('xpHelpText explains how XP is earned and level thresholds', () => {
  const text = xpHelpText();
  assert.match(text, /Mensaje valido: \+1 XP/);
  assert.match(text, /Respuesta directa: \+3 XP total/);
  assert.match(text, /Pregunta diaria: \+3 XP extra/);
  assert.match(text, new RegExp(`Limite diario: ${config.guardian.xpDailyCap} XP`));
  assert.match(text, /Participante: 25 XP/);
  assert.match(text, /Leyenda: 500 XP/);
  assert.match(text, /!perfil/);
});

test('renderDailyQuestion creates a reply-friendly prompt with options', () => {
  const text = renderDailyQuestion({
    question_text: 'Pregunta del dia 1: Que opcion eliges?',
    options_json: JSON.stringify(['Cafe', 'Te']),
    category: 'comida'
  });

  assert.match(text, /Pregunta diaria/);
  assert.match(text, /Pregunta del dia 1/);
  assert.match(text, /1\. Cafe/);
  assert.match(text, /2\. Te/);
  assert.match(text, /Responde directamente/);
});

test('localDateKeyForTimezone formats the local date for a group timezone', () => {
  assert.equal(
    localDateKeyForTimezone('America/Mexico_City', new Date('2026-07-13T03:00:00.000Z')),
    '2026-07-12'
  );
});

test('shouldPublishDailyQuestionForSchedule only publishes near opening time', () => {
  const schedule = {
    open_time: '08:00:00',
    close_time: '22:00:00',
    timezone: 'America/Mexico_City',
    active_days: '1,2,3,4,5,6,7'
  };

  assert.equal(shouldPublishDailyQuestionForSchedule(schedule, {
    now: new Date('2026-07-13T14:30:00.000Z'),
    afterOpenMinutes: 60
  }), true);
  assert.equal(shouldPublishDailyQuestionForSchedule(schedule, {
    now: new Date('2026-07-14T03:50:00.000Z'),
    afterOpenMinutes: 60
  }), false);
});

test('achievementHelpText explains badges and includes earned badges', () => {
  const text = achievementHelpText({
    available: [
      { achievement_key: 'primer_paso', name: 'Primer paso', description: 'Primer aporte valido registrado.', config_json: { xp_required: 1 } },
      { achievement_key: 'colaborador_activo', name: 'Colaborador activo', description: 'Alcanzo 150 XP en el grupo.', config_json: { xp_required: 150 } }
    ],
    earned: [
      { achievement_key: 'primer_paso', name: 'Primer paso' }
    ]
  });

  assert.match(text, /Insignias GuardianBot/);
  assert.match(text, /Se ganan automaticamente/);
  assert.match(text, /una sola vez por grupo/);
  assert.match(text, /Disponibles/);
  assert.match(text, /🌱 Primer paso: Primer aporte valido registrado\. Requisito: 1 XP\./);
  assert.match(text, /🤝 Colaborador activo: Alcanzo 150 XP en el grupo\. Requisito: 150 XP\./);
  assert.match(text, /Tus insignias/);
  assert.match(text, /🌱 Primer paso/);
});
