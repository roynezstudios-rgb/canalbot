import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLinkGuard } from '../src/rules/linkGuard.js';

test('link guard blocks unauthorized URLs in observe path', () => {
  const result = evaluateLinkGuard({ text: 'mira https://spam.example/test' });
  assert.equal(result.matched, true);
  assert.equal(result.allowed, false);
  assert.equal(result.recommendedAction, 'delete');
});

test('link guard allows whitelisted domains and admins', () => {
  assert.equal(evaluateLinkGuard({
    text: 'https://deformitos.com',
    whitelistDomains: ['deformitos.com']
  }).allowed, true);
  assert.equal(evaluateLinkGuard({
    text: 'https://example.com',
    senderIsAdmin: true
  }).allowed, true);
});

test('link guard does not allow domains that only contain a whitelisted name', () => {
  const result = evaluateLinkGuard({
    text: 'https://deformitos.com.evil.example/path',
    whitelistDomains: ['deformitos.com']
  });

  assert.equal(result.matched, true);
  assert.equal(result.allowed, false);
  assert.equal(result.recommendedAction, 'delete');
});
