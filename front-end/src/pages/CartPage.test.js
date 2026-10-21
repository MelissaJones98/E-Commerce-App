// Tests for the Cart page (/cart): listing the cart with row prices and a subtotal, changing
// quantities with − and +, removing items with ×, and the loading, empty and error states.
// renderAt (test-utils.js) answers GET /auth/me and GET /cart; this file's fake fetch answers
// the changes (PUT and DELETE /cart/items/:id) and the login form.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REQUEST_FAILS, REQUEST_PENDING, renderAt } from '../test-utils';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// The worked example from the design: 3 moisturisers at £2 (£6) and 1 liquid blush at £5 (£5),
// subtotal £11. The row prices and total come from the API, as they would for real.
const moisturiser = {
  product_id: 1,
  sku: 'MST-001',
  name: 'Moisturiser',
  price: '2.00',
  quantity: 3,
  line_total: '6.00',
};
const blush = {
  product_id: 2,
  sku: 'BLU-001',
  name: 'Liquid blush',
  price: '5.00',
  quantity: 1,
  line_total: '5.00',
};
const exampleCart = { items: [moisturiser, blush], total: '11.00' };
const emptyCart = { items: [], total: '0.00' };

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// What the fake API replies to a change. Each test sets these before clicking.
// `serverChanged` becomes true the moment a change request is SENT, so a test's `cart` function
// can return the cart the "server" holds after that change.
let putReply;
let deleteReply;
let serverChanged;

beforeEach(() => {
  putReply = Promise.resolve(jsonResponse(200, exampleCart));
  deleteReply = Promise.resolve({ ok: true, status: 204, json: async () => undefined });
  serverChanged = false;
  global.fetch = jest.fn((url, options) => {
    if (options?.method === 'PUT' || options?.method === 'DELETE') serverChanged = true;
    if (options?.method === 'PUT') return putReply;
    if (options?.method === 'DELETE') return deleteReply;
    if (url === '/auth/login') return Promise.resolve(jsonResponse(200, ada));
    // /auth/providers: no Google or Facebook buttons on the login page.
    return Promise.resolve(jsonResponse(200, { google: false, facebook: false }));
  });
});

// Every change request the page sent, as "METHOD url", e.g. 'PUT /cart/items/1'.
function changeRequests() {
  return global.fetch.mock.calls
    .filter(([, options]) => options?.method === 'PUT' || options?.method === 'DELETE')
    .map(([url, options]) => `${options.method} ${url}`);
}

// The body of the n-th PUT, as an object.
function putBody(n = 0) {
  const puts = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PUT');
  return JSON.parse(puts[n][1].body);
}

// Opens the cart page logged in as Ada, and waits for it to load.
async function openCart(cart = exampleCart) {
  renderAt('/cart', { customer: ada, cart });
  await screen.findByRole('heading', { level: 1, name: 'Your Cart' });
}

// One product's row: the list item (<li>) containing its name.
function row(name) {
  return screen.getByText(name).closest('li');
}

// The row's buttons, found by their screen-reader names.
function decrease(name) {
  return screen.getByRole('button', { name: `Decrease quantity of ${name}` });
}
function increase(name) {
  return screen.getByRole('button', { name: `Increase quantity of ${name}` });
}
function remove(name) {
  return screen.getByRole('button', { name: `Remove ${name} from your cart` });
}

// ----- Showing the cart -----

test('shows each item with its unit price, quantity and row price', async () => {
  await openCart();

  const m = await screen.findByText('Moisturiser').then((el) => el.closest('li'));
  expect(within(m).getByText('£2.00 each')).toBeInTheDocument();
  expect(within(m).getByLabelText('Quantity of Moisturiser: 3')).toHaveTextContent('3');
  expect(within(m).getByText('£6.00')).toBeInTheDocument();

  const b = row('Liquid blush');
  expect(within(b).getByText('£5.00 each')).toBeInTheDocument();
  expect(within(b).getByLabelText('Quantity of Liquid blush: 1')).toHaveTextContent('1');
});

test('shows the subtotal of all items', async () => {
  await openCart();

  expect(await screen.findByText('Subtotal (4 items)')).toBeInTheDocument();
  expect(screen.getByText('£11.00')).toBeInTheDocument();
});

test('says "1 item" in the subtotal for a single item', async () => {
  await openCart({ items: [blush], total: '5.00' });

  expect(await screen.findByText('Subtotal (1 item)')).toBeInTheDocument();
});

test('the heading is "Your Cart"', async () => {
  await openCart();

  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
});

test('links to checkout', async () => {
  await openCart();

  expect(await screen.findByRole('link', { name: 'Proceed to checkout' })).toHaveAttribute(
    'href',
    '/checkout',
  );
});

test('an empty cart says so, links to products, and has no checkout button', async () => {
  await openCart(emptyCart);

  expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('link', { name: 'Proceed to checkout' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Subtotal/)).not.toBeInTheDocument();
});

test('shows an error when the cart cannot be loaded', async () => {
  await openCart(REQUEST_FAILS);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load your cart. Please try again.",
  );
});

test('shows "Loading…" first', async () => {
  await openCart(REQUEST_PENDING);

  expect(await screen.findByText('Loading…')).toBeInTheDocument();
});

// ----- Changing quantities -----

test('+ sends the quantity plus one and shows the new cart', async () => {
  putReply = Promise.resolve(
    jsonResponse(200, {
      items: [{ ...moisturiser, quantity: 4, line_total: '8.00' }, blush],
      total: '13.00',
    }),
  );
  await openCart();
  await screen.findByText('Moisturiser');

  userEvent.click(increase('Moisturiser'));

  expect(await screen.findByText('£8.00')).toBeInTheDocument();
  expect(screen.getByText('£13.00')).toBeInTheDocument();
  expect(changeRequests()).toEqual(['PUT /cart/items/1']);
  expect(putBody()).toEqual({ quantity: 4 });
  // The nav badge follows: 4 moisturisers + 1 blush.
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(within(nav).getByRole('link', { name: 'Cart, 5 items' })).toBeInTheDocument();
});

test('− sends the quantity minus one', async () => {
  await openCart();
  await screen.findByText('Moisturiser');

  userEvent.click(decrease('Moisturiser'));

  await screen.findByText('Moisturiser');
  expect(changeRequests()).toEqual(['PUT /cart/items/1']);
  expect(putBody()).toEqual({ quantity: 2 });
});

test('− is disabled at quantity 1', async () => {
  await openCart();
  await screen.findByText('Liquid blush');

  expect(decrease('Liquid blush')).toBeDisabled();
  expect(decrease('Moisturiser')).toBeEnabled();
});

// ----- Removing -----

test('× removes the item', async () => {
  // The "server" holds the example cart until the blush is removed, then only the moisturiser.
  renderAt('/cart', {
    customer: ada,
    cart: () => (serverChanged ? { items: [moisturiser], total: '6.00' } : exampleCart),
  });
  await screen.findByText('Liquid blush');

  userEvent.click(remove('Liquid blush'));

  expect(await screen.findByText('Subtotal (3 items)')).toBeInTheDocument();
  expect(screen.queryByText('Liquid blush')).not.toBeInTheDocument();
  expect(changeRequests()).toEqual(['DELETE /cart/items/2']);
});

test('removing the last item shows the empty cart and clears the badge', async () => {
  renderAt('/cart', {
    customer: ada,
    cart: () => (serverChanged ? emptyCart : { items: [blush], total: '5.00' }),
  });
  await screen.findByText('Liquid blush');

  userEvent.click(remove('Liquid blush'));

  expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  // An empty cart's link is just "Cart", with no badge.
  expect(within(nav).getByRole('link', { name: 'Cart' })).toBeInTheDocument();
});

// ----- One change at a time, errors and other replies -----

test('locks every row while a change is on its way', async () => {
  putReply = new Promise(() => {}); // never answers
  await openCart();
  await screen.findByText('Moisturiser');

  userEvent.click(increase('Moisturiser'));

  // Every −, + and × on the page is disabled, not just the Moisturiser row's.
  for (const name of ['Moisturiser', 'Liquid blush']) {
    expect(decrease(name)).toBeDisabled();
    expect(increase(name)).toBeDisabled();
    expect(remove(name)).toBeDisabled();
  }
  // And another click sends nothing more.
  userEvent.click(remove('Liquid blush'));
  expect(changeRequests()).toEqual(['PUT /cart/items/1']);
});

test('a failed change shows the general error under that row only', async () => {
  putReply = Promise.reject(new TypeError('Failed to fetch'));
  putReply.catch(() => {});
  await openCart();
  await screen.findByText('Moisturiser');

  userEvent.click(increase('Moisturiser'));

  expect(await within(row('Moisturiser')).findByRole('alert')).toHaveTextContent(
    'Could not update your cart. Please try again.',
  );
  expect(within(row('Liquid blush')).queryByRole('alert')).not.toBeInTheDocument();
  // Nothing changed.
  expect(screen.getByText('£6.00')).toBeInTheDocument();
});

test("a new change clears the row's old message", async () => {
  putReply = Promise.resolve(jsonResponse(500, {}));
  await openCart();
  await screen.findByText('Moisturiser');
  userEvent.click(increase('Moisturiser'));
  await within(row('Moisturiser')).findByRole('alert');

  putReply = Promise.resolve(jsonResponse(200, exampleCart));
  userEvent.click(increase('Moisturiser'));

  // Wait for the second change to finish (the buttons work again), then check.
  await screen.findByRole('button', { name: 'Increase quantity of Moisturiser' });
  await within(row('Moisturiser')).findByLabelText('Quantity of Moisturiser: 3');
  expect(within(row('Moisturiser')).queryByRole('alert')).not.toBeInTheDocument();
});

test('a 404 reloads the cart without an error', async () => {
  // The blush was removed in another tab: the API says it isn't in the cart, and the cart the
  // "server" now holds has only the moisturiser.
  putReply = Promise.resolve(jsonResponse(404, { error: 'That product is not in your cart' }));
  renderAt('/cart', {
    customer: ada,
    cart: () => (serverChanged ? { items: [moisturiser], total: '6.00' } : exampleCart),
  });
  await screen.findByText('Liquid blush');

  userEvent.click(increase('Liquid blush'));

  expect(await screen.findByText('Subtotal (3 items)')).toBeInTheDocument();
  expect(screen.queryByText('Liquid blush')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a 401 logs you out and goes to Log in, then back to the cart', async () => {
  putReply = Promise.resolve(jsonResponse(401, { error: 'You must be logged in' }));
  await openCart();
  await screen.findByText('Moisturiser');

  userEvent.click(increase('Moisturiser'));

  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
  userEvent.type(screen.getByLabelText('Email'), ada.email);
  userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
  userEvent.click(screen.getByRole('button', { name: 'Log in' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Your Cart' })).toBeInTheDocument();
});

// ----- Not enough stock (409) -----

test('stock dropped: − jumps the quantity down to what is available', async () => {
  // 6 moisturisers in the cart, but only 3 left. The first PUT (6 → 5) is refused; the page
  // then sets the quantity to 3, which works.
  const six = { ...moisturiser, quantity: 6, line_total: '12.00' };
  const three = { ...moisturiser, quantity: 3, line_total: '6.00' };
  let puts = 0;
  global.fetch.mockImplementation((url, options) => {
    if (options?.method === 'PUT') {
      puts += 1;
      return Promise.resolve(
        puts === 1
          ? jsonResponse(409, { error: 'Not enough stock: 3 available' })
          : jsonResponse(200, { items: [three], total: '6.00' }),
      );
    }
    return Promise.resolve(jsonResponse(200, { google: false, facebook: false }));
  });
  await openCart({ items: [six], total: '12.00' });
  await screen.findByText('Moisturiser');

  userEvent.click(decrease('Moisturiser'));

  expect(await within(row('Moisturiser')).findByRole('status')).toHaveTextContent(
    'Only 3 in stock, so your quantity is now 3.',
  );
  expect(within(row('Moisturiser')).getByLabelText('Quantity of Moisturiser: 3')).toBeInTheDocument();
  expect(putBody(1)).toEqual({ quantity: 3 });
});

test('+ past the stock says how many are left', async () => {
  putReply = Promise.resolve(jsonResponse(409, { error: 'Not enough stock: 3 available' }));
  await openCart();
  await screen.findByText('Moisturiser');

  userEvent.click(increase('Moisturiser'));

  expect(await within(row('Moisturiser')).findByRole('alert')).toHaveTextContent(
    'Only 3 in stock.',
  );
  // Only the one PUT: nothing to adjust.
  expect(changeRequests()).toEqual(['PUT /cart/items/1']);
});

test('a failed automatic adjustment shows the general error', async () => {
  const six = { ...moisturiser, quantity: 6, line_total: '12.00' };
  let puts = 0;
  global.fetch.mockImplementation((url, options) => {
    if (options?.method === 'PUT') {
      puts += 1;
      return puts === 1
        ? Promise.resolve(jsonResponse(409, { error: 'Not enough stock: 3 available' }))
        : Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(jsonResponse(200, { google: false, facebook: false }));
  });
  await openCart({ items: [six], total: '12.00' });
  await screen.findByText('Moisturiser');

  userEvent.click(decrease('Moisturiser'));

  expect(await within(row('Moisturiser')).findByRole('alert')).toHaveTextContent(
    'Could not update your cart. Please try again.',
  );
  // Never the "your quantity is now 3" message, because it didn't happen.
  expect(screen.queryByText(/your quantity is now/)).not.toBeInTheDocument();
});

test('a 404 whose reload also fails keeps the cart on screen, with an error on that row', async () => {
  // The blush is gone (404), and the reload that follows fails too (a network blip). The cart
  // the customer was looking at must stay, with the general error under the row they changed.
  putReply = Promise.resolve(jsonResponse(404, { error: 'That product is not in your cart' }));
  renderAt('/cart', {
    customer: ada,
    cart: () => (serverChanged ? REQUEST_FAILS : exampleCart),
  });
  await screen.findByText('Liquid blush');

  userEvent.click(increase('Liquid blush'));

  expect(await within(row('Liquid blush')).findByRole('alert')).toHaveTextContent(
    'Could not update your cart. Please try again.',
  );
  expect(screen.getByText('Moisturiser')).toBeInTheDocument();
  expect(screen.queryByText("Couldn't load your cart. Please try again.")).not.toBeInTheDocument();
});
