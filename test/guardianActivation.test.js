import test from 'node:test';
import assert from 'node:assert/strict';
import { nextActivationStage } from '../src/guardianbot/activation/readiness.js';
import { normalizeGuardianCommand } from '../src/guardianbot/index.js';

test('nextActivationStage advances controlled stages', () => {
  assert.equal(nextActivationStage('observe'), 'delete');
  assert.equal(nextActivationStage('delete'), 'mute');
  assert.equal(nextActivationStage('mute'), 'kick');
  assert.equal(nextActivationStage('kick'), 'completed');
  assert.equal(nextActivationStage('unknown'), 'observe');
});

test('normalizeGuardianCommand accepts natural GuardianBot wording', () => {
  assert.deepEqual(
    normalizeGuardianCommand({ name: 'guardian', rawName: 'guardián', args: 'bot on' }),
    { name: 'guardian', rawName: 'guardián', args: 'on' }
  );
  assert.deepEqual(
    normalizeGuardianCommand({ name: 'guardian', rawName: 'guardianbot', args: 'estado' }),
    { name: 'guardian', rawName: 'guardianbot', args: 'estado' }
  );
});
