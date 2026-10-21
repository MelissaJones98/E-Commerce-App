// Tests for Add to cart on a product's page (AddToCart.js): the quantity box, the button, its
// messages, the cart badge updating, and what happens when you're logged out.
// They open the real product page with renderAt (test-utils.js), so the real nav, cart context
// and login pages are all involved. renderAt answers GET /auth/me, GET /products/:id and GET
// /cart; this file's fake fetch answers everything else (POST /cart/items, the login form).

// fireEvent sends a single browser event straight to an element (lower-level than userEvent).
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AUTH_PENDING, renderAt } from '../test-utils';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// 5 in stock, so quantities from 1 to 5 are allowed.
const mug = {
  id: 1,
  category_id: null,
  sku: 'MUG-001',
  name: 'Coffee Mug',
  description: 'A 350ml ceramic mug',
  price: '8.50',
  stock_quantity: 5,
};
const teapot = { ...mug, id: 2, sku: 'POT-001', name: 'Teapot', stock_quantity: 0 };
const products = [mug, teapot];

// A cart holding `quantity` mugs: what the API replies with after adding.
function cartOf(quantity) {
  return {
    items: [{ product_id: 1, sku: 'MUG-001', name: 'Coffee Mug', price: '8.50', quantity, line_total: '17.00' }],
    total: '17.00',
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// What POST /cart/items replies. Each test can change it before clicking.
let addReply;

beforeEach(() => {
  addReply = Promise.resolve(jsonResponse(201, cartOf(2)));
  global.fetch = jest.fn((url) => {
    if (url === '/cart/items') return addReply;
    if (url === '/auth/login') return Promise.resolve(jsonResponse(200, ada));
    // /auth/providers: no Google or Facebook buttons on the login page.
    return Promise.resolve(jsonResponse(200, { google: false, facebook: false }));
  });
});

// Every POST /cart/items the page sent. (global.fetch is renderAt's wrapper; it records every
// call, including the ones it answers itself.)
function addRequests() {
  return global.fetch.mock.calls.filter(([url]) => url === '/cart/items');
}

// Opens a product page and waits for it to load.
async function openProduct(id, options) {
  renderAt(`/products/${id}`, { products, ...options });
  await screen.findByRole('heading', { level: 1, name: id === 1 ? 'Coffee Mug' : 'Teapot' });
}

function quantityBox() {
  // A number input has the role "spinbutton".
  return screen.getByRole('spinbutton', { name: 'Quantity' });
}
function addButton() {
  return screen.getByRole('button', { name: 'Add to cart' });
}
// Replaces whatever is in the quantity box with `text`.
function setQuantity(text) {
  userEvent.clear(quantityBox());
  if (text !== '') userEvent.type(quantityBox(), text);
}

async function logInWithForm() {
  userEvent.type(await screen.findByLabelText('Email'), ada.email);
  userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
  userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

test('shows a Quantity box starting at 1 and an Add to cart button', async () => {
  await openProduct(1, { customer: ada });

  // toHaveValue(1): number inputs report their value as a number.
  expect(quantityBox()).toHaveValue(1);
  expect(quantityBox()).toHaveAttribute('min', '1');
  expect(quantityBox()).toHaveAttribute('max', '5');
  expect(addButton()).toBeEnabled();
});

test('adds the chosen quantity and confirms', async () => {
  await openProduct(1, { customer: ada });

  setQuantity('2');
  userEvent.click(addButton());

  expect(await screen.findByRole('status')).toHaveTextContent('✓ Added 2 to your cart.');
  // Exactly the product and quantity, as JSON.
  const [, options] = addRequests()[0];
  expect(JSON.parse(options.body)).toEqual({ product_id: 1, quantity: 2 });
  // The badge shows the cart the API sent back (2 mugs).
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(await within(nav).findByRole('link', { name: 'Cart, 2 items' })).toBeInTheDocument();
});

test('says "Adding…" and disables the button while sending', async () => {
  addReply = new Promise(() => {}); // never answers
  await openProduct(1, { customer: ada });

  userEvent.click(addButton());

  const button = await screen.findByRole('button', { name: 'Adding…' });
  expect(button).toBeDisabled();
});

test('sends one request on a double click', async () => {
  addReply = new Promise(() => {});
  await openProduct(1, { customer: ada });

  userEvent.dblClick(addButton());
  await screen.findByRole('button', { name: 'Adding…' });

  expect(addRequests()).toHaveLength(1);
});

test('sends one request when the form is submitted twice before it can re-draw', async () => {
  // In a real browser, two quick clicks (or pressing Enter twice) can both arrive before React
  // has re-drawn the button as disabled. fireEvent.submit sends the form's "submit" event
  // directly, the way the browser would, without waiting for the button: so this checks the
  // component's own guard, not just the disabled button.
  addReply = new Promise(() => {});
  await openProduct(1, { customer: ada });
  // .closest('form') walks up from the button to its form.
  const form = addButton().closest('form');

  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(addRequests()).toHaveLength(1);
});

test('shows the API message when there is not enough stock', async () => {
  addReply = Promise.resolve(
    jsonResponse(409, { error: 'Not enough stock: 5 available, 3 already in your cart' }),
  );
  // The cart already holds 3 mugs.
  await openProduct(1, { customer: ada, cart: cartOf(3) });
  const nav = screen.getByRole('navigation', { name: 'Main' });
  await within(nav).findByRole('link', { name: 'Cart, 3 items' });

  setQuantity('3');
  userEvent.click(addButton());

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Not enough stock: 5 available, 3 already in your cart',
  );
  // The badge hasn't changed.
  expect(within(nav).getByRole('link', { name: 'Cart, 3 items' })).toBeInTheDocument();
});

test('shows a friendly message when the server cannot be reached', async () => {
  addReply = Promise.reject(new TypeError('Failed to fetch'));
  addReply.catch(() => {});
  await openProduct(1, { customer: ada });

  userEvent.click(addButton());

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not add to your cart. Please try again.',
  );
});

test('shows a friendly message for an unexpected server error', async () => {
  addReply = Promise.resolve(jsonResponse(500, { error: 'Internal server error' }));
  await openProduct(1, { customer: ada });

  userEvent.click(addButton());

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not add to your cart. Please try again.',
  );
});

// test.each runs one test per value: 0, more than the stock, a decimal, and an empty box.
test.each([['0'], ['6'], ['2.5'], ['']])(
  'quantity "%s" disables the button and sends nothing',
  async (text) => {
    await openProduct(1, { customer: ada });

    setQuantity(text);

    expect(addButton()).toBeDisabled();
    userEvent.click(addButton());
    expect(addRequests()).toHaveLength(0);
  },
);

test('a sold-out product shows a disabled "Out of stock" button and no quantity box', async () => {
  await openProduct(2, { customer: ada });

  expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  expect(screen.queryByRole('spinbutton', { name: 'Quantity' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
});

test('logged out, Add to cart goes to Log in, and logging in comes back here', async () => {
  await openProduct(1); // logged out (renderAt's default)

  userEvent.click(addButton());
  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();

  await logInWithForm();

  expect(await screen.findByRole('heading', { level: 1, name: 'Coffee Mug' })).toBeInTheDocument();
  // Nothing was added: the customer chooses again now they're logged in.
  expect(addRequests()).toHaveLength(0);
});

test('while the app is still checking who is logged in, Add to cart waits', async () => {
  // /auth/me never answers, so the app doesn't yet know whether this visitor is logged in. The
  // product loads anyway (it's public). Treating "don't know yet" as "logged out" would send a
  // logged-in customer to the Log in page, so the button must wait instead.
  await openProduct(1, { customer: AUTH_PENDING });

  expect(addButton()).toBeDisabled();
  userEvent.click(addButton());

  expect(screen.queryByRole('heading', { level: 1, name: 'Log in' })).not.toBeInTheDocument();
  expect(addRequests()).toHaveLength(0);
});

test('a 401 (the session expired) logs you out and goes to Log in', async () => {
  addReply = Promise.resolve(jsonResponse(401, { error: 'You must be logged in' }));
  await openProduct(1, { customer: ada });

  userEvent.click(addButton());

  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
  // The nav now shows the logged-out links.
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(await within(nav).findByRole('link', { name: 'Log in' })).toBeInTheDocument();

  // Logging in again returns to the product.
  await logInWithForm();
  expect(await screen.findByRole('heading', { level: 1, name: 'Coffee Mug' })).toBeInTheDocument();
});

test('a new add clears the previous message', async () => {
  addReply = Promise.resolve(jsonResponse(500, {}));
  await openProduct(1, { customer: ada });
  userEvent.click(addButton());
  await screen.findByRole('alert');

  // The second try succeeds: the error goes and the confirmation shows.
  addReply = Promise.resolve(jsonResponse(201, cartOf(1)));
  userEvent.click(addButton());

  expect(await screen.findByRole('status')).toHaveTextContent('✓ Added 1 to your cart.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
