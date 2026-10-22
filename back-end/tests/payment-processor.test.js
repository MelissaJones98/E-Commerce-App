// Tests for services/payment-processor.js: holding, taking (capturing) and
// cancelling payments through Stripe.
// Run with: npm test (from the back-end folder). No database is needed.
//
// The real Stripe is never contacted: each test hands the service a pretend
// Stripe client (tests/fake-stripe.js) with setStripeClient(), and then checks
// what the service asked Stripe to do and how it reported the outcome.

import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  holdPayment,
  capturePayment,
  cancelPayment,
  setStripeClient,
  PaymentProcessorError,
} from '../services/payment-processor.js';
import { createFakeStripe } from './fake-stripe.js';

// A fresh fake for every test. `let` because beforeEach replaces it.
let fake;
beforeEach(() => {
  fake = createFakeStripe();
  setStripeClient(fake);
});
// Afterwards, go back to the real client (setStripeClient(null)), so this file
// leaves nothing behind.
after(() => setStripeClient(null));

// The arguments for a hold of £28.45 with the given PaymentMethod.
const hold = (paymentMethodId) => holdPayment({ amountPence: 2845, paymentMethodId, customerId: 1 });

describe('holdPayment', () => {
  test('holds the money and returns the PaymentIntent id', async () => {
    const result = await hold('pm_card_visa');

    assert.deepEqual(result, { status: 'held', paymentIntentId: 'pi_fake_1' });
    // What was asked of Stripe: one create call. Only the parameters that
    // matter are checked, so harmless extras (like a description) are allowed.
    assert.equal(fake.calls.length, 1);
    const [params] = fake.calls[0].args;
    assert.equal(params.amount, 2845);
    assert.equal(params.currency, 'gbp');
    assert.equal(params.payment_method, 'pm_card_visa');
    assert.equal(params.confirm, true);
    // 'manual' means hold only: the money is taken later, by capturePayment.
    assert.equal(params.capture_method, 'manual');
    // Fail straight away (instead of waiting) if the card needs 3-D Secure.
    assert.equal(params.error_on_requires_action, true);
  });

  test('reports a declined card with Stripe\'s reason', async () => {
    assert.deepEqual(await hold('pm_card_visa_chargeDeclined'), {
      status: 'declined',
      reason: 'Your card was declined.',
    });
  });

  test('turns away a card that needs 3-D Secure, with a friendly reason', async () => {
    assert.deepEqual(await hold('pm_card_threeDSecure2Required'), {
      status: 'declined',
      reason: "This card needs extra verification, which isn't supported. Please use a different card.",
    });
  });

  test('rejects a PaymentMethod id that Stripe does not recognise', async () => {
    assert.deepEqual(await hold('pm_does_not_exist'), {
      status: 'rejected',
      reason: "Your payment details weren't accepted. Please re-enter your card.",
    });
  });

  // A refusal about one of OUR parameters (e.g. an amount below Stripe's minimum) isn't the
  // customer's card at all, so telling them to re-enter it would be wrong: it's a 502, and logged.
  test('throws PaymentProcessorError when Stripe refuses one of our own parameters', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});

    await assert.rejects(hold('pm_fake_bad_request'), PaymentProcessorError);
    // Logged for whoever runs the shop, with Stripe's explanation.
    assert.equal(logged.mock.calls.length, 1);
  });

  test('throws PaymentProcessorError when Stripe cannot be reached', async () => {
    // assert.rejects passes only if the Promise fails with that kind of error.
    await assert.rejects(hold('pm_fake_outage'), PaymentProcessorError);
  });

  test('throws PaymentProcessorError when no Stripe key is set', async () => {
    // Go back to the real client, with the key removed, then put the key back
    // afterwards (finally always runs), so the other tests aren't affected.
    setStripeClient(null);
    const savedKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      await assert.rejects(hold('pm_card_visa'), PaymentProcessorError);
    } finally {
      // Only restore it if there was one: assigning undefined would store the text 'undefined'.
      if (savedKey !== undefined) process.env.STRIPE_SECRET_KEY = savedKey;
    }
  });
});

describe('capturePayment', () => {
  test('takes the held money', async () => {
    await capturePayment('pi_fake_1');

    assert.deepEqual(fake.calls, [{ method: 'capture', args: ['pi_fake_1'] }]);
  });

  test('throws PaymentProcessorError when Stripe fails', async () => {
    fake.captureFails = true;
    await assert.rejects(capturePayment('pi_fake_1'), PaymentProcessorError);
  });

  // The reply to "take the money" can be lost even though Stripe DID take it. Cancelling then
  // would fail, and the customer would be charged with no order. So after an error, look the
  // payment up: if it's 'succeeded', the money was taken, and that counts as success.
  test('counts a capture as done when the reply was lost but Stripe took the money', async () => {
    fake.captureLost = true;

    // Resolves (no error), so checkout carries on and saves the order.
    await capturePayment('pi_fake_1');

    assert.deepEqual(
      fake.calls.map((call) => call.method),
      ['capture', 'retrieve']
    );
  });
});

describe('cancelPayment', () => {
  test('releases the hold', async () => {
    await cancelPayment('pi_fake_1');

    assert.deepEqual(fake.calls, [{ method: 'cancel', args: ['pi_fake_1'] }]);
  });

  test('throws PaymentProcessorError when Stripe fails', async () => {
    fake.cancelFails = true;
    await assert.rejects(cancelPayment('pi_fake_1'), PaymentProcessorError);
  });
});
