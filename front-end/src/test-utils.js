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

// Pass one of these as `products`, `cart` or `orders` to renderAt() to make that request:
// REQUEST_FAILS: fail, as when the API isn't running;
// REQUEST_PENDING: never answer, so the page stays "Loading…";
// REQUEST_UNAUTHORIZED: answer 401, as when the login has expired.
export const REQUEST_FAILS = { sentinel: 'request fails' };
export const REQUEST_PENDING = { sentinel: 'request pending' };
export const REQUEST_UNAUTHORIZED = { sentinel: 'request unauthorized' };

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

// Turns a `products`, `cart` or `orders` option into a reply: the sentinels behave as described
// above; anything else is answered with `makeReply()`. (A function is passed instead of the
// reply itself so it's only built when needed.)
function replyFor(option, makeReply) {
  if (option === REQUEST_PENDING) return new Promise(() => {}); // never settles
  if (option === REQUEST_FAILS) return Promise.reject(new TypeError('Failed to fetch'));
  if (option === REQUEST_UNAUTHORIZED) return jsonReply(401, { error: 'You must be logged in' });
  return makeReply();
}

// The list GET /orders sends, worked out from full orders the way the API does: a summary of
// each, with item_count adding up the quantities (2 mugs + 1 teapot = 3).
// ({ id, status, ... }) destructures each order, picking out just those properties; the
// round brackets around { ... } after => make the arrow function return that new object
// (without them, the braces would be read as a block of code). .reduce() keeps a running
// total, starting at 0.
function orderSummaries(orders) {
  return orders.map(({ id, status, total_amount, created_at, items }) => ({
    id,
    status,
    total_amount,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    created_at,
  }));
}

// Answers GET /orders/:id the way the API does, from the `orders` list: a 400 for an id that
// isn't a whole number, the order, or a 404 (the same for someone else's order).
function orderReply(orders, id) {
  // /^\d+$/ is a regular expression: from start (^) to end ($), one or more (+) digits (\d).
  if (!/^\d+$/.test(id)) {
    return jsonReply(400, { error: 'orderId must be a valid order id' });
  }
  // .find() returns the first order whose id matches, or undefined. Number(id) because the id
  // from the URL is text ('7') but order ids are numbers (7).
  const order = orders.find((o) => o.id === Number(id));
  return order ? jsonReply(200, order) : jsonReply(404, { error: 'Order not found' });
}

// Answers GET /products/:id the way the API does, from the `products` list:
// a 400 for an id that isn't a whole number, the product, or a 404.
function productReply(products, id) {
  // The same id check and lookup as orderReply above.
  if (!/^\d+$/.test(id)) {
    return jsonReply(400, { error: 'productId must be a valid product id' });
  }
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
//             (default: an empty cart), or REQUEST_FAILS / REQUEST_PENDING. It can also be a
//             FUNCTION returning one of those: renderAt calls it on every GET /cart, so a test
//             can change what the "server" holds between requests (e.g. after removing an item)
//   orders    the customer's orders IN FULL (the shape GET /orders/:id sends), answering
//             GET /orders (as summaries) and GET /orders/:id (default: none, []), or a sentinel
// The app makes those requests by itself (when it starts, or when a page opens), so this
// answers them. Every other request (e.g. POST /auth/login, POST /cart/items) is passed on to
// the test's own fake fetch, if it set one up before calling renderAt. jest.fn() records every
// call, so tests can still check them.
// It returns the router, so a test can drive it directly (e.g. router.navigate(-1) to go back).
export function renderAt(
  url,
  { customer = null, products = [], cart = EMPTY_CART, orders = [] } = {},
) {
  // The fetch the test set up before calling this (or undefined if it didn't).
  const testFetch = global.fetch;
  global.fetch = jest.fn((requestUrl, options) => {
    // A GET is a request with no options, or options without a method (fetch's default is
    // GET), or method 'GET'. `?.` reads method only if options exists.
    const isGet = options?.method === undefined || options.method === 'GET';
    // .match() checks requestUrl against a regular expression, and gives null if it doesn't
    // fit. The brackets ([^/]+: one or more characters that aren't '/') "capture" the id, which
    // ends up in productMatch[1] (or orderMatch[1]).
    const productMatch = requestUrl.match(/^\/products\/([^/]+)$/);
    const orderMatch = requestUrl.match(/^\/orders\/([^/]+)$/);

    let reply;
    if (requestUrl === '/auth/me') reply = meReply(customer);
    else if (isGet && requestUrl === '/products') {
      reply = replyFor(products, () => jsonReply(200, products));
    } else if (isGet && productMatch) {
      // decodeURIComponent undoes the page's encodeURIComponent, giving back the typed id.
      reply = replyFor(products, () => productReply(products, decodeURIComponent(productMatch[1])));
    } else if (isGet && requestUrl === '/cart') {
      // `typeof cart === 'function'` checks whether the option is a function; if so, call it
      // now to get the cart the "server" currently holds.
      const current = typeof cart === 'function' ? cart() : cart;
      reply = replyFor(current, () => jsonReply(200, current));
    } else if (isGet && requestUrl === '/orders') {
      reply = replyFor(orders, () => jsonReply(200, orderSummaries(orders)));
    } else if (isGet && orderMatch) {
      reply = replyFor(orders, () => orderReply(orders, decodeURIComponent(orderMatch[1])));
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
