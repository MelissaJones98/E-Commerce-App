// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
// This file runs before every test file. `import '...'` with no names is a "side-effect import":
// it runs the module just for what it does (here, adding the matchers), without taking anything.
import '@testing-library/jest-dom';

// React Router uses TextEncoder/TextDecoder (built-in text <-> bytes converters). Browsers and
// Node have them, but the fake browser (jsdom) these tests run in doesn't, so borrow Node's.
// Object.assign(target, source) copies each property of `source` onto `target`; `global` is the
// test environment's global object, so this makes them available everywhere.
// `import { a, b } from '...'` is a "named import": it picks these two exports out of Node's
// built-in 'util' module by name.
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextEncoder, TextDecoder });

// Stripe: every test uses the stand-ins in stripe-test-mock.js instead of the real Stripe
// packages, so no test loads Stripe.js from the internet or needs a key. jest.mock(name, factory)
// replaces a module with whatever the factory returns. `require` (not `import`) is used inside
// because jest runs these factories before the file's imports are ready.
//   '@stripe/react-stripe-js'  <Elements>, <CardElement>, useStripe() and useElements()
//   '@stripe/stripe-js'        loadStripe(), never actually called (src/stripe.js is replaced too)
//   './stripe'                 src/stripe.js: paymentsAvailable and stripePromise
jest.mock('@stripe/react-stripe-js', () => require('./stripe-test-mock').reactStripeMock);
jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn() }));
jest.mock('./stripe', () => require('./stripe-test-mock').stripeModuleMock);

// renderAt() (test-utils.js) replaces fetch with a fake. Remove it after every test, so one
// test's fake can never answer another test's requests. `delete` removes a property.
// The pretend Stripe is reset too, for the same reason.
afterEach(() => {
  delete global.fetch;
  require('./stripe-test-mock').resetMockStripe();
});
