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

// Pass one of these as `products` or `cart` to renderAt() to make that request:
// REQUEST_FAILS: fail, as when the API isn't running;
// REQUEST_PENDING: never answer, so the page stays "Loading…".
export const REQUEST_FAILS = { sentinel: 'request fails' };
export const REQUEST_PENDING = { sentinel: 'request pending' };

// The cart renderAt() gives a logged-in customer unless a test passes its own: an empty one.
const EMPTY_CART = { items: [], total: '0.00' };

// A fake fetch response: `status` (e.g. 404) and a JSON `body`. `ok` is true for 2xx statuses,
// just like a real response.
function jsonReply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

// Turns a `products` or `cart` option into a reply: REQUEST_FAILS and REQUEST_PENDING behave as
// described above; anything else is answered with `makeReply()`. (A function is passed instead
// of the reply itself so it's only built when needed.)
function replyFor(option, makeReply) {
  if (option === REQUEST_PENDING) return new Promise(() => {}); // never settles
  if (option === REQUEST_FAILS) return Promise.reject(new TypeError('Failed to fetch'));
  return makeReply();
}

// Answers GET /products/:id the way the API does, from the `products` list:
// a 400 for an id that isn't a whole number, the product, or a 404.
function productReply(products, id) {
  // /^\d+$/ is a regular expression: from start (^) to end ($), one or more (+) digits (\d).
  if (!/^\d+$/.test(id)) {
    return jsonReply(400, { error: 'productId must be a valid product id' });
  }
  // .find() returns the first product whose id matches, or undefined. Number(id) because the
  // id from the URL is text ('1') but product ids are numbers (1).
  const product = products.find((p) => p.id === Number(id));
  return product ? jsonReply(200, product) : jsonReply(404, { error: 'Product not found' });
}

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
//   products  the shop's products, answering GET /products and GET /products/:id
//             (default: none, []), or REQUEST_FAILS / REQUEST_PENDING
//   cart      the reply to GET /cart, e.g. { items: [{ product_id: 1, quantity: 2 }], total }
//             (default: an empty cart), or REQUEST_FAILS / REQUEST_PENDING
// The app makes those requests by itself (when it starts, or when a page opens), so this
// answers them. Every other request (e.g. POST /auth/login, POST /cart/items) is passed on to
// the test's own fake fetch, if it set one up before calling renderAt. jest.fn() records every
// call, so tests can still check them.
// It returns the router, so a test can drive it directly (e.g. router.navigate(-1) to go back).
export function renderAt(url, { customer = null, products = [], cart = EMPTY_CART } = {}) {
  // The fetch the test set up before calling this (or undefined if it didn't).
  const testFetch = global.fetch;
  global.fetch = jest.fn((requestUrl, options) => {
    // A GET is a request with no options, or options without a method (fetch's default is
    // GET), or method 'GET'. `?.` reads method only if options exists.
    const isGet = options?.method === undefined || options.method === 'GET';
    // .match() checks requestUrl against a regular expression. The brackets ([^/]+: one or more
    // characters that aren't '/') "capture" the id, which ends up in productMatch[1].
    const productMatch = requestUrl.match(/^\/products\/([^/]+)$/);

    let reply;
    if (requestUrl === '/auth/me') reply = meReply(customer);
    else if (isGet && requestUrl === '/products') {
      reply = replyFor(products, () => jsonReply(200, products));
    } else if (isGet && productMatch) {
      // decodeURIComponent undoes the page's encodeURIComponent, giving back the typed id.
      reply = replyFor(products, () => productReply(products, decodeURIComponent(productMatch[1])));
    } else if (isGet && requestUrl === '/cart') {
      reply = replyFor(cart, () => jsonReply(200, cart));
    }

    if (reply) {
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
