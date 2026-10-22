// Tests for the Checkout page (/checkout): the order summary with delivery, the delivery address
// form, Stripe's card box and the Pay button, and every outcome of paying.
// renderAt (test-utils.js) answers GET /auth/me, GET /cart and GET /orders/:id; this file's fake
// fetch answers POST /cart/checkout and the login page. Stripe is the pretend one from
// stripe-test-mock.js (setupTests.js swaps it in), so mockStripe.createPaymentMethod decides
// what "Stripe" says about the card.

// fireEvent sends one raw browser event (here, a form submit); act() groups updates together.
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REQUEST_FAILS, renderAt } from '../test-utils';
import { mockStripe } from '../stripe-test-mock';
import { order7 } from '../orders/fixtures';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// The worked example: one face oil at £24.50. That's under £30, so £3.95 delivery is added
// (£28.45 to pay), and £5.50 more would make delivery free. Every number comes from the API.
const oil = { product_id: 1, sku: 'SKN-010', name: 'Rosehip Face Oil', price: '24.50', quantity: 1, line_total: '24.50' };
const cart2450 = {
  items: [oil],
  total: '24.50',
  delivery_charge: '3.95',
  order_total: '28.45',
  free_delivery_remaining: '5.50',
};
// The same oil at £30.00: free delivery.
const cart3000 = {
  items: [{ ...oil, price: '30.00', line_total: '30.00' }],
  total: '30.00',
  delivery_charge: '0.00',
  order_total: '30.00',
  free_delivery_remaining: '0.00',
};
const emptyCart = {
  items: [],
  total: '0.00',
  delivery_charge: '0.00',
  order_total: '0.00',
  free_delivery_remaining: '0.00',
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// What the fake API replies to POST /cart/checkout; each test can change it before paying.
// `serverCart` is the cart the "server" holds, read on every GET /cart (renderAt calls the
// function each time), so a test can change it to act as if the cart changed on the server.
let checkoutReply;
let serverCart;

beforeEach(() => {
  // By default, paying works and creates order 7 (in the shape GET /orders/:id sends).
  checkoutReply = () => Promise.resolve(jsonResponse(201, order7));
  serverCart = cart2450;
  // By default, Stripe accepts the card and gives back a PaymentMethod id.
  mockStripe.createPaymentMethod.mockResolvedValue({ paymentMethod: { id: 'pm_test_1' } });
  global.fetch = jest.fn((url) => {
    if (url === '/cart/checkout') {
      // A successful checkout empties the cart on the server.
      return checkoutReply().then((reply) => {
        if (reply.ok) serverCart = emptyCart;
        return reply;
      });
    }
    if (url === '/auth/login') return Promise.resolve(jsonResponse(200, ada));
    // /auth/providers: no Google or Facebook buttons on the login page.
    return Promise.resolve(jsonResponse(200, { google: false, facebook: false }));
  });
});

// Opens the checkout page logged in as Ada, and waits for the cart to load (the Pay button
// appears). Returns the router, so tests can check where the page went.
async function openCheckout() {
  const router = renderAt('/checkout', { customer: ada, cart: () => serverCart, orders: [order7] });
  await screen.findByRole('heading', { level: 1, name: 'Checkout' });
  return router;
}

// Types a valid UK address into the form. Line 2 and County are left empty (they're optional).
function fillAddress() {
  userEvent.type(screen.getByLabelText('Address line 1'), '12 Rose Lane');
  userEvent.type(screen.getByLabelText('Town / city'), 'Bristol');
  userEvent.type(screen.getByLabelText('Postcode'), 'BS1 4AB');
}

// The Pay button, whatever its text says ("Pay £28.45" or "Paying…").
function payButton() {
  return screen.getByRole('button', { name: /^Pay/ });
}

// Every POST /cart/checkout the page sent, as the parsed JSON bodies.
function checkoutBodies() {
  return global.fetch.mock.calls
    .filter(([url]) => url === '/cart/checkout')
    .map(([, options]) => JSON.parse(options.body));
}

// How many times the page asked for GET /cart (renderAt's fetch records every request).
function cartLoads() {
  return global.fetch.mock.calls.filter(([url, options]) => url === '/cart' && !options?.method).length;
}

// One line of the order summary, e.g. "Delivery £3.95": the <p> holding the label.
function moneyLine(label) {
  return screen.getByText(label).closest('p');
}

// ----- What the page shows -----

test('shows the items, the delivery charge, the total and how much more makes delivery free', async () => {
  await openCheckout();

  expect(await screen.findByText('Rosehip Face Oil')).toBeInTheDocument();
  expect(within(moneyLine('Delivery')).getByText('£3.95')).toBeInTheDocument();
  expect(within(moneyLine('Total')).getByText('£28.45')).toBeInTheDocument();
  expect(screen.getByText('Spend £5.50 more for free delivery')).toBeInTheDocument();
  // The button shows the exact amount that will be charged.
  expect(screen.getByRole('button', { name: 'Pay £28.45' })).toBeInTheDocument();
});

test('£30.00 of items shows free delivery, with no "Spend more" line', async () => {
  serverCart = cart3000;
  await openCheckout();

  expect(await screen.findByRole('button', { name: 'Pay £30.00' })).toBeInTheDocument();
  expect(within(moneyLine('Delivery')).getByText('Free')).toBeInTheDocument();
  expect(screen.queryByText(/more for free delivery/)).not.toBeInTheDocument();
});

test('has a labelled field for each part of the address, and Stripe\'s card box', async () => {
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });

  for (const label of ['Address line 1', 'Address line 2 (optional)', 'Town / city', 'County (optional)', 'Postcode']) {
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  }
  expect(screen.getByTestId('card-element')).toBeInTheDocument();
});

test('an empty cart says so and links to the products, with no form', async () => {
  serverCart = emptyCart;
  await openCheckout();

  expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Browse products' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument();
});

test('shows an error when the cart cannot be loaded', async () => {
  renderAt('/checkout', { customer: ada, cart: REQUEST_FAILS });

  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your cart. Please try again.");
});

test('logged out, it goes to Log in', async () => {
  renderAt('/checkout', { customer: null });

  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
});

test('no Stripe key disables Pay', async () => {
  mockStripe.unavailable = true;
  await openCheckout();

  expect(await screen.findByText("Payments aren't available right now.")).toBeInTheDocument();
  expect(payButton()).toBeDisabled();
});

// ----- Checking the address -----

// `test.each` runs the same test once per row: [the field left blank, the message expected].
test.each([
  ['Address line 1', 'Enter address line 1'],
  ['Town / city', 'Enter your town or city'],
  ['Postcode', 'Enter your postcode'],
])('a blank %s says "%s" and sends nothing', async (label, message) => {
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();
  // Clear the one field, then type only spaces, which count as blank too.
  userEvent.clear(screen.getByLabelText(label));
  userEvent.type(screen.getByLabelText(label), '   ');

  userEvent.click(payButton());

  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(mockStripe.createPaymentMethod).not.toHaveBeenCalled();
  expect(checkoutBodies()).toEqual([]);
});

// ----- Paying -----

test('paying sends the card to Stripe, the address and total to the API, then shows the order with a thank-you', async () => {
  const router = await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();
  const loadsBefore = cartLoads();

  userEvent.click(payButton());

  expect(await screen.findByText('Thank you, your order is confirmed')).toBeInTheDocument();
  // Stripe turned the card box into a PaymentMethod.
  expect(mockStripe.createPaymentMethod).toHaveBeenCalledWith({ type: 'card', card: 'card' });
  // The API got the address (empty optional parts as null, always GB), the PaymentMethod id and
  // the total the Pay button showed.
  expect(checkoutBodies()).toEqual([
    {
      shipping_address: {
        line_1: '12 Rose Lane',
        line_2: null,
        city: 'Bristol',
        region: null,
        postal_code: 'BS1 4AB',
        country_code: 'GB',
      },
      payment_method_id: 'pm_test_1',
      expected_total: '28.45',
    },
  ]);
  // The cart was reloaded (so the badge empties), and the page moved to the new order.
  expect(cartLoads()).toBeGreaterThan(loadsBefore);
  expect(router.state.location.pathname).toBe('/orders/7');
});

test('sends one checkout for a double click', async () => {
  // Stripe never answers, so the first click stays "in progress".
  mockStripe.createPaymentMethod.mockReturnValue(new Promise(() => {}));
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();

  // Two submits inside ONE act(): React doesn't redraw between them, so the second arrives
  // before the button can turn disabled, as when Enter and a click land at the same moment.
  // Only the busy ref (which changes immediately) can stop the second one paying again.
  const form = payButton().closest('form');
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });

  // While paying, the button says so and can't be pressed.
  expect(await screen.findByRole('button', { name: 'Paying…' })).toBeDisabled();
  expect(mockStripe.createPaymentMethod).toHaveBeenCalledTimes(1);
});

test("Stripe's own card error is shown, and nothing is sent to the API", async () => {
  mockStripe.createPaymentMethod.mockResolvedValue({ error: { message: 'Your card number is incomplete.' } });
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();

  userEvent.click(payButton());

  expect(await screen.findByRole('alert')).toHaveTextContent('Your card number is incomplete.');
  expect(checkoutBodies()).toEqual([]);
  // The button is back, ready to try again.
  expect(payButton()).toBeEnabled();
});

test('a declined card shows the reason and keeps the address', async () => {
  checkoutReply = () => Promise.resolve(jsonResponse(402, { error: 'Your card was declined.' }));
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();

  userEvent.click(payButton());

  expect(await screen.findByRole('alert')).toHaveTextContent('Your card was declined.');
  expect(screen.getByLabelText('Address line 1')).toHaveValue('12 Rose Lane');
  expect(screen.getByRole('button', { name: 'Pay £28.45' })).toBeEnabled();
});

test('Stripe being unavailable says to try again later', async () => {
  checkoutReply = () =>
    Promise.resolve(jsonResponse(502, { error: 'Payment could not be processed. Please try again later.' }));
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();

  userEvent.click(payButton());

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Payment could not be processed. Please try again later.',
  );
});

test('a changed total shows the message and reloads the cart, so the new total appears', async () => {
  checkoutReply = () => {
    // The cart changed on the server (another tab added a second oil): £49.00, free delivery.
    serverCart = {
      items: [{ ...oil, quantity: 2, line_total: '49.00' }],
      total: '49.00',
      delivery_charge: '0.00',
      order_total: '49.00',
      free_delivery_remaining: '0.00',
    };
    return Promise.resolve(jsonResponse(409, { error: 'Your cart has changed. Please check the new total.' }));
  };
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();

  userEvent.click(payButton());

  expect(await screen.findByRole('alert')).toHaveTextContent('Your cart has changed. Please check the new total.');
  expect(await screen.findByRole('button', { name: 'Pay £49.00' })).toBeInTheDocument();
  // The address the customer typed is still there.
  expect(screen.getByLabelText('Postcode')).toHaveValue('BS1 4AB');
});

test('empty-cart 400 reloads the cart', async () => {
  checkoutReply = () => {
    // Emptied in another tab while this page was open.
    serverCart = emptyCart;
    return Promise.resolve(jsonResponse(400, { error: 'Your cart is empty' }));
  };
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();

  userEvent.click(payButton());

  expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
});

test('401 goes to log in', async () => {
  checkoutReply = () => Promise.resolve(jsonResponse(401, { error: 'You must be logged in' }));
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();

  userEvent.click(payButton());

  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
});

test('after paying, the cart badge is emptied', async () => {
  await openCheckout();
  await screen.findByRole('button', { name: 'Pay £28.45' });
  fillAddress();

  // Before paying, the nav's cart link says there's 1 item.
  expect(screen.getByRole('link', { name: 'Cart, 1 item' })).toBeInTheDocument();

  userEvent.click(payButton());
  await screen.findByText('Thank you, your order is confirmed');

  // After paying, the cart is reloaded (empty), so the link has no count (see CartLink.js).
  // findBy waits, because the reload finishes just after the order page opens.
  expect(await screen.findByRole('link', { name: 'Cart' })).toBeInTheDocument();
});
