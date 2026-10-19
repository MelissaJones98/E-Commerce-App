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

// Creates an account and (because the API logs you in on registering) starts a session.
// `details` is { first_name, last_name, email, password }.
// `async` makes the function return a Promise; `await` pauses until a Promise settles.
// `export` lets other files import it: import { register } from '../api/auth'.
export async function register(details) {
  // `let` declares a variable that can be reassigned. Declared here so it can be used after
  // the try/catch below.
  let response;
  try {
    // fetch(url, options) sends an HTTP request and resolves to the response.
    response = await fetch('/auth/register', {
      method: 'POST',
      // Tells Express the body is JSON, so express.json() parses it into req.body.
      headers: { 'Content-Type': 'application/json' },
      // JSON.stringify turns the object into JSON text, e.g. '{"email":"ada@example.com",...}'.
      body: JSON.stringify(details),
    });
  } catch {
    // fetch only rejects when no response arrived at all (no connection, server unreachable).
    // `catch {` without `(err)` is allowed when we don't need the error itself.
    // `throw` stops this function and hands the Error to whoever called it.
    throw new Error(NETWORK_ERROR);
  }

  let body;
  try {
    // .json() reads the response body and parses it from JSON.
    body = await response.json();
  } catch {
    // The body wasn't JSON. Our API always sends JSON, so this reply came from something else,
    // e.g. the dev proxy's own error page when the API isn't running.
    throw new Error(NETWORK_ERROR);
  }

  // response.ok is true for 2xx statuses (here 201 Created).
  if (!response.ok) {
    // The API explains errors as { error: '...' }. `?.` (optional chaining) gives undefined
    // instead of crashing if body is null; `??` uses GENERIC_ERROR if there's no message.
    throw new Error(body?.error ?? GENERIC_ERROR);
  }

  // Success: the new customer, e.g. { id, first_name, last_name, email }.
  return body;
}
