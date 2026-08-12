import test from 'node:test';
import assert from 'node:assert/strict';
import { guardianWelcomeText, WELCOME_BLOCK_SIZE } from '../src/guardianbot/welcome.js';

test('guardianWelcomeText explains user commands and cadence', () => {
  const text = guardianWelcomeText({ preview: true });

  assert.match(text, /Ejemplo de bienvenida automática/);
  assert.match(text, new RegExp(`cada ${WELCOME_BLOCK_SIZE} nuevos integrantes`));
  assert.match(text, /XP/);
  assert.match(text, /Misiones/);
  assert.match(text, /Reportes/);
  assert.match(text, /!perfil o !yo/);
  assert.match(text, /!report respondiendo a un mensaje/);
  assert.match(text, /3 personas reportan/);
});
