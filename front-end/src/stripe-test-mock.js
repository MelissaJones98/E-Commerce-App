// Stand-ins for the Stripe packages, used by every test (setupTests.js swaps them in with
// jest.mock). The real ones would load Stripe.js from Stripe's servers and draw a card box in an
// iframe, neither of which works in the tests' fake browser. Only test files use this file.
//
// mockStripe plays the Stripe object. Tests set:
//   mockStripe.createPaymentMethod   a jest.fn(), e.g. to resolve { paymentMethod: { id } } or
//                                    { error: { message } }, the two shapes Stripe really returns
//   mockStripe.unavailable = true    to act as if there were no publishable key
// resetMockStripe() puts both back after every test.

// `React.createElement` makes an element without JSX (this file avoids JSX on purpose, because
// jest.mock factories run before the usual imports are ready). A fragment groups children.
const React = require('react');

export const mockStripe = {
  createPaymentMethod: jest.fn(),
  unavailable: false,
};

export function resetMockStripe() {
  mockStripe.createPaymentMethod = jest.fn();
  mockStripe.unavailable = false;
}

// The stand-in for '@stripe/react-stripe-js'.
export const reactStripeMock = {
  // <Elements> just draws what's inside it.
  Elements: ({ children }) => React.createElement(React.Fragment, null, children),
  // The card box: an empty placeholder the tests can find by its data-testid.
  CardElement: () => React.createElement('div', { 'data-testid': 'card-element' }),
  // useStripe() gives the Stripe object, or null when there isn't one.
  useStripe: () => (mockStripe.unavailable ? null : mockStripe),
  // useElements().getElement(CardElement) gives the card box; 'card' stands in for it, so a test
  // can check it was passed to createPaymentMethod.
  useElements: () => ({ getElement: () => 'card' }),
};

// The stand-in for src/stripe.js. Getters ("get name() {...}") are worked out each time they're
// read, so a test that sets mockStripe.unavailable changes what the page sees.
export const stripeModuleMock = {
  get paymentsAvailable() {
    return !mockStripe.unavailable;
  },
  get stripePromise() {
    return mockStripe.unavailable ? null : Promise.resolve(mockStripe);
  },
};
