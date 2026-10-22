// Tests for what logged-in and logged-out visitors can see and do: the nav bar (layout B: only
// show what you can use) and the pages that need you to be logged in.
//
// renderAt(url, { customer }) (see ../test-utils.js) decides what GET /auth/me says, so each test
// can start logged in, logged out, or still checking.

// screen searches the fake page; within() searches inside one part of it.
import { screen, within } from '@testing-library/react';
// userEvent simulates a real person typing and clicking.
import userEvent from '@testing-library/user-event';
import { AUTH_PENDING, renderAt } from '../test-utils';
// order7: a sample order (one cleanser), shared by the order tests.
import { order7 } from '../orders/fixtures';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// Finds the main nav bar.
function findNav() {
  return screen.findByRole('navigation', { name: 'Main' });
}

// The name of every link in the nav, in order, e.g. ['Products', 'Log in', 'Register'].
// .map() turns each link element into its name: its aria-label if it has one (the cart link is
// an icon, so its name comes from aria-label, e.g. 'Cart'), otherwise its visible text.
// `??` uses the text when getAttribute returns null (no aria-label).
function navLinkNames(nav) {
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label') ?? link.textContent);
}

// ----- The nav bar -----

test('logged out, the nav shows only Products, Log in and Register', async () => {
  renderAt('/');
  const nav = await findNav();

  // findBy waits until the app has heard back from /auth/me and shows the Log in link.
  await within(nav).findByRole('link', { name: 'Log in' });
  expect(navLinkNames(nav)).toEqual(['Products', 'Log in', 'Register']);
  expect(within(nav).queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
});

test('logged in, the nav shows the shop links, a greeting and a Log out button', async () => {
  renderAt('/', { customer: ada });
  const nav = await findNav();

  expect(await within(nav).findByText('Hi, Ada')).toBeInTheDocument();
  expect(navLinkNames(nav)).toEqual(['Products', 'Cart', 'Orders', 'Account']);
  // Log out is a button, not a link: it changes something rather than going somewhere.
  expect(within(nav).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
});

test('while still checking who is logged in, the nav shows only Products', async () => {
  renderAt('/', { customer: AUTH_PENDING });
  const nav = await findNav();

  expect(navLinkNames(nav)).toEqual(['Products']);
  expect(within(nav).queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
});

test('says "Hi there" when the customer has no first name', async () => {
  // e.g. someone who signed in with Google, which didn't share their first name.
  renderAt('/', { customer: { ...ada, first_name: '' } });
  const nav = await findNav();

  expect(await within(nav).findByText('Hi there')).toBeInTheDocument();
});

// ----- Pages that need you to be logged in -----

// Each row is [url, the page's <h1> heading].
const protectedPages = [
  ['/account', 'Your account'],
  ['/cart', 'Your Cart'],
  ['/checkout', 'Checkout'],
  ['/orders', 'Your Orders'],
  ['/orders/7', 'Order #7'],
];

test.each(protectedPages)('logged out, %s sends you to the login page', async (url) => {
  renderAt(url);

  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
});

test.each(protectedPages)('logged in, %s shows the "%s" page', async (url, heading) => {
  renderAt(url, { customer: ada, orders: [order7] });

  expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
});

test('does not send you to the login page while still checking', async () => {
  // A logged-in customer opening /cart directly must not be bounced to Log in just because the
  // app hasn't heard back from /auth/me yet.
  renderAt('/cart', { customer: AUTH_PENDING });

  expect(await screen.findByText('Loading…')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 1, name: 'Log in' })).not.toBeInTheDocument();
});

// ----- Pages for logged-out visitors only -----

test.each(['/login', '/register'])(
  'logged in, %s sends you to the Products page',
  async (url) => {
    renderAt(url, { customer: ada });

    expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
  },
);

// ----- Logging in, registering and logging out -----

// Builds a fake fetch Response: `ok` is true for 2xx statuses, and json() resolves to `body`.
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Sets up a fake fetch for the requests these tests make (renderAt answers /auth/me itself).
// `logoutStatus` is what POST /auth/logout replies (204 = logged out).
function fakeApi({ logoutStatus = 204 } = {}) {
  global.fetch = jest.fn(async (url) => {
    if (url === '/auth/login') return jsonResponse(200, ada);
    if (url === '/auth/register') return jsonResponse(201, ada);
    if (url === '/auth/logout') return jsonResponse(logoutStatus, {});
    // /auth/providers: no Google or Facebook buttons.
    return jsonResponse(200, { google: false, facebook: false });
  });
}

// Fills in the login form and submits it.
async function logInWithForm() {
  userEvent.type(await screen.findByLabelText('Email'), ada.email);
  userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
  userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

test('logging in after being sent from /orders/7?tab=items returns there', async () => {
  fakeApi();
  // Logged out, so this page sends us to Log in, remembering where we wanted to go.
  const router = renderAt('/orders/7?tab=items', { orders: [order7] });
  await screen.findByRole('heading', { level: 1, name: 'Log in' });

  await logInWithForm();

  expect(await screen.findByRole('heading', { level: 1, name: 'Order #7' })).toBeInTheDocument();
  expect(screen.getByText('Gentle Cream Cleanser')).toBeInTheDocument();
  // router.state.location is where the app is now; the ?tab=items part must survive too.
  expect(router.state.location.search).toBe('?tab=items');
});

test('logging in with no wanted page goes to Products', async () => {
  fakeApi();
  renderAt('/login');

  await logInWithForm();

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
});

test('registering shows the logged-in nav on Products', async () => {
  fakeApi();
  renderAt('/register');
  await screen.findByLabelText('First name');

  userEvent.type(screen.getByLabelText('First name'), 'Ada');
  userEvent.type(screen.getByLabelText('Last name'), 'Lovelace');
  userEvent.type(screen.getByLabelText('Email'), ada.email);
  userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
  userEvent.type(screen.getByLabelText('Confirm password'), 'correct-horse-battery');
  userEvent.click(screen.getByRole('button', { name: 'Register' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
  const nav = await findNav();
  expect(await within(nav).findByText('Hi, Ada')).toBeInTheDocument();
});

// ----- Switching between Log in and Register keeps the page you wanted -----

// Fills in the registration form and submits it.
async function registerWithForm() {
  userEvent.type(await screen.findByLabelText('First name'), 'Ada');
  userEvent.type(screen.getByLabelText('Last name'), 'Lovelace');
  userEvent.type(screen.getByLabelText('Email'), ada.email);
  userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
  userEvent.type(screen.getByLabelText('Confirm password'), 'correct-horse-battery');
  userEvent.click(screen.getByRole('button', { name: 'Register' }));
}

// Clicks a link inside the page itself (<main>), not the nav's link with the same name: the
// logged-out nav also has "Log in" and "Register" links, which don't carry the wanted page.
async function clickPageLink(name) {
  userEvent.click(await within(screen.getByRole('main')).findByRole('link', { name }));
}

test('Add to cart → Log in → Register: registering returns to the product', async () => {
  fakeApi();
  const mug = {
    id: 1,
    category_id: null,
    sku: 'MUG-001',
    name: 'Coffee Mug',
    description: 'A 350ml ceramic mug',
    price: '8.50',
    stock_quantity: 5,
  };
  renderAt('/products/1', { products: [mug] });

  // Logged out, so Add to cart goes to Log in. This visitor has no account yet, so they follow
  // the page's link to Register.
  userEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
  await screen.findByRole('heading', { level: 1, name: 'Log in' });
  await clickPageLink('Register');
  await screen.findByRole('heading', { level: 1, name: 'Register' });

  await registerWithForm();

  expect(await screen.findByRole('heading', { level: 1, name: 'Coffee Mug' })).toBeInTheDocument();
});

test('Cart → Log in → Register → Log in: logging in still returns to Cart', async () => {
  fakeApi();
  renderAt('/cart');

  // Changing their mind twice must not lose the note saying they wanted the cart.
  await screen.findByRole('heading', { level: 1, name: 'Log in' });
  await clickPageLink('Register');
  await screen.findByRole('heading', { level: 1, name: 'Register' });
  await clickPageLink('Log in');
  await screen.findByRole('heading', { level: 1, name: 'Log in' });

  await logInWithForm();

  expect(await screen.findByRole('heading', { level: 1, name: 'Your Cart' })).toBeInTheDocument();
});

test('Log out from /cart lands on Products with the logged-out nav', async () => {
  fakeApi();
  const router = renderAt('/cart', { customer: ada });

  userEvent.click(await screen.findByRole('button', { name: 'Log out' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
  const nav = await findNav();
  expect(await within(nav).findByRole('link', { name: 'Log in' })).toBeInTheDocument();
  // Products, not the login page: Cart must not bounce us to Log in on the way out.
  expect(router.state.location.pathname).toBe('/');
  expect(screen.queryByRole('heading', { level: 1, name: 'Log in' })).not.toBeInTheDocument();
});

test('a failed logout shows the message and keeps the logged-in nav', async () => {
  fakeApi({ logoutStatus: 500 });
  renderAt('/', { customer: ada });

  userEvent.click(await screen.findByRole('button', { name: 'Log out' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not log out. Please try again.');
  expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
});

test('a 401 logout logs out normally', async () => {
  // 401: the server's session had already ended (e.g. it expired), so we're logged out anyway.
  fakeApi({ logoutStatus: 401 });
  renderAt('/', { customer: ada });

  userEvent.click(await screen.findByRole('button', { name: 'Log out' }));

  const nav = await findNav();
  expect(await within(nav).findByRole('link', { name: 'Log in' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
