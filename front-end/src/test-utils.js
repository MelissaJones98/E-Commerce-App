// Helpers shared by the front-end test files. It has no tests itself: Jest only runs files
// ending in .test.js.

// render() draws a component into a fake page (jsdom). Named import: picked out by name.
import { render } from '@testing-library/react';
// createMemoryRouter builds a router that keeps its URL history in memory instead of the
// browser's address bar; RouterProvider shows the router's current page.
import { createMemoryRouter, RouterProvider } from 'react-router';
// The app's real route table, so tests check exactly what users get.
import { routes } from './routes';

// Pass one of these as `customer` to renderAt() for the two unusual cases:
// AUTH_PENDING: the app never hears back from /auth/me (it stays "checking").
// AUTH_FAILS: the /auth/me request fails, as when the API isn't running.
// They're unique objects ("sentinels"), so they can't be mistaken for a real customer.
export const AUTH_PENDING = { sentinel: 'auth pending' };
export const AUTH_FAILS = { sentinel: 'auth fails' };

// Builds the fake reply to GET /auth/me for the given `customer` option.
function meReply(customer) {
  if (customer === AUTH_PENDING) return new Promise(() => {}); // never settles
  if (customer === AUTH_FAILS) return Promise.reject(new TypeError('Failed to fetch'));
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ customer }),
  });
}

// Show the app as if the browser had opened `url`. `export` lets test files import it.
// Options (all optional), passed as an object: renderAt('/cart', { customer: ada })
//   customer  who /auth/me says is logged in: a customer object, null (nobody, the default),
//             AUTH_PENDING or AUTH_FAILS
// The app asks GET /auth/me when it starts, so this answers that request itself. Every other
// request is passed on to the test's own fake fetch, if it set one up before calling renderAt
// (e.g. to answer /auth/login). jest.fn() records every call, so tests can still check them.
// It returns the router, so a test can drive it directly (e.g. router.navigate(-1) to go back).
export function renderAt(url, { customer = null } = {}) {
  // The fetch the test set up before calling this (or undefined if it didn't).
  const testFetch = global.fetch;
  global.fetch = jest.fn((requestUrl, options) => {
    if (requestUrl === '/auth/me') {
      const reply = meReply(customer);
      // Mark a failing reply as handled now, so Node doesn't warn before the app gets to it.
      reply.catch(() => {});
      return reply;
    }
    // Anything else goes to the test's own fake. With none, behave like a failed request.
    return testFetch
      ? testFetch(requestUrl, options)
      : Promise.reject(new TypeError('Failed to fetch'));
  });

  // initialEntries is the starting history: a list of URLs, and the last one is the current page.
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  // <RouterProvider router={router} /> is JSX: HTML-like syntax for creating React elements.
  // `router={router}` passes the router to RouterProvider as a "prop" (an input).
  render(<RouterProvider router={router} />);
  return router;
}
