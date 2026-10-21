// Tests for CartContext: the app-wide count of items in the logged-in customer's cart (the
// number on the cart badge in the nav).
//
// Like AuthContext.test.js, each test draws a tiny "probe" component, here inside BOTH
// providers (CartProvider needs to know who's logged in). The probe shows what useCart() says
// and has buttons to add to the cart and to log out. fetch is replaced by a fake for each test.

// act() waits for React to finish updating; waitFor() keeps re-running a check until it passes
// (or times out), for things that happen a moment later.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { CartProvider, countItems, useCart } from './CartContext';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// A cart in the API's shape, holding the given quantities (only the fields countItems reads,
// plus the rest so it looks real). `(quantity, i) =>` gets each value and its position.
function cartWith(...quantities) {
  // `...quantities` ("rest parameters") collects all the arguments into an array:
  // cartWith(2, 1) gives quantities = [2, 1].
  return {
    items: quantities.map((quantity, i) => ({
      product_id: i + 1,
      sku: `SKU-${i + 1}`,
      name: `Product ${i + 1}`,
      price: '1.00',
      quantity,
      line_total: '1.00',
    })),
    total: '1.00',
  };
}

// A fake fetch Response: `ok` is true for 2xx statuses, and json() resolves to `body`.
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A Promise the test answers later: deferred().resolve(value) settles it whenever the test
// chooses, which is how these tests make a request "slow".
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// What the fake fetch answers. Each test sets these before drawing the probe.
// cartResponse answers GET /cart. It may be a function, called on every request, so a test
// can give a different answer the second time (e.g. after removing an item).
let meResponse;
let cartResponse;
let addResponse;
let putResponse;
let deleteResponse;

beforeEach(() => {
  meResponse = Promise.resolve(jsonResponse(200, { customer: ada }));
  cartResponse = Promise.resolve(jsonResponse(200, cartWith()));
  addResponse = Promise.resolve(jsonResponse(201, cartWith()));
  putResponse = Promise.resolve(jsonResponse(200, cartWith()));
  deleteResponse = Promise.resolve({ ok: true, status: 204, json: async () => undefined });
  // Answer each request by its address and method.
  global.fetch = jest.fn((url, options) => {
    if (url === '/auth/me') return meResponse;
    if (url === '/auth/logout') return Promise.resolve({ ok: true, status: 204 });
    if (url === '/cart/items' && options?.method === 'POST') return addResponse;
    if (url === '/cart/items/1' && options?.method === 'PUT') return putResponse;
    if (url === '/cart/items/1' && options?.method === 'DELETE') return deleteResponse;
    if (url === '/cart') return typeof cartResponse === 'function' ? cartResponse() : cartResponse;
    return Promise.reject(new TypeError('Failed to fetch'));
  });
});

afterEach(() => {
  delete global.fetch;
});

// How many times the fake fetch was asked for GET /cart.
function cartRequests() {
  return global.fetch.mock.calls.filter(([url]) => url === '/cart').length;
}

// The probe: shows the count and the cart's total ("none" for null), and buttons that call each
// of useCart()'s functions with product 1: add 2, set the quantity to 3, remove, and refresh.
function Probe() {
  const { cart, itemCount, addToCart, updateQuantity, removeItem, refresh } = useCart();
  const { logout } = useAuth();
  const [error, setError] = useState(null);

  // Runs one of the cart functions, and keeps any error it throws so the test can check it.
  // `action` is a function, e.g. () => addToCart(1, 2).
  async function run(action) {
    try {
      await action();
    } catch (err) {
      setError(`${err.status} ${err.message}`);
    }
  }

  return (
    <div>
      {/* `??` shows "none" when the value is null (or undefined). `cart?.total` reads total
          only if there is a cart. */}
      <p>count: {itemCount ?? 'none'}</p>
      <p>total: {cart?.total ?? 'none'}</p>
      <button onClick={() => run(() => addToCart(1, 2))}>add</button>
      <button onClick={() => run(() => updateQuantity(1, 3))}>update</button>
      <button onClick={() => run(() => removeItem(1))}>remove</button>
      <button onClick={() => run(refresh)}>refresh</button>
      <button onClick={logout}>log out</button>
      {error && <p>error: {error}</p>}
    </div>
  );
}

function renderProbe() {
  render(
    <AuthProvider>
      <CartProvider>
        <Probe />
      </CartProvider>
    </AuthProvider>,
  );
}

// Lets any waiting Promise callbacks run, so a test can check that something did NOT happen.
// Inside act(), so any updates they cause are finished before the test carries on.
function settle() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

// Waits until the cart has been asked for (once /auth/me has answered).
function cartRequested() {
  return waitFor(() => expect(cartRequests()).toBe(1));
}

test('countItems adds up quantities', () => {
  expect(countItems(cartWith(2, 1))).toBe(3);
  expect(countItems(cartWith())).toBe(0);
});

test('loads the count once a customer is logged in', async () => {
  cartResponse = Promise.resolve(jsonResponse(200, cartWith(2, 1)));
  renderProbe();

  expect(await screen.findByText('count: 3')).toBeInTheDocument();
});

test('is null when nobody is logged in, and never asks for the cart', async () => {
  meResponse = Promise.resolve(jsonResponse(200, { customer: null }));
  renderProbe();

  await settle();
  expect(screen.getByText('count: none')).toBeInTheDocument();
  expect(cartRequests()).toBe(0);
});

test('does not ask for the cart while still checking', async () => {
  meResponse = new Promise(() => {}); // /auth/me never answers
  renderProbe();

  await settle();
  expect(screen.getByText('count: none')).toBeInTheDocument();
  expect(cartRequests()).toBe(0);
});

test('is null when the cart cannot be loaded', async () => {
  cartResponse = Promise.reject(new TypeError('Failed to fetch'));
  cartResponse.catch(() => {}); // handled now, so Node doesn't warn before the provider gets it
  renderProbe();

  // Wait until the cart has been asked for, then let the failure be processed.
  await cartRequested();
  await settle();
  expect(screen.getByText('count: none')).toBeInTheDocument();
});

test('clears the count on logout', async () => {
  cartResponse = Promise.resolve(jsonResponse(200, cartWith(2)));
  renderProbe();
  await screen.findByText('count: 2');

  userEvent.click(screen.getByRole('button', { name: 'log out' }));

  expect(await screen.findByText('count: none')).toBeInTheDocument();
});

test('ignores a cart answer that arrives after logout', async () => {
  const slowCart = deferred();
  cartResponse = slowCart.promise;
  renderProbe();
  // Wait until the cart request has gone out, then log out before it's answered.
  await cartRequested();

  userEvent.click(screen.getByRole('button', { name: 'log out' }));
  await settle();
  // The old answer arrives now. It belonged to the customer who just logged out.
  slowCart.resolve(jsonResponse(200, cartWith(7)));
  await settle();

  expect(screen.getByText('count: none')).toBeInTheDocument();
});

test("addToCart sets the count from the server's reply", async () => {
  cartResponse = Promise.resolve(jsonResponse(200, cartWith(1)));
  // The server's cart after the add: 5 items. (Not 1 + 2 = 3: someone may have added more in
  // another tab, and the server's number is the true one.)
  addResponse = Promise.resolve(jsonResponse(201, cartWith(5)));
  renderProbe();
  await screen.findByText('count: 1');

  userEvent.click(screen.getByRole('button', { name: 'add' }));

  expect(await screen.findByText('count: 5')).toBeInTheDocument();
  // And it sent exactly the product and quantity it was given, as JSON.
  const [, options] = global.fetch.mock.calls.find(([url]) => url === '/cart/items');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({ product_id: 1, quantity: 2 });
});

test('addToCart rethrows the error and leaves the count unchanged', async () => {
  cartResponse = Promise.resolve(jsonResponse(200, cartWith(3)));
  addResponse = Promise.resolve(
    jsonResponse(409, { error: 'Not enough stock: 5 available, 3 already in your cart' }),
  );
  renderProbe();
  await screen.findByText('count: 3');

  userEvent.click(screen.getByRole('button', { name: 'add' }));

  expect(
    await screen.findByText('error: 409 Not enough stock: 5 available, 3 already in your cart'),
  ).toBeInTheDocument();
  expect(screen.getByText('count: 3')).toBeInTheDocument();
});

test('a slow first load does not overwrite a newer add', async () => {
  const slowCart = deferred();
  cartResponse = slowCart.promise;
  addResponse = Promise.resolve(jsonResponse(201, cartWith(4)));
  renderProbe();
  await cartRequested();

  // The add finishes first: the count is 4.
  userEvent.click(screen.getByRole('button', { name: 'add' }));
  expect(await screen.findByText('count: 4')).toBeInTheDocument();

  // Then the first load's out-of-date answer (from before the add) arrives.
  slowCart.resolve(jsonResponse(200, cartWith(1)));
  await settle();

  expect(screen.getByText('count: 4')).toBeInTheDocument();
});

// ----- The whole cart: changing, removing and reloading it -----

test("updateQuantity stores the cart from the server's reply", async () => {
  cartResponse = Promise.resolve(jsonResponse(200, cartWith(1)));
  // The server's cart after the change: quantities 3 and 1, total '4.00'.
  putResponse = Promise.resolve(jsonResponse(200, { ...cartWith(3, 1), total: '4.00' }));
  renderProbe();
  await screen.findByText('count: 1');

  userEvent.click(screen.getByRole('button', { name: 'update' }));

  expect(await screen.findByText('count: 4')).toBeInTheDocument();
  expect(screen.getByText('total: 4.00')).toBeInTheDocument();
  // It sent PUT /cart/items/1 with the new quantity.
  const [, options] = global.fetch.mock.calls.find(([url]) => url === '/cart/items/1');
  expect(JSON.parse(options.body)).toEqual({ quantity: 3 });
});

test('removeItem deletes, then reloads the cart', async () => {
  // GET /cart answers with two items at first, then (after the removal) one.
  let cartLoads = 0;
  cartResponse = () => {
    cartLoads += 1;
    return Promise.resolve(jsonResponse(200, cartLoads === 1 ? cartWith(2, 1) : cartWith(1)));
  };
  renderProbe();
  await screen.findByText('count: 3');

  userEvent.click(screen.getByRole('button', { name: 'remove' }));

  expect(await screen.findByText('count: 1')).toBeInTheDocument();
  // The DELETE came before the reload. .map(...) lists each call as "METHOD url".
  const calls = global.fetch.mock.calls.map(([url, options]) => `${options?.method ?? 'GET'} ${url}`);
  // .indexOf finds a call's position in the list; .lastIndexOf finds the LAST matching call.
  expect(calls.indexOf('DELETE /cart/items/1')).toBeLessThan(calls.lastIndexOf('GET /cart'));
});

test('refresh reloads the cart', async () => {
  let cartLoads = 0;
  cartResponse = () => {
    cartLoads += 1;
    return Promise.resolve(jsonResponse(200, cartLoads === 1 ? cartWith(1) : cartWith(5)));
  };
  renderProbe();
  await screen.findByText('count: 1');

  userEvent.click(screen.getByRole('button', { name: 'refresh' }));

  expect(await screen.findByText('count: 5')).toBeInTheDocument();
});

test('refresh rethrows a load failure and leaves the cart null', async () => {
  let cartLoads = 0;
  cartResponse = () => {
    cartLoads += 1;
    return cartLoads === 1
      ? Promise.resolve(jsonResponse(200, cartWith(2)))
      : Promise.resolve(jsonResponse(500, { error: 'Internal server error' }));
  };
  renderProbe();
  await screen.findByText('count: 2');

  userEvent.click(screen.getByRole('button', { name: 'refresh' }));

  expect(await screen.findByText('error: 500 Internal server error')).toBeInTheDocument();
  expect(screen.getByText('count: none')).toBeInTheDocument();
  expect(screen.getByText('total: none')).toBeInTheDocument();
});

test('updateQuantity rethrows the error and leaves the cart unchanged', async () => {
  cartResponse = Promise.resolve(jsonResponse(200, cartWith(6)));
  putResponse = Promise.resolve(jsonResponse(409, { error: 'Not enough stock: 3 available' }));
  renderProbe();
  await screen.findByText('count: 6');

  userEvent.click(screen.getByRole('button', { name: 'update' }));

  expect(await screen.findByText('error: 409 Not enough stock: 3 available')).toBeInTheDocument();
  expect(screen.getByText('count: 6')).toBeInTheDocument();
});

test('ignores a change reply that arrives after logout', async () => {
  cartResponse = Promise.resolve(jsonResponse(200, cartWith(1)));
  const slowPut = deferred();
  putResponse = slowPut.promise;
  renderProbe();
  await screen.findByText('count: 1');

  // Start the change, then log out before it's answered.
  userEvent.click(screen.getByRole('button', { name: 'update' }));
  userEvent.click(screen.getByRole('button', { name: 'log out' }));
  expect(await screen.findByText('count: none')).toBeInTheDocument();

  // The change's reply arrives late: it belongs to the customer who has logged out.
  slowPut.resolve(jsonResponse(200, cartWith(3)));
  await settle();

  expect(screen.getByText('count: none')).toBeInTheDocument();
});
