import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicationInterval, publicationCommand } from '../src/publications/policy.js';

test('publication commands recognize the mixed-content capture workflow', () => {
  assert.deepEqual(publicationCommand('!pub iniciar'), { name: 'iniciar', args: '' });
  assert.deepEqual(publicationCommand('!pub cada 2h'), { name: 'cada', args: '2h' });
  assert.equal(publicationCommand('!publicar iniciar'), null);
});

test('publication intervals allow minutes, hours, and days but never seconds', () => {
  assert.deepEqual(parsePublicationInterval('2h'), { intervalSeconds: 7200, label: '2h' });
  assert.deepEqual(parsePublicationInterval('1d'), { intervalSeconds: 86400, label: '1d' });
  assert.equal(parsePublicationInterval('30s'), null);
  assert.equal(parsePublicationInterval('3m'), null);
});
