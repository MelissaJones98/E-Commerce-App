// Tests for utils/money.js: converting prices between the API's text form
// ('24.50') and whole pence (2450).
// Run with: npm test (from the back-end folder). No database is needed.
//
// Why pence: JavaScript numbers can't hold most decimals exactly
// (0.1 + 0.2 = 0.30000000000000004), but whole numbers are always exact. So
// the API does money maths in whole pence, and Stripe wants pence anyway.

// node:test is Node's built-in test runner: `describe` groups tests, `test` is one test.
import { describe, test } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';

import { toPence, fromPence, isMoneyString } from '../utils/money.js';

describe('toPence', () => {
  test('turns a 2-decimal amount into whole pence', () => {
    assert.equal(toPence('24.50'), 2450);
    assert.equal(toPence('0.00'), 0);
    assert.equal(toPence('1234.05'), 123405);
  });

  // `for...of` runs the same test body for each bad value. assert.throws
  // passes only if the function inside it throws, here a TypeError.
  for (const bad of ['24.5', '24', '-1.00', 24.5, 'abc']) {
    test(`refuses ${JSON.stringify(bad)}`, () => {
      assert.throws(() => toPence(bad), TypeError);
    });
  }
});

describe('fromPence', () => {
  test('turns whole pence back into a 2-decimal amount', () => {
    assert.equal(fromPence(2845), '28.45');
    assert.equal(fromPence(5), '0.05');
    assert.equal(fromPence(0), '0.00');
  });
});

describe('isMoneyString', () => {
  test('is true only for text with exactly 2 decimal places', () => {
    assert.equal(isMoneyString('28.45'), true);
    assert.equal(isMoneyString(28.45), false);
    assert.equal(isMoneyString('28.4'), false);
  });
});
