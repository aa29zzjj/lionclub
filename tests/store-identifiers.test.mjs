import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validAppleTeamId } from '../scripts/lib/store-identifiers.mjs';

test('store readiness accepts only a 10-character Apple-generated Team ID shape', () => {
  assert.equal(validAppleTeamId('AB12CD34EF'), true);
  for (const input of [null, undefined, '', 'owner@example.test', 'AB12CD34E', 'AB12CD34EF0', ' AB12CD34EF', 'AB12CD34EF ', 'AB12-CD34E']) {
    assert.equal(validAppleTeamId(input), false);
  }
});
