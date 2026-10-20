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

// renderAt() (test-utils.js) replaces fetch with a fake. Remove it after every test, so one
// test's fake can never answer another test's requests. `delete` removes a property.
afterEach(() => {
  delete global.fetch;
});
