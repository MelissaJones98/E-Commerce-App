// Loading Stripe.js, the script that draws Stripe's card box (Stripe Elements) and talks to
// Stripe from the browser. It's loaded once, here, when the app starts, and the checkout page
// uses the result.
//
// It needs the PUBLISHABLE key (pk_test_...), from front-end/.env:
//   REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
// Create React App only passes variables starting with REACT_APP_ into the browser code, and
// only reads .env when `npm start` starts, so restart it after adding the key. A publishable key
// is safe to send to the browser: it can only START a payment, never take money (that needs the
// secret key, which stays on the server).

// loadStripe(key) fetches Stripe.js from Stripe's servers and resolves to the Stripe object.
import { loadStripe } from '@stripe/stripe-js';

// The key, or undefined if it isn't set.
const publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;

// True when a key is set, so card payments can work. The checkout page shows "Payments aren't
// available right now." instead of a card box when it's false.
// `Boolean(x)` is true for any non-empty text and false for undefined or ''.
export const paymentsAvailable = Boolean(publishableKey);

// A Promise of the Stripe object, or null without a key (loadStripe throws if given no key).
// Calling loadStripe here, outside any component, means it runs once, not on every re-draw.
export const stripePromise = paymentsAvailable ? loadStripe(publishableKey) : null;
