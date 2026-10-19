// Tests for the registration page (/register).
//
// The page calls the API with fetch(). jsdom (the fake browser these tests run in) has no
// fetch, and the tests must not need a running server anyway, so each test puts a fake
// ("mock") fetch in its place, decides what it returns, and checks how it was called.

// screen searches the fake page; within() searches inside one part of it.
import { screen, within } from '@testing-library/react';
// userEvent simulates a real person typing and clicking.
import userEvent from '@testing-library/user-event';
// renderAt(url) shows the app's real routes at `url` (see ../test-utils.js).
import { renderAt } from '../test-utils';

// What the form is filled in with, keyed by each field's label text.
const validDetails = {
  'First name': 'Ada',
  'Last name': 'Lovelace',
  Email: 'ada@example.com',
  Password: 'correct-horse-battery',
  'Confirm password': 'correct-horse-battery',
};

// Builds a fake fetch Response: `ok` is true for 2xx statuses, and json() resolves to `body`.
// `async () => body` is an arrow function returning a Promise of body, like the real json().
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Types each value into the field with that label. `overrides` replaces some values, e.g.
// fillForm({ 'Confirm password': 'oops' }). `= {}` is a default: no argument means no overrides.
function fillForm(overrides = {}) {
  // `{ ...a, ...b }` copies a's properties, then b's (b wins where both have the same key).
  const values = { ...validDetails, ...overrides };
  // Object.entries() turns { label: value } into a list of [label, value] pairs.
  for (const [label, value] of Object.entries(values)) {
    userEvent.type(screen.getByLabelText(label), value);
  }
}

// Clicks the submit button. Its name changes to "Creating account…" while sending.
function clickRegister() {
  userEvent.click(screen.getByRole('button', { name: 'Register' }));
}

// Before each test, replace fetch with a fresh Jest mock function (jest.fn()), which records
// every call. Each test then says what it should return.
beforeEach(() => {
  global.fetch = jest.fn();
});

// After each test, remove the mock so it can't leak into other test files.
afterEach(() => {
  delete global.fetch;
});

test('shows the five labelled fields and a Register button', async () => {
  renderAt('/register');

  // findBy... waits for the page; getByLabelText finds an input by its <label> text.
  expect(await screen.findByLabelText('First name')).toBeInTheDocument();
  expect(screen.getByLabelText('Last name')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'password');
  expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled();
});

test('links to the login page for people who already have an account', async () => {
  renderAt('/register');

  // The nav bar ALSO has a "Log in" link, so search only inside the page's <main> area.
  const main = await screen.findByRole('main');
  expect(within(main).getByText(/Already have an account\?/)).toBeInTheDocument();
  userEvent.click(within(main).getByRole('link', { name: 'Log in' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
});

test('registers with exactly the four API fields, then shows the Products page', async () => {
  // mockResolvedValue: every call to the mock returns a Promise of this response.
  global.fetch.mockResolvedValue(
    jsonResponse(201, { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' }),
  );
  renderAt('/register');
  await screen.findByLabelText('First name');

  fillForm();
  clickRegister();

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  // mock.calls[0] is the list of arguments of the first call: [url, options].
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('/auth/register');
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
  // The body is a JSON string; parse it back to check it has exactly these fields
  // (toEqual fails if confirm_password or anything else is included).
  expect(JSON.parse(options.body)).toEqual({
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse-battery',
  });
});

test('shows an error and does not call the API when the passwords do not match', async () => {
  renderAt('/register');
  await screen.findByLabelText('First name');

  fillForm({ 'Confirm password': 'a-different-password' });
  clickRegister();

  // role="alert" makes screen readers announce the message as soon as it appears.
  expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match');
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { level: 1, name: 'Register' })).toBeInTheDocument();
});

test("shows the API's error message and stays on the form", async () => {
  global.fetch.mockResolvedValue(
    jsonResponse(409, { error: 'An account with this email already exists' }),
  );
  renderAt('/register');
  await screen.findByLabelText('First name');

  fillForm();
  clickRegister();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'An account with this email already exists',
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Register' })).toBeInTheDocument();
  // The button is usable again, so they can fix the email and retry.
  expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled();
});

test('shows a friendly message when the server cannot be reached', async () => {
  // mockRejectedValue: fetch fails outright, as it does when there's no connection.
  global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  renderAt('/register');
  await screen.findByLabelText('First name');

  fillForm();
  clickRegister();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not reach the server. Please try again.',
  );
});

test("shows a friendly message when the dev proxy answers with its own (non-JSON) error", async () => {
  // When the API isn't running, CRA's proxy replies 500 with a plain-text body, so json() throws.
  global.fetch.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => {
      throw new SyntaxError('Unexpected token P in JSON at position 0');
    },
  });
  renderAt('/register');
  await screen.findByLabelText('First name');

  fillForm();
  clickRegister();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not reach the server. Please try again.',
  );
});

test('shows a general message when an error response has no error text', async () => {
  global.fetch.mockResolvedValue(jsonResponse(500, {}));
  renderAt('/register');
  await screen.findByLabelText('First name');

  fillForm();
  clickRegister();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong. Please try again.',
  );
});

test('disables the button and says "Creating account…" while waiting for the API', async () => {
  // A Promise that never settles: the request stays "in flight" for the rest of the test.
  global.fetch.mockReturnValue(new Promise(() => {}));
  renderAt('/register');
  await screen.findByLabelText('First name');

  fillForm();
  clickRegister();

  expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled();
});

test('sends only one request when Register is clicked twice', async () => {
  global.fetch.mockReturnValue(new Promise(() => {}));
  renderAt('/register');
  await screen.findByLabelText('First name');

  fillForm();
  clickRegister();
  // Wait for the button to switch to its disabled "sending" state, then click it again.
  const button = await screen.findByRole('button', { name: 'Creating account…' });
  userEvent.click(button);

  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('lets you fix a mistake and register successfully', async () => {
  global.fetch.mockResolvedValue(
    jsonResponse(201, { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' }),
  );
  renderAt('/register');
  await screen.findByLabelText('First name');

  // First attempt: mismatched passwords.
  fillForm({ 'Confirm password': 'a-different-password' });
  clickRegister();
  await screen.findByRole('alert');

  // Fix it: clear the confirm field and type the matching password, then try again.
  userEvent.clear(screen.getByLabelText('Confirm password'));
  userEvent.type(screen.getByLabelText('Confirm password'), 'correct-horse-battery');
  clickRegister();

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
});

test('after an API error, you can change your details and retry successfully', async () => {
  // The retry's response is held back until we release it, so the test can look at the page
  // while that request is still in flight. `new Promise((resolve) => ...)` hands us the
  // promise's resolve function; calling releaseRetry(response) later settles it.
  let releaseRetry;
  const retryResponse = new Promise((resolve) => {
    releaseRetry = resolve;
  });
  // mockResolvedValueOnce / mockReturnValueOnce set the result of one call each, in order:
  // the first fetch gets a 409, the second gets the held-back promise.
  global.fetch
    .mockResolvedValueOnce(jsonResponse(409, { error: 'An account with this email already exists' }))
    .mockReturnValueOnce(retryResponse);
  renderAt('/register');
  await screen.findByLabelText('First name');

  // First attempt: the API says the email is taken.
  fillForm();
  clickRegister();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'An account with this email already exists',
  );

  // Change the email and try again. clickRegister() finds the button by the name "Register",
  // so this also checks the button went back to normal after the error.
  userEvent.clear(screen.getByLabelText('Email'));
  userEvent.type(screen.getByLabelText('Email'), 'ada.lovelace@example.com');
  clickRegister();

  // While the retry is in flight, the old error has gone. queryBy... returns null instead of
  // throwing when nothing matches, so it can check something is NOT on the page.
  expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  // Let the retry succeed: the customer lands on the Products page.
  releaseRetry(
    jsonResponse(201, {
      id: 1,
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada.lovelace@example.com',
    }),
  );
  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();

  // Two requests in total, and the second one sent the corrected email.
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(global.fetch.mock.calls[1][1].body).email).toBe('ada.lovelace@example.com');
});
