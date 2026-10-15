// A FAKE payment processor, standing in for a real one (Stripe) until
// payments are added in a later ticket. No money ever moves.
//
// It behaves like Stripe's test mode, so checkout can be tested against every
// outcome without mocking anything:
//   4242 4242 4242 4242  -> the payment succeeds
//   4000 0000 0000 0002  -> the card is declined
//   4000 0000 0000 0119  -> the processor itself fails (e.g. an outage)
//   any other valid card -> the payment succeeds
//
// When Stripe arrives, only this file should need replacing: routes/checkout.js
// just calls processPayment() and reacts to its three possible outcomes.
//
// SECURITY NOTE: this fake receives raw card numbers. A real shop should
// never let full card numbers reach its own server; with Stripe, the
// customer's browser sends card details straight to Stripe, and our server
// only ever sees a token that stands in for them.

// randomUUID() makes a random unique id, used for the fake transaction id.
import { randomUUID } from 'node:crypto';

// The special test card numbers (digits only, no spaces).
const DECLINED_CARD = '4000000000000002';
const PROCESSOR_ERROR_CARD = '4000000000000119';

// A custom error type for "the payment processor itself failed".
// `class ... extends Error` creates a new kind of error that behaves like a
// normal Error but can be told apart with `instanceof`. The checkout route
// uses this to reply 502 (a service we rely on failed) instead of 500 (a bug
// in our own code).
export class PaymentProcessorError extends Error {
  constructor(message) {
    // super(message) runs the normal Error setup, which stores the message.
    super(message);
    this.name = 'PaymentProcessorError';
  }
}

// Attempts to charge a card.
// `amount` is the total as a string, e.g. '41.00'; `cardNumber` is digits only.
// Returns a result object:
//   { succeeded: true,  transactionId: 'fake_...' }  the charge went through
//   { succeeded: false, reason: '...' }              the card was declined
// Throws PaymentProcessorError if the processor itself fails.
//
// It's `async` (returns a Promise) because a real processor is reached over
// the network, so callers already `await` it the way they will for Stripe.
export const processPayment = async ({ amount, cardNumber }) => {
  if (cardNumber === PROCESSOR_ERROR_CARD) {
    // `throw` stops this function and passes the error up to whoever called it.
    throw new PaymentProcessorError('The payment processor is unavailable');
  }

  if (cardNumber === DECLINED_CARD) {
    // A decline is a normal outcome, not an error: the processor worked, but
    // the card's bank said no. So it's returned rather than thrown.
    return { succeeded: false, reason: 'Your card was declined' };
  }

  // Every other card "succeeds". A real processor would charge `amount` here.
  // (`amount` is unused by the fake, but kept so the call looks like the real thing.)
  return { succeeded: true, transactionId: `fake_${randomUUID()}` };
};
