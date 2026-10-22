// Taking payments through Stripe (in TEST MODE: no real money ever moves).
// This is the only file that talks to Stripe. routes/checkout.js calls the
// three functions below and reacts to what they report.
//
// "Hold, then take": checkout pays in two steps, like a hotel or a petrol pump.
//   1. holdPayment     asks the card's bank to RESERVE the money. Nothing is taken yet.
//   2. capturePayment  TAKES the reserved money, once the order has been written.
//   cancelPayment      RELEASES the hold instead, if anything went wrong in between.
// So if saving the order fails, the hold is cancelled and the customer is never
// charged, without needing a refund.
//
// SECURITY: card details never reach this server. The customer's browser sends
// them straight to Stripe (Stripe Elements), and we only receive a
// PaymentMethod id (e.g. 'pm_1Q...') that stands in for the card. The secret
// key (STRIPE_SECRET_KEY in back-end/.env) is never logged or sent anywhere
// except to Stripe.

// The official Stripe library. `Stripe` is a class: `new Stripe(key)` makes a
// client whose methods call Stripe's API over the internet.
import Stripe from 'stripe';

// A custom error type for "Stripe itself failed" (it couldn't be reached, was
// down, or our key is missing or wrong). `class ... extends Error` creates a
// new kind of error that behaves like a normal Error but can be told apart with
// `instanceof`. The checkout route uses this to reply 502 (a service we rely on
// failed) instead of 500 (a bug in our own code).
export class PaymentProcessorError extends Error {
  constructor(message) {
    // super(message) runs the normal Error setup, which stores the message.
    super(message);
    this.name = 'PaymentProcessorError';
  }
}

// What the customer is told, for the outcomes where Stripe's own wording isn't right.
const NEEDS_AUTHENTICATION =
  "This card needs extra verification, which isn't supported. Please use a different card.";
const NOT_ACCEPTED = "Your payment details weren't accepted. Please re-enter your card.";

// The Stripe client in use. It starts empty (null) and is created the first
// time it's needed (see getStripe), so the app can start without a key: only
// checkout fails, like the optional Google and Facebook keys.
let client = null;

// Tests call this to hand in a pretend client (tests/fake-stripe.js), so they
// never contact the real Stripe. setStripeClient(null) goes back to the real one.
export const setStripeClient = (newClient) => {
  client = newClient;
};

// Returns the client, creating the real one the first time if no pretend one
// was handed in. Throws PaymentProcessorError if there's no key to create it with.
const getStripe = () => {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentProcessorError('STRIPE_SECRET_KEY is not set');
  client = new Stripe(key);
  return client;
};

// Turns an error from Stripe into a PaymentProcessorError, logging what went
// wrong for whoever runs the server. Only the error's type and message are
// logged: Stripe's errors never contain our key or the customer's card.
const processorError = (action, err) => {
  console.error(`Stripe ${action} failed:`, err.type ?? err.name, err.message);
  return new PaymentProcessorError(`Stripe ${action} failed`);
};

// Step 1: hold `amountPence` on the card that `paymentMethodId` stands for.
// Resolves to one of:
//   { status: 'held', paymentIntentId }  the money is reserved; keep the id for steps 2 / cancel
//   { status: 'declined', reason }       the card's bank said no (checkout replies 402)
//   { status: 'rejected', reason }       Stripe didn't accept the PaymentMethod id (checkout replies 400)
// Throws PaymentProcessorError if Stripe itself failed (checkout replies 502).
// A decline is a normal outcome, not a failure, so it's returned rather than thrown.
export const holdPayment = async ({ amountPence, paymentMethodId, customerId }) => {
  try {
    // A PaymentIntent is Stripe's record of one payment. Creating it with
    // confirm: true attempts the payment straight away, in the same call.
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountPence, // in pence: 2845 means £28.45
      currency: 'gbp',
      payment_method: paymentMethodId,
      confirm: true,
      // 'manual' = hold only. The money is taken later, by capturePayment.
      capture_method: 'manual',
      // Cards only. (In this Stripe API version, allowed_payment_method_types
      // replaces the older payment_method_types.) Cards never redirect the
      // customer to another site, so no return_url is needed.
      allowed_payment_method_types: ['card'],
      // If the bank wants an extra check (3-D Secure), fail now instead of
      // waiting for the customer to complete it, which this shop doesn't support.
      error_on_requires_action: true,
      // Extra information shown in the Stripe dashboard, to find the payment later.
      description: 'Melsy Mart order',
      metadata: { customer_id: String(customerId) },
    });
    return { status: 'held', paymentIntentId: paymentIntent.id };
  } catch (err) {
    // `err.type` says what kind of Stripe error it is.
    if (err.type === 'StripeCardError') {
      // The card was declined. 'authentication_required' means it needed 3-D
      // Secure; otherwise Stripe's message is safe to show the customer.
      const reason = err.code === 'authentication_required' ? NEEDS_AUTHENTICATION : err.message;
      return { status: 'declined', reason };
    }
    // Stripe refused a parameter. `err.param` names which one. Only a problem with the
    // PaymentMethod (e.g. an id that doesn't exist, or was already used) is the customer's to
    // fix by re-entering their card. Any other parameter (such as an amount below Stripe's
    // minimum) is OUR mistake, so it falls through to the logged 502 below.
    if (err.type === 'StripeInvalidRequestError' && err.param === 'payment_method') {
      return { status: 'rejected', reason: NOT_ACCEPTED };
    }
    // Anything else (no connection, Stripe down, a bad key, too many requests)
    // isn't the customer's fault. getStripe's own PaymentProcessorError (no
    // key) is passed on as it is.
    if (err instanceof PaymentProcessorError) throw err;
    throw processorError('hold', err);
  }
};

// Step 2: take the money that holdPayment reserved.
// Throws PaymentProcessorError if the money wasn't taken.
//
// An error doesn't always mean the money wasn't taken: Stripe may have taken it, and only its
// reply was lost on the way back. Treating that as a failure would make checkout cancel (which
// then fails, because it's already taken) and save no order, so the customer would be charged
// for nothing. So after an error, ask Stripe for the payment's status: 'succeeded' means the
// money was taken, which counts as success.
export const capturePayment = async (paymentIntentId) => {
  try {
    await getStripe().paymentIntents.capture(paymentIntentId);
  } catch (err) {
    // retrieve() can fail too (e.g. Stripe is still unreachable). `.catch(() => null)` turns
    // that into null, so `?.status` below gives undefined and the capture counts as failed.
    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId).catch(() => null);
    if (paymentIntent?.status === 'succeeded') return;
    throw processorError('capture', err);
  }
};

// Instead of step 2: release the hold, so nothing is ever taken from the card.
// Throws PaymentProcessorError if Stripe fails. (A hold that's never captured
// also expires by itself after about 7 days.)
export const cancelPayment = async (paymentIntentId) => {
  try {
    await getStripe().paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    throw processorError('cancel', err);
  }
};
