# Design: Registration page

Date: 2026-10-16
Ticket: "The registration page should allow the user to create a new account using an email and
password. It must also include a link to the login page if the user already has an account.
Create a form for users to register for a new account. Use bcrypt.js to modify the registration
endpoint handler to hash and salt the password in order to ensure secure storage. After users
register for an account they should automatically be signed in."

## Goal
A working registration page at `/register`. It is the first front-end page that talks to the API.
A visitor fills in the form, an account is created with a salted bcrypt hash of their password,
they are signed in straight away (session cookie), and they land on the Products page.

### Done when
- `/register` shows a form (first name, last name, email, password, confirm password) and a link
  to `/login`.
- Submitting valid details creates the account, signs the customer in and shows Products.
- Mismatched passwords, API errors (400, 409) and an unreachable server each show a clear message
  and keep the customer on the form.
- Password hashing uses **`bcryptjs`** (pure JavaScript), not `bcrypt`.
- Back-end, front-end and E2E tests pass. The new tests were written, and seen failing, first.

### Out of scope
- **A "who's logged in" display or log-out button in the nav**, and hiding Log in / Register when
  logged in. These come with the login ticket.
- **Protected routes.**
- **Production hosting** (serving the front end and API together, or CORS). This comes with the
  Render deployment ticket.

## Decisions
- **"Username" means email.** The API, database and login already identify customers by email.
  Registration also requires first and last name (existing API rules, unchanged).
- **Switch `bcrypt` → `bcryptjs` (v3).** The user's choice, to match the ticket and stay in pure
  JavaScript. Same algorithm, same `hash`/`compare` API, and compatible hashes (`$2b$...`), so
  existing accounts still log in. The 72-byte limit is part of the algorithm and still applies,
  so the existing validation stays. `SALT_ROUNDS` stays 12.
- **Registering signs you in.** `POST /auth/register` calls `req.login(customer)` after the
  INSERT, then replies `201` with the customer, as before. A failed registration sets no session.
- **After registering, go to Products (`/`).**
- **Confirm password is checked in the browser only.** It is never sent to the API.
- **Controlled form with `useState`** (the user's choice over a React Router action).
- **API calls live in `src/api/auth.js`**, not in the page.
- **Dev proxy.** `front-end/package.json` has `"proxy": "http://localhost:3000"`, and
  `front-end/.env.development` sets `PORT=3001`. It's `.env.development` because the root
  `.gitignore` ignores files named `.env`, and this file holds nothing secret, so it is committed.
  The browser only talks to `:3001`, so the session cookie works with no CORS.

## Back end
- **`package.json`:** remove `bcrypt`, add `bcryptjs@^3.0.3`.
- **Change the import to `import bcrypt from 'bcryptjs'`** in `routes/auth.js`,
  `config/passport.js` and `tests/auth.register.test.js`. Update comments that mention the
  package.
- **`routes/auth.js` register handler:** after the INSERT succeeds, call
  `req.login(customer, (err) => ...)`. On error, pass it to `next(err)`. On success, reply
  `res.status(201).json(customer)`. The handler gains the `next` parameter.
- **New tests in `tests/auth.register.test.js`** (written first):
  - a successful registration's response has a `Set-Cookie` session cookie;
  - the same agent can `GET /account` straight after registering and gets 200 with the new
    customer's details (no separate login);
  - a 400 (invalid details) and a 409 (duplicate email) registration set no cookie, and a
    following `GET /account` with that agent is 401.

## Front end
- **`src/api/auth.js`** exports `async function register(details)`:
  - `fetch('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details) })`;
  - if `fetch` itself rejects (no connection), or the response body isn't JSON, it throws
    `Error('Could not reach the server. Please try again.')`. (When the API is down, CRA's
    proxy answers 500 with a non-JSON body.)
  - If the response is not OK, it throws `Error(body.error)`, the API's own message, falling
    back to `'Something went wrong. Please try again.'` if there is none;
  - otherwise it returns the parsed customer object.
- **`src/pages/RegisterPage.js`**:
  - **State:** `form` (an object with `first_name`, `last_name`, `email`, `password`,
    `confirm_password`, all `''` to start), `error` (`null` or a message) and `submitting`
    (`false`).
  - **`handleChange`:** one function for all inputs, which updates `form[event.target.name]`.
  - **Fields:** each has a `<label htmlFor>` and an `id`.
    - The labels are "First name", "Last name", "Email", "Password" and "Confirm password".
    - Every field is `required`.
    - Email is `type="email"`.
    - The two password fields are `type="password"`, `minLength={8}` and
      `autoComplete="new-password"`.
  - **`handleSubmit`** (the user writes this part):
    - `event.preventDefault()`.
    - If `password !== confirm_password`, set the error to `'Passwords do not match'` and stop.
    - Otherwise clear the error, set `submitting`, and await `register()` with the four API
      fields.
    - On success, `navigate('/')`. On failure, show `err.message` and clear `submitting`.
  - **Error message:** shown in `<p role="alert">` when `error` is set.
  - **Submit button:** reads "Register", and "Creating account…" with `disabled` while submitting.
  - **Below the form:** "Already have an account? Log in", where "Log in" is a `<Link>` to `/login`.
  - The page keeps its `<h1>Register</h1>`, so the existing routing tests still pass.
- **Styles:** a small amount in `App.css` for the form (stacked labels and inputs, an error
  colour).

## Testing
- **Back end:** the three new tests above, plus the existing 260 tests, which must pass after the
  `bcryptjs` switch.
- **Front end:** a new `src/pages/RegisterPage.test.js`.
  - It renders the app's real routes at `/register` with a memory router.
  - It replaces `global.fetch` with a `jest.fn()` in each test, because jsdom has no fetch.
  - Tests:
    - all five labelled fields and the Register button are shown;
    - the "Log in" link opens the Log in page;
    - a valid submit calls fetch once with `/auth/register`, POST, a JSON content type and a
      body of exactly the four API fields (no `confirm_password`), then the Products heading
      appears;
    - mismatched passwords show "Passwords do not match", and fetch is never called;
    - an API error (409, `{ error: 'An account with this email already exists' }`) shows that
      message and stays on Register;
    - fetch rejecting (network down) shows "Could not reach the server. Please try again.";
    - while the request is pending, the button is disabled and reads "Creating account…".
- **Real check:** start the API (`start:test`) and the React dev server. POST to
  `http://localhost:3001/auth/register` through the proxy, then GET `/account` with the
  returned cookie and expect 200.
- **E2E (Newman):** in the register request's tests, also assert that the response sets a
  cookie. Add a `GET /account` straight after registering that expects 200 (before the existing
  login step).

## Docs
- **README:**
  - The front end runs on **3001**, proxying to the API on 3000.
  - A usage note for the Register page.
  - The register endpoint docs: "registering logs you in".
  - Updated test counts.
  - `bcrypt` → `bcryptjs` wherever the README names it.
- **`openapi.yaml`:** the register description now says it logs you in, with a `Set-Cookie`
  response header on 201.
- **`docs/api-endpoints.md`:** the same note.
