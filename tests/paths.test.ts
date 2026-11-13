import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withBase } from '../src/lib/paths.ts';

test('withBase', () => {
  assert.equal(withBase('/deutsch-for-japanese/', 'review/'), '/deutsch-for-japanese/review/');
  assert.equal(withBase('/deutsch-for-japanese', '/review/'), '/deutsch-for-japanese/review/');
  assert.equal(withBase('/', 'review/'), '/review/');
  assert.equal(withBase('/', ''), '/');
});
