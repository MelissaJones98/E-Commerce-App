// requestJson(): the one place the products and cart API functions send requests from.
// It's like postJson in auth.js, but works for any method (GET, POST, ...), and every Error it
// throws has a `status`, so a page can react differently to e.g. 404 (not found), 401 (logged
// out) and 409 (not enough stock).
//
// The URLs start with '/', so they go to the same address as the page itself; in development,
// Create React App's proxy passes them on to the API (see auth.js for more).

// The message used when the API's reply doesn't explain what went wrong.
const GENERIC_ERROR = 'Something went wrong. Please try again.';

// Makes an Error with a `status` property attached. Errors are ordinary objects, so extra
// properties can be added to them like any other object.
function requestError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Sends a request and returns the API's JSON reply.
//   url      e.g. '/products'
//   options  passed straight to fetch, e.g. { method: 'POST', headers: {...}, body: '...' }.
//            `= undefined` isn't needed: a parameter that isn't passed is simply undefined, and
//            fetch(url, undefined) sends a plain GET.
// Resolves to the parsed JSON (or null for 204 No Content, which has no body).
// Throws an Error with `status` (the HTTP status, or 0 if no usable reply arrived) and a
// `message` (the API's own { error } text, or GENERIC_ERROR).
export async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    // No response at all (no connection, server unreachable): there is no HTTP status, so 0.
    throw requestError(0, GENERIC_ERROR);
  }

  // 204 No Content: success with nothing to read.
  if (response.status === 204) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    // Not JSON: our API always sends JSON, so this reply came from something else, such as the
    // dev proxy's own error page when the API isn't running. Treat it like no reply (0).
    throw requestError(0, GENERIC_ERROR);
  }

  if (!response.ok) {
    // `?.` gives undefined instead of crashing if data is null; `??` then uses GENERIC_ERROR.
    throw requestError(response.status, data?.error ?? GENERIC_ERROR);
  }

  return data;
}
