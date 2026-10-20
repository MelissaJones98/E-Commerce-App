// Functions that call the API's /auth endpoints. Pages use these instead of calling fetch
// directly, so the details of HTTP (URLs, headers, status codes) live in one place, and each
// failure becomes an Error whose message is ready to show to the customer.
//
// The URLs start with '/', so they go to the same address as the page itself. In development,
// Create React App's proxy (the "proxy" setting in package.json) passes them on to the API on
// port 3000. Because the browser only ever talks to one address, it sends the session cookie
// automatically.

// Messages shown to the customer. `const` values that never change are often written in
// UPPER_CASE so they stand out.
const NETWORK_ERROR = 'Could not reach the server. Please try again.';
const GENERIC_ERROR = 'Something went wrong. Please try again.';

// Sends `body` as JSON in a POST request to `url`, and returns the API's JSON reply.
// If anything goes wrong it throws an Error with a message ready to show the customer.
// It isn't exported: only the functions below use it.
// `async` makes the function return a Promise; `await` pauses until a Promise settles.
async function postJson(url, body) {
  // `let` declares a variable that can be reassigned. Declared here so it can be used after
  // the try/catch below.
  let response;
  try {
    // fetch(url, options) sends an HTTP request and resolves to the response.
    response = await fetch(url, {
      method: 'POST',
      // Tells Express the body is JSON, so express.json() parses it into req.body.
      headers: { 'Content-Type': 'application/json' },
      // JSON.stringify turns the object into JSON text, e.g. '{"email":"ada@example.com",...}'.
      body: JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when no response arrived at all (no connection, server unreachable).
    // `catch {` without `(err)` is allowed when we don't need the error itself.
    // `throw` stops this function and hands the Error to whoever called it.
    throw new Error(NETWORK_ERROR);
  }

  let data;
  try {
    // .json() reads the response body and parses it from JSON.
    data = await response.json();
  } catch {
    // The body wasn't JSON. Our API always sends JSON, so this reply came from something else,
    // e.g. the dev proxy's own error page when the API isn't running.
    throw new Error(NETWORK_ERROR);
  }

  // response.ok is true for 2xx statuses (e.g. 200 OK, 201 Created).
  if (!response.ok) {
    // The API explains errors as { error: '...' }. `?.` (optional chaining) gives undefined
    // instead of crashing if data is null; `??` uses GENERIC_ERROR if there's no message.
    throw new Error(data?.error ?? GENERIC_ERROR);
  }

  return data;
}

// Creates an account and (because the API logs you in on registering) starts a session.
// `details` is { first_name, last_name, email, password }.
// Resolves to the new customer, e.g. { id, first_name, last_name, email }.
// `export` lets other files import it: import { register } from '../api/auth'.
export function register(details) {
  return postJson('/auth/register', details);
}

// Logs in with an email and password, which starts a session (the API sets the cookie).
// `{ email, password }` destructures the argument, so only those two fields are ever sent.
// Resolves to the customer. A wrong email or password throws "Incorrect email or password".
export function login({ email, password }) {
  return postJson('/auth/login', { email, password });
}

// Asks the API who's logged in. Resolves to the customer ({ id, first_name, last_name, email })
// or null when nobody is. It never throws: if the API can't be reached, it resolves to null, so
// the app simply treats the visitor as logged out instead of crashing.
export async function getMe() {
  try {
    const response = await fetch('/auth/me');
    if (!response.ok) return null;
    const data = await response.json();
    // `?? null` turns a missing customer into null.
    return data.customer ?? null;
  } catch {
    return null;
  }
}

// Logs out: asks the API to end the session (it deletes the session and the cookie).
// Resolves when the customer is logged out on the server. A 401 counts too: it means the
// server had no session anyway (e.g. it expired), so there's nothing left to end.
// Throws an Error with a message ready to show if logging out didn't work.
export async function logout() {
  const LOGOUT_ERROR = 'Could not log out. Please try again.';
  let response;
  try {
    response = await fetch('/auth/logout', { method: 'POST' });
  } catch {
    // No response at all (no connection, server unreachable).
    throw new Error(LOGOUT_ERROR);
  }
  // 204 No Content: logged out. 401 Unauthorized: already logged out.
  // `||` means "or"; `!(...)` means "not".
  if (!(response.status === 204 || response.status === 401)) {
    throw new Error(LOGOUT_ERROR);
  }
}

// "No providers switched on": what getProviders() gives when it can't find out.
// Exported so the login page can start with this same object (see getProviders).
export const NO_PROVIDERS = { google: false, facebook: false };

// Asks the API which "Sign in with..." providers are switched on.
// Resolves to { google: true/false, facebook: true/false }. It never throws: if anything goes
// wrong it resolves to NO_PROVIDERS, so the page simply shows no provider links and the email
// form still works.
//
// It returns the NO_PROVIDERS object itself (not a copy). The page starts with that same
// object, and React skips re-drawing when state is set to the identical object.
export async function getProviders() {
  // One try around everything, because any step can fail: fetch missing or rejecting, a
  // non-JSON body, or even fetch returning nothing (response would be undefined).
  try {
    const response = await fetch('/auth/providers');
    if (!response.ok) return NO_PROVIDERS;
    const data = await response.json();
    // `=== true` turns anything unexpected (missing, "yes", 1) into false.
    return { google: data.google === true, facebook: data.facebook === true };
  } catch {
    return NO_PROVIDERS;
  }
}
