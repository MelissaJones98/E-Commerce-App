// Tests for the login page (/login).
//
// The page calls the API with fetch() twice: once when it opens (GET /auth/providers, to decide
// which "Sign in with..." links to show), and once to log in (POST /auth/login). jsdom (the fake
// browser these tests run in) has no fetch, so each test puts a fake ("mock") fetch in its place
// that answers each address with a response the test chooses.

// screen searches the fake page; within() searches inside one part of it.
import { screen, within } from '@testing-library/react';
// userEvent simulates a real person typing and clicking.
import userEvent from '@testing-library/user-event';
// renderAt(url) shows the app's real routes at `url` (see ../test-utils.js).
import { renderAt } from '../test-utils';

// The details typed into the form.
const email = 'ada@example.com';
const password = 'correct-horse-battery';

// Builds a fake fetch Response: `ok` is true for 2xx statuses, and json() resolves to `body`.
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// What the fake fetch returns for each address. Each test changes these before rendering.
// `let` because they're reassigned in beforeEach and in tests.
let providersResponse;
let loginResponse;

beforeEach(() => {
  // By default both providers are on, and logging in succeeds.
  providersResponse = Promise.resolve(jsonResponse(200, { google: true, facebook: true }));
  loginResponse = Promise.resolve(
    jsonResponse(200, { id: 1, first_name: 'Ada', last_name: 'Lovelace', email }),
  );
  // mockImplementation: every call runs this function with fetch's arguments, so the fake can
  // answer differently depending on the address.
  global.fetch = jest.fn((url) =>
    url === '/auth/providers' ? providersResponse : loginResponse,
  );
});

// Remove the mock so it can't leak into other test files.
afterEach(() => {
  delete global.fetch;
});

// Opens the login page (optionally with a ?query) and waits for it to appear.
async function openLogin(url = '/login') {
  renderAt(url);
  await screen.findByLabelText('Email');
}

// Fills in the form and clicks the Log in button.
function submitLogin() {
  userEvent.type(screen.getByLabelText('Email'), email);
  userEvent.type(screen.getByLabelText('Password'), password);
  userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

// Returns the arguments of the fetch call to /auth/login: [url, options].
// .find() returns the first call whose url matches.
function loginCall() {
  return global.fetch.mock.calls.find(([url]) => url === '/auth/login');
}

test('shows the Email and Password fields and a Log in button', async () => {
  await openLogin();

  expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
});

test('links to the registration page for people without an account', async () => {
  await openLogin();

  // The nav bar ALSO has a "Register" link, so search only inside the page's <main> area.
  const main = screen.getByRole('main');
  expect(within(main).getByText(/Don't have an account\?/)).toBeInTheDocument();
  userEvent.click(within(main).getByRole('link', { name: 'Register' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Register' })).toBeInTheDocument();
});

test('logs in with exactly email and password, then shows the Products page', async () => {
  await openLogin();

  submitLogin();

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
  const [, options] = loginCall();
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
  // toEqual fails if any other field is included.
  expect(JSON.parse(options.body)).toEqual({ email, password });
});

test("shows the API's error and stays on the form", async () => {
  loginResponse = Promise.resolve(jsonResponse(401, { error: 'Incorrect email or password' }));
  await openLogin();

  submitLogin();

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
  expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument();
  // The button is usable again, so they can correct the details and retry.
  expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
});

test('shows a friendly message when the server cannot be reached', async () => {
  // A rejected Promise: fetch fails outright, as it does when there's no connection.
  loginResponse = Promise.reject(new TypeError('Failed to fetch'));
  // Mark it as handled now, so Node doesn't warn before the page gets to it.
  loginResponse.catch(() => {});
  await openLogin();

  submitLogin();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not reach the server. Please try again.',
  );
});

test('disables the button and says "Logging in…" while waiting', async () => {
  // A Promise that never settles: the request stays "in flight" for the rest of the test.
  loginResponse = new Promise(() => {});
  await openLogin();

  submitLogin();

  expect(await screen.findByRole('button', { name: 'Logging in…' })).toBeDisabled();
});

test('shows a link for each enabled provider', async () => {
  await openLogin();

  // findBy... waits, because the provider links appear once /auth/providers answers.
  expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
    'href',
    '/auth/google',
  );
  expect(screen.getByRole('link', { name: 'Sign in with Facebook' })).toHaveAttribute(
    'href',
    '/auth/facebook',
  );
  expect(screen.getByText('or')).toBeInTheDocument();
});

test('hides a provider that is not set up', async () => {
  providersResponse = Promise.resolve(jsonResponse(200, { google: true, facebook: false }));
  await openLogin();

  expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
  // queryBy... returns null instead of throwing when nothing matches.
  expect(screen.queryByRole('link', { name: 'Sign in with Facebook' })).not.toBeInTheDocument();
});

test('shows no provider links, and still logs in, when the providers request fails', async () => {
  providersResponse = Promise.reject(new TypeError('Failed to fetch'));
  providersResponse.catch(() => {});
  await openLogin();

  expect(screen.queryByRole('link', { name: /Sign in with/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  submitLogin();

  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
});

// test.each runs the same test once per row, filling in `url` and `message`.
test.each([
  ['/login?error=cancelled&provider=google', 'Sign-in was cancelled.'],
  [
    '/login?error=no_email&provider=facebook',
    "Facebook didn't share your email address, so we couldn't sign you in. Please allow email access or use another way to log in.",
  ],
  [
    '/login?error=email_unverified&provider=google',
    "Your Google email address isn't verified, so we couldn't sign you in.",
  ],
])('shows a message for the sign-in error at %s', async (url, message) => {
  await openLogin(url);

  expect(screen.getByRole('alert')).toHaveTextContent(message);
});

test('shows a general message for an unknown error code, without echoing it', async () => {
  // %3Cscript%3E is "<script>" written in URL encoding.
  await openLogin('/login?error=%3Cscript%3E&provider=google');

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Something went wrong signing you in. Please try again.',
  );
  expect(screen.queryByText(/script/)).not.toBeInTheDocument();
});

test('shows a general message when the provider name is unknown', async () => {
  await openLogin('/login?error=no_email&provider=myspace');

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Something went wrong signing you in. Please try again.',
  );
});
