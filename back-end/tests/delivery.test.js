// Tests for services/delivery.js: the delivery charge rule.
// Run with: npm test (from the back-end folder). No database is needed.
//
// The rule: delivery costs £3.95, and is free when the items come to £30.00
// or more (exactly £30.00 is free). An empty cart has nothing to deliver, so
// it costs nothing. Everything is in whole pence (see utils/money.js).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { deliveryChargePence } from '../services/delivery.js';

describe('deliveryChargePence', () => {
  test('an empty cart (0p of items) has no delivery charge', () => {
    assert.equal(deliveryChargePence(0), 0);
  });

  test('under £30.00 of items costs £3.95 (395p)', () => {
    assert.equal(deliveryChargePence(1), 395);
    assert.equal(deliveryChargePence(2999), 395);
  });

  test('exactly £30.00 of items is free', () => {
    assert.equal(deliveryChargePence(3000), 0);
  });

  test('over £30.00 of items is free', () => {
    assert.equal(deliveryChargePence(3001), 0);
  });
});
