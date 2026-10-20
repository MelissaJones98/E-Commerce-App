// Tests for AuthContext: the app-wide record of who's logged in.
//
// Each test draws a tiny "probe" component inside <AuthProvider>. The probe shows what
// useAuth() currently says, and has buttons that call setCustomer() and logout(), so the tests
// can check the context the way a page would use it. fetch is replaced by a fake for each test.

// render() draws components into the fake page; screen searches it.
import { render, screen } from '@testing-library/react';
// userEvent simulates a real person clicking.
import userEvent from '@testing-library/user-event';
// useState: lets the probe remember the error a failed logout threw.
import { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';

const ada = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

// Builds a fake fetch Response: `ok` is true for 2xx statuses, and json() resolves to `body`.
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// What the fake fetch answers. Each test sets these before drawing.
let meResponse;
let logoutResponse;

beforeEach(() => {
  meResponse = Promise.resolve(jsonResponse(200, { customer: null }));
  logoutResponse = Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
  // Answer each address with the matching response.
  global.fetch = jest.fn((url) => (url === '/auth/me' ? meResponse : logoutResponse));
});

afterEach(() => {
  delete global.fetch;
});

// The probe: shows useAuth()'s values as text, plus buttons to change them.
function Probe() {
  const { customer, checking, setCustomer, logout } = useAuth();
  const [logoutError, setLogoutError] = useState(null);

  // logout() throws if logging out failed; keep its message so the test can check it.
  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      setLogoutError(err.message);
    }
  }

  return (
    <div>
      <p>{checking ? 'checking' : 'checked'}</p>
      {/* `customer ? a : b`: show the name if someone's logged in, otherwise "nobody". */}
      <p>{customer ? `customer: ${customer.first_name}` : 'nobody'}</p>
      <button onClick={() => setCustomer(ada)}>set Ada</button>
      <button onClick={handleLogout}>log out</button>
      {logoutError && <p>error: {logoutError}</p>}
    </div>
  );
}

// Draws the probe inside the provider.
function renderProbe() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

test('checking is true until /auth/me answers', async () => {
  // Never answers: the app is still checking for the whole test.
  meResponse = new Promise(() => {});
  renderProbe();

  expect(screen.getByText('checking')).toBeInTheDocument();
  expect(screen.getByText('nobody')).toBeInTheDocument();
});

test('gives the logged-in customer from /auth/me', async () => {
  meResponse = Promise.resolve(jsonResponse(200, { customer: ada }));
  renderProbe();

  expect(await screen.findByText('customer: Ada')).toBeInTheDocument();
  expect(screen.getByText('checked')).toBeInTheDocument();
});

test('treats a failed /auth/me as logged out', async () => {
  meResponse = Promise.reject(new TypeError('Failed to fetch'));
  // Mark it handled now, so Node doesn't warn before the provider gets to it.
  meResponse.catch(() => {});
  renderProbe();

  expect(await screen.findByText('checked')).toBeInTheDocument();
  expect(screen.getByText('nobody')).toBeInTheDocument();
});

test('setCustomer updates everyone at once', async () => {
  renderProbe();
  await screen.findByText('checked');

  userEvent.click(screen.getByRole('button', { name: 'set Ada' }));

  expect(await screen.findByText('customer: Ada')).toBeInTheDocument();
});

test('a slow /auth/me answer does not undo a login that happened first', async () => {
  // The API is slow to say who's logged in (e.g. it's just starting up). Meanwhile the customer
  // logs in, so the page records them with setCustomer. When the old answer ("nobody") finally
  // arrives, it's out of date and must be ignored.
  // `new Promise((resolve) => ...)` hands us its resolve function, to answer whenever we like.
  let answerMe;
  meResponse = new Promise((resolve) => {
    answerMe = resolve;
  });
  renderProbe();

  userEvent.click(screen.getByRole('button', { name: 'set Ada' }));
  expect(await screen.findByText('customer: Ada')).toBeInTheDocument();
  // Logging in also settles the question, so the app stops "checking".
  expect(screen.getByText('checked')).toBeInTheDocument();

  // Now the stale answer arrives.
  answerMe(jsonResponse(200, { customer: null }));

  // Wait for a moment so the late answer gets processed, then check Ada is still logged in.
  // findBy... waits; it finds "checked" straight away, but by then React has had its chance.
  await screen.findByText('checked');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByText('customer: Ada')).toBeInTheDocument();
});

test('logout calls POST /auth/logout and clears the customer', async () => {
  meResponse = Promise.resolve(jsonResponse(200, { customer: ada }));
  renderProbe();
  await screen.findByText('customer: Ada');

  userEvent.click(screen.getByRole('button', { name: 'log out' }));

  expect(await screen.findByText('nobody')).toBeInTheDocument();
  // .find() returns the first fetch call whose url is /auth/logout; [1] is its options.
  const [, options] = global.fetch.mock.calls.find(([url]) => url === '/auth/logout');
  expect(options.method).toBe('POST');
});

test('logout treats 401 as already logged out', async () => {
  // 401: the server had no session (e.g. it expired), so there's nothing left to end.
  meResponse = Promise.resolve(jsonResponse(200, { customer: ada }));
  logoutResponse = Promise.resolve(jsonResponse(401, { error: 'You must be logged in' }));
  renderProbe();
  await screen.findByText('customer: Ada');

  userEvent.click(screen.getByRole('button', { name: 'log out' }));

  expect(await screen.findByText('nobody')).toBeInTheDocument();
  expect(screen.queryByText(/^error:/)).not.toBeInTheDocument();
});

test('logout keeps the customer and throws when the request fails', async () => {
  meResponse = Promise.resolve(jsonResponse(200, { customer: ada }));
  logoutResponse = Promise.resolve(jsonResponse(500, { error: 'Internal server error' }));
  renderProbe();
  await screen.findByText('customer: Ada');

  userEvent.click(screen.getByRole('button', { name: 'log out' }));

  expect(
    await screen.findByText('error: Could not log out. Please try again.'),
  ).toBeInTheDocument();
  // Still logged in: the app never pretends to be logged out while the server has the session.
  expect(screen.getByText('customer: Ada')).toBeInTheDocument();
});
