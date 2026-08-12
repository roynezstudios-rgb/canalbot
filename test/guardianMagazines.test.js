import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMagazine } from '../src/guardianbot/magazines/generator.js';

test('renderMagazine creates compact weekly text', () => {
  const text = renderMagazine({
    type: 'weekly',
    period: '2026-07-06',
    stats: {
      messages: 10,
      stickers: 2,
      reports: 0,
      spam: 0,
      topUsers: [{ display_name: 'Roy', user_jid: 'roy@s.whatsapp.net', xp: 50 }]
    }
  });
  assert.match(text, /Revista semanal/);
  assert.match(text, /Mensajes: 10/);
  assert.match(text, /Roy: 50 XP/);
  assert.match(text, /Salud del grupo: tranquila/);
});
