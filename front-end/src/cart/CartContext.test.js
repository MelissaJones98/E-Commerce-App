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
let meResponse;
let cartResponse;
let addResponse;

beforeEach(() => {
  meResponse = Promise.resolve(jsonResponse(200, { customer: ada }));
  cartResponse = Promise.resolve(jsonResponse(200, cartWith()));
  addResponse = Promise.resolve(jsonResponse(201, cartWith()));
  // Answer each request by its address (and method, for the cart's two kinds of request).
  global.fetch = jest.fn((url, options) => {
    if (url === '/auth/me') return meResponse;
    if (url === '/auth/logout') return Promise.resolve({ ok: true, status: 204 });
    if (url === '/cart/items' && options?.method === 'POST') return addResponse;
    if (url === '/cart') return cartResponse;
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

// The probe: shows the count ("none" for null), and buttons to add 2 of product 1 and log out.
function Probe() {
  const { itemCount, addToCart } = useCart();
  const { logout } = useAuth();
  const [addError, setAddError] = useState(null);

  async function handleAdd() {
    try {
      await addToCart(1, 2);
    } catch (err) {
      setAddError(`${err.status} ${err.message}`);
    }
  }

  return (
    <div>
      {/* `??` shows "none" when itemCount is null (or undefined). */}
      <p>count: {itemCount ?? 'none'}</p>
      <button onClick={handleAdd}>add</button>
      <button onClick={logout}>log out</button>
      {addError && <p>error: {addError}</p>}
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
