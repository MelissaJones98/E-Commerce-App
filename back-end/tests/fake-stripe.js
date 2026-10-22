// A pretend Stripe client for the tests, so `npm test` never contacts the real
// Stripe over the internet. services/payment-processor.js is handed this
// instead of the real client (with setStripeClient), and can't tell the
// difference: it has the same paymentIntents.create / capture / cancel methods
// the real `stripe` package has.
//
// It copies Stripe's own test PaymentMethod ids, so the tests read like real
// Stripe test mode:
//   pm_card_visa                    the money is held (status 'requires_capture')
//   pm_card_visa_chargeDeclined     the card is declined
//   pm_card_threeDSecure2Required   the card needs 3-D Secure, which we turn away
//   pm_fake_outage                  Stripe can't be reached (our own made-up id)
//   pm_fake_bad_request             Stripe refuses one of OUR parameters, not the card (made up)
//   anything else                   Stripe says there's no such PaymentMethod
// Tests can also set:
//   onCreate        a function run while the hold is "in progress", e.g. to change the cart
//                   behind checkout's back at exactly that moment
//   captureFails    capture throws
//   captureLost     capture throws, but the money WAS taken (the reply was lost on the way back)
//   cancelFails     cancel throws
// The errors it throws have the same `type` (and `code`) as the real Stripe
// library's errors, which is what payment-processor.js looks at.
//
// This file has no tests itself: `npm test` only runs files ending in .test.js.

// Makes an Error that looks like one of the stripe library's errors: a message,
// plus `type` and `code` properties. Object.assign copies those properties onto
// the new Error and returns it.
const stripeError = (type, code, message) => Object.assign(new Error(message), { type, code });

export const createFakeStripe = () => {
  // The fake itself. Tests read `calls` to check what was asked of Stripe, and
  // set captureFails / cancelFails to make those steps fail.
  const fake = {
    // Every call made, in order, e.g. { method: 'create', args: [{ amount: 2845, ... }] }.
    calls: [],
    onCreate: null,
    captureFails: false,
    captureLost: false,
    cancelFails: false,
    // How many PaymentIntents have been created, for numbering their ids.
    created: 0,
    // Whether the (one) payment has really been taken, for retrieve() to report.
    captured: false,
    paymentIntents: {
      // `...args` ("rest parameters") collects every argument into an array.
      // `async` makes each method return a Promise, like the real network calls.
      create: async (...args) => {
        fake.calls.push({ method: 'create', args });
        // Let a test do something while checkout is waiting for Stripe.
        if (fake.onCreate) await fake.onCreate();
        // The first argument is the parameters object; only payment_method decides the outcome.
        const { payment_method } = args[0];
        // `switch` compares one value against several cases, running the first that matches.
        switch (payment_method) {
          case 'pm_card_visa':
            fake.created += 1;
            // A successful hold: the money is reserved, waiting to be captured.
            return { id: `pi_fake_${fake.created}`, status: 'requires_capture' };
          case 'pm_card_visa_chargeDeclined':
            throw stripeError('StripeCardError', 'card_declined', 'Your card was declined.');
          case 'pm_card_threeDSecure2Required':
            throw stripeError(
              'StripeCardError',
              'authentication_required',
              'Your card was declined. This transaction requires authentication.'
            );
          case 'pm_fake_outage':
            throw stripeError('StripeConnectionError', undefined, 'An error occurred with our connection to Stripe.');
          case 'pm_fake_bad_request':
            // Stripe's errors say which parameter was wrong in `param`: here, ours (amount).
            throw Object.assign(
              stripeError('StripeInvalidRequestError', 'amount_too_small', 'Amount must be at least £0.30 gbp'),
              { param: 'amount' }
            );
          default:
            throw Object.assign(
              stripeError('StripeInvalidRequestError', 'resource_missing', `No such PaymentMethod: '${payment_method}'`),
              { param: 'payment_method' }
            );
        }
      },
      capture: async (...args) => {
        fake.calls.push({ method: 'capture', args });
        if (fake.captureFails) throw stripeError('StripeAPIError', undefined, 'Capture failed.');
        // Taken at Stripe, but the reply never arrives: the caller sees an error.
        fake.captured = true;
        if (fake.captureLost) throw stripeError('StripeConnectionError', undefined, 'Connection lost.');
        // The real call returns the PaymentIntent, now 'succeeded' (the money is taken).
        return { id: args[0], status: 'succeeded' };
      },
      // Looks a payment up: 'succeeded' once taken, otherwise still held.
      retrieve: async (...args) => {
        fake.calls.push({ method: 'retrieve', args });
        return { id: args[0], status: fake.captured ? 'succeeded' : 'requires_capture' };
      },
      cancel: async (...args) => {
        fake.calls.push({ method: 'cancel', args });
        if (fake.cancelFails) throw stripeError('StripeAPIError', undefined, 'Cancel failed.');
        // The hold is released: nothing is ever taken from the card.
        return { id: args[0], status: 'canceled' };
      },
    },
  };
  return fake;
};

// Puts a fake back to how it started (no calls, nothing set to fail), so one
// test's setup can't leak into the next. Used by tests/helpers.js.
export const resetFake = (fake) => {
  fake.calls = [];
  fake.onCreate = null;
  fake.captureFails = false;
  fake.captureLost = false;
  fake.cancelFails = false;
  fake.created = 0;
  fake.captured = false;
};
