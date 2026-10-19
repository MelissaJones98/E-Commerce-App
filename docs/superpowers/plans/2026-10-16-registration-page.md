# Registration Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working `/register` page. Its form creates an account (password hashed with
`bcryptjs`), signs the new customer in, and takes them to Products.

**Architecture:**
- **Back end:** swap `bcrypt` for `bcryptjs`, and make `POST /auth/register` call `req.login()`
  after the INSERT, so registering sets the session cookie.
- **Front end:** the CRA dev server moves to port 3001 and proxies API requests to `:3000`, so
  the cookie is same-origin.
- **`src/api/auth.js`** wraps `fetch` and turns failures into friendly `Error` messages.
- **`RegisterPage`** is a controlled `useState` form. **The user writes its `handleSubmit`**
  (Learn by Doing).

**Tech Stack:**
- Back end: Express 5, Passport 0.7, express-session, `bcryptjs` 3, `node:test` + supertest,
  Newman.
- Front end: React 19 (Create React App), React Router 7, Jest 27 + React Testing Library 16,
  user-event 13.

**Spec:** `docs/superpowers/specs/2026-10-16-registration-page-design.md`

## Global Constraints
- **The working directory is the repo root.** Run npm with `--prefix back-end` or
  `--prefix front-end`. The PowerShell tool is Windows PowerShell 5.1: no `&&`; set env vars with
  `$env:NAME = 'value'; cmd`.
- **A hook blocks reading `.env*` files**, and blocks *Bash* commands that mention them. Create
  `front-end/.env.development` with PowerShell `Set-Content`, and never print a `.env` file's
  values.
- **Back-end tests:** `npm test --prefix back-end`. The full run takes 2–3 minutes (bcrypt), so
  run it in the background or with a long timeout, and redirect the output to a file. To run one
  file: `npm test --prefix back-end -- tests/auth.register.test.js`.
- **Front-end tests:** `$env:CI = 'true'; npm test --prefix front-end -- --watchAll=false`.
- **`bcryptjs@^3.0.3`.** Import it as `import bcrypt from 'bcryptjs'` (it keeps the variable
  name `bcrypt`). `SALT_ROUNDS` stays 12.
- **Exact text, which the tests depend on:**
  - labels: "First name", "Last name", "Email", "Password", "Confirm password";
  - the button: "Register", or "Creating account…" while submitting (a single `…` character);
  - errors: "Passwords do not match", "Could not reach the server. Please try again." and
    "Something went wrong. Please try again.";
  - below the form: "Already have an account?" followed by a link "Log in" to `/login`.
- **The request body has exactly** `first_name`, `last_name`, `email`, `password`. The confirm
  password is never sent.
- **Fully annotate everything** you write: JS, JSX, tests, CSS, YAML, the Postman scripts and
  `.env.development`. Comment every block, and explain syntax the first time it appears in each
  file.
- **The user commits themselves.** No `git commit`; the final task gives a commit message.
- **Learn by Doing:** the user writes `handleSubmit` in `RegisterPage.js`. There must be exactly
  one `TODO(human)` in the codebase at a time. After making the request, **stop and wait** for the
  user.

## Review Focus
Inputs the spec implies but doesn't list. Each has a test in Task 3:
- **Double-clicking "Register"** must send only one request. The second click lands on a
  disabled button.
- **The CRA proxy's own error page** (API not running: 500 with a non-JSON body) must show "Could
  not reach the server…", not crash or show a JSON parse error.
- **An error response without an `error` field** (e.g. 500 `{}`) must show "Something went
  wrong. Please try again.", not "undefined".
- **Recovering after an error:** after a mismatch or API error, correcting the form and
  resubmitting must work, with the button enabled again.
- **A rejected registration must not leave you logged in** (400 or 409). This is in Task 2's
  back-end tests.

---

### Task 1: Switch the back end from `bcrypt` to `bcryptjs`

A like-for-like swap. The existing tests are the safety net: registration checks the stored
hash with `compare`, and login uses `compare` through Passport.

**Files:**
- Modify: `back-end/package.json`, `back-end/package-lock.json` (via npm)
- Modify: `back-end/routes/auth.js` (import, line 7–8 comment)
- Modify: `back-end/config/passport.js` (import, line 16–17 comment)
- Modify: `back-end/tests/auth.register.test.js` (import, line 22–23 comment)

**Interfaces:**
- Produces: the same `bcrypt.hash(password, rounds)` and `bcrypt.compare(password, hash)` calls
  as before, now from `bcryptjs`.

- [ ] **Step 1: Install `bcryptjs`, then remove `bcrypt`**

```powershell
npm install bcryptjs@^3.0.3 --prefix back-end; npm uninstall bcrypt --prefix back-end
```
Expected: `back-end/package.json` lists `"bcryptjs": "^3.0.3"`, and `bcrypt` is gone.

- [ ] **Step 2: Watch the suite break (the "red" for this swap)**

Run: `npm test --prefix back-end -- tests/auth.register.test.js`
Expected: FAIL with `Cannot find package 'bcrypt'` (`ERR_MODULE_NOT_FOUND`). This proves these
files really depended on the old package.

- [ ] **Step 3: Change the three imports**

In `back-end/routes/auth.js`, replace lines 7–8:
```js
// bcryptjs: turns passwords into one-way "hashes" that are safe to store.
// It's a pure-JavaScript version of bcrypt (no C++ add-on to compile), with
// the same functions, and it makes hashes the original package can read.
// `import bcrypt from ...` names it `bcrypt`, so the code below reads the same.
import bcrypt from 'bcryptjs';
```

In `back-end/config/passport.js`, replace lines 16–17:
```js
// bcryptjs (pure-JavaScript bcrypt): used here to check a password against its
// stored hash. Imported under the name `bcrypt`.
import bcrypt from 'bcryptjs';
```

In `back-end/tests/auth.register.test.js`, replace lines 22–23:
```js
// bcryptjs (pure-JavaScript bcrypt) is used to check the stored password hash
// really matches the password. Imported under the name `bcrypt`.
import bcrypt from 'bcryptjs';
```

- [ ] **Step 4: Run the full back-end suite**

Run the full suite in the background (2–3 minutes), with its output in a scratchpad file:
`npm test --prefix back-end`
Expected: `ℹ tests 260`, `ℹ pass 260`, `ℹ fail 0`. Then check that nothing still imports the
old package: grep `back-end` (excluding `node_modules`) for `from 'bcrypt'`. Expected: no
matches.

---

### Task 2: Registering signs you in (back end, API docs, E2E)

**Files:**
- Test: `back-end/tests/auth.register.test.js` (new `describe` block)
- Modify: `back-end/routes/auth.js` (register handler)
- Modify: `back-end/openapi.yaml` (`/auth/register` description and 201 response)
- Modify: `docs/api-endpoints.md` (`POST /auth/register` section)
- Modify: `back-end/tests/e2e/ecommerce-api.e2e.postman_collection.json`

**Interfaces:**
- Produces: `POST /auth/register` 201 now also sets the `connect.sid` session cookie. The
  response body is unchanged: `{ id, first_name, last_name, email }`. Task 3's front end relies
  on this.

- [ ] **Step 1: Write the failing tests**

In `back-end/tests/auth.register.test.js`, add this block inside `describe('POST /auth/register',
...)`, after the `describe('with valid details', ...)` block:

```js
  describe('signing in', () => {
    // These tests use request.agent(app): an "agent" keeps cookies between
    // requests like a browser does. So if registering sets a session cookie,
    // the agent's NEXT request is made as the new customer.

    test('sets a session cookie when the account is created', async () => {
      const res = await register(validUser);

      assert.equal(res.status, 201);
      // res.headers['set-cookie'] is a list of the cookies the server set, or
      // undefined if it set none. `?? []` turns undefined into an empty list.
      const cookies = res.headers['set-cookie'] ?? [];
      // .some(fn) is true if fn returns true for at least one item.
      // express-session names its cookie connect.sid.
      assert.ok(cookies.some((cookie) => cookie.startsWith('connect.sid=')));
    });

    test('logs the new customer in, so GET /account works straight away', async () => {
      const agent = request.agent(app);

      const res = await agent.post('/auth/register').send(validUser);
      // No POST /auth/login: the registration alone must have logged us in.
      const account = await agent.get('/account');

      assert.equal(account.status, 200);
      // The account is the customer who just registered (phone is null
      // because registration doesn't ask for one).
      assert.deepEqual(account.body, {
        id: res.body.id,
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        phone: null,
      });
    });

    test('does not log anyone in when the details are invalid (400)', async () => {
      const agent = request.agent(app);

      const res = await agent.post('/auth/register').send({ ...validUser, password: 'short' });

      assert.equal(res.status, 400);
      // No cookie set, and the agent is still logged out.
      assert.equal(res.headers['set-cookie'], undefined);
      assert.equal((await agent.get('/account')).status, 401);
    });

    test('does not log anyone in when the email is taken (409)', async () => {
      // Someone has already registered this email.
      await register(validUser);
      const agent = request.agent(app);

      const res = await agent.post('/auth/register').send(validUser);

      assert.equal(res.status, 409);
      assert.equal(res.headers['set-cookie'], undefined);
      // In particular, the agent must NOT be logged in as the existing customer.
      assert.equal((await agent.get('/account')).status, 401);
    });
  });
```

- [ ] **Step 2: Run the file and check each test fails (or passes) for the right reason**

Run: `npm test --prefix back-end -- tests/auth.register.test.js`
Expected:
- "sets a session cookie…" FAILS: `assert.ok(false)`, because there's no cookie.
- "logs the new customer in…" FAILS: `401 !== 200`.
- **The 400 and 409 tests PASS already.** That's correct: today nothing ever logs in on
  register. They're guards against a *future* mistake, and Step 5 proves they can fail.
- The other 27 tests still pass.

- [ ] **Step 3: Log the customer in after the INSERT**

In `back-end/routes/auth.js`, give the handler `next`, and replace the `try`/`catch` (lines
80–105) with this:

```js
router.post('/register', async (req, res, next) => {
```

```js
  // `let` declares a variable that CAN be reassigned (unlike `const`). It's
  // declared out here so the code after the try/catch can use it.
  let customer;
  try {
    // INSERT adds a new row. $1–$4 are placeholders, filled in safely from the
    // array below in order. RETURNING sends back the new row's details,
    // including the id the database generated, without a separate SELECT.
    // password_hash is deliberately left out of RETURNING.
    const result = await query(
      `INSERT INTO customers (first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, email`,
      [first_name, last_name, email, passwordHash]
    );
    customer = result.rows[0];
  } catch (err) {
    // If the email is already registered, the database's UNIQUE constraint
    // rejects the INSERT. We rely on that rather than checking first with a
    // SELECT: if two identical requests arrive at the same moment, both could
    // pass a SELECT check, but only one can pass the constraint.
    if (err.code === UNIQUE_VIOLATION) {
      // 409 Conflict: clashes with existing data. Nobody is logged in.
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    // Any other error is unexpected: re-throw it so app.js's error handler
    // logs it and sends a 500.
    throw err;
  }

  // Sign the new customer in straight away, exactly as POST /auth/login does.
  // req.login() (added by Passport) saves the customer's id in the session and
  // gives the session a brand-new ID, which protects against "session
  // fixation". The browser receives the session cookie with this response.
  // It reports when it's finished by calling the function we pass it.
  req.login(customer, (err) => {
    // Saving the session failed (unexpected): let app.js reply 500.
    if (err) return next(err);
    // 201 Created: a new resource was made. Send back the new customer.
    res.status(201).json(customer);
  });
});
```

- [ ] **Step 4: Run the file and confirm everything passes**

Run: `npm test --prefix back-end -- tests/auth.register.test.js`
Expected: 31 pass, 0 fail.

- [ ] **Step 5: Mutation checks**

Make each change, rerun the file, confirm the named tests FAIL, then undo it:
1. Replace the `req.login(...)` block with just `res.status(201).json(customer);`.
   Expected: "sets a session cookie…" and "logs the new customer in…" FAIL.
2. In the 409 branch, temporarily log in as customer 1 before replying:
   `return req.login({ id: 1 }, () => res.status(409).json({ error: 'x' }));`.
   Expected: "does not log anyone in when the email is taken (409)" FAILS.

- [ ] **Step 6: Update the API docs**

In `back-end/openapi.yaml`, in the `/auth/register` description, replace "Registering doesn't
log you in." with:

```yaml
        a bcrypt hash and is never returned. Registering also logs you in: the
        response sets the session cookie (`connect.sid`), so you don't need to
        call `POST /auth/login` afterwards.
```
(Keep the earlier lines of that description as they are.) Then give the `'201'` response a
`headers` block, the same as `/auth/login`'s:

```yaml
        '201':
          description: The account was created, and you're now logged in.
          # The session cookie, exactly as POST /auth/login sets it.
          headers:
            Set-Cookie:
              description: The session cookie, marked HttpOnly so page scripts can't read it.
              schema:
                type: string
                example: connect.sid=s%3Aabc123; Path=/; HttpOnly
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Customer'
```

In `docs/api-endpoints.md`, after the `Response 201` code block of `POST /auth/register` (before
the "Errors:" line), add:
```markdown
The `201` response also sets the session cookie: **registering logs you in**, so there's no need
to call `/auth/login` straight afterwards.
```

- [ ] **Step 7: Update the E2E collection**

Use a scratchpad Node script. It reads the collection JSON, makes the two edits below and writes
the file back. First check the file's indentation (tabs or spaces) and whether it ends with a
newline, and keep both the same, so the diff only shows these changes.

1. In folder `1. Register and log in`, request `Register a test customer`: append to its
   `test` script's `exec` array:
```js
"",
"// Registering also logs you in, so the response sets the session cookie.",
"// pm.cookies holds the cookies from this response.",
"pm.test('sets the session cookie (registering logs you in)', function () {",
"  pm.expect(pm.cookies.has('connect.sid')).to.be.true;",
"});"
```
2. Insert a new request **between** `Register a test customer` and `Log in`:
```json
{
  "name": "View account straight after registering (no login needed)",
  "event": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "// Newman keeps cookies between requests like a browser, so this request",
          "// sends the session cookie that registering set. No Log in request has",
          "// run yet, so a 200 here proves registering logged us in.",
          "pm.test('status is 200 OK (already logged in)', function () {",
          "  pm.response.to.have.status(200);",
          "});",
          "",
          "pm.test('returns the customer who just registered', function () {",
          "  // Number() makes sure we compare a number with a number.",
          "  pm.expect(pm.response.json().id).to.equal(Number(pm.collectionVariables.get('customerId')));",
          "});"
        ]
      }
    }
  ],
  "request": {
    "method": "GET",
    "header": [],
    "url": "{{baseUrl}}/account",
    "description": "GET /account straight after registering, with no Log in request first. Expects 200 and the new customer, because registering now logs you in."
  }
}
```

- [ ] **Step 8: Run the full back-end suite and the E2E collection**

- Full suite in the background: `npm test --prefix back-end`. Expected: `tests 264`,
  `pass 264`, `fail 0`.
- Rebuild the test database first: `npm run db:test:reset --prefix back-end`.
- Then start `npm run start:test --prefix back-end` in the background. Poll
  `http://localhost:3000/health` until it answers, and check it says `ecommerce_test`.
- Run `npm run test:e2e --prefix back-end`. Expected: **43 requests**, 0 failures (it was 42).
  Note the test-script and assertion counts for the README.
- Stop the server with TaskStop.

---

### Task 3: Proxy, API helper and the registration form (all but the submit logic)

Write the front-end tests first, then the proxy, `api/auth.js` and the form. Leave `handleSubmit`
as a `TODO(human)` stub, then ask the user to write it.

**Files:**
- Modify: `front-end/package.json` (add `"proxy"`)
- Create: `front-end/.env.development`
- Create: `front-end/src/test-utils.js` (shared `renderAt`, moved out of `routes.test.js`)
- Modify: `front-end/src/routes.test.js` (import `renderAt` from `./test-utils`)
- Create: `front-end/src/pages/RegisterPage.test.js`
- Create: `front-end/src/api/auth.js`
- Replace: `front-end/src/pages/RegisterPage.js`
- Modify: `front-end/src/App.css` (form styles)

**Interfaces:**
- Consumes: `routes` from `src/routes.js`, and `POST /auth/register` (Task 2).
- Produces:
  - `renderAt(url)` in `src/test-utils.js`: renders the real routes at `url` in a memory router
    and returns the router.
  - `register(details)` in `src/api/auth.js`: resolves to the customer object, or throws an
    `Error` with a user-facing message.

- [ ] **Step 1: Move `renderAt` into a shared test helper (refactor, stays green)**

Create `front-end/src/test-utils.js`:

```js
// Helpers shared by the front-end test files. It has no tests itself: Jest only runs files
// ending in .test.js.

// render() draws a component into a fake page (jsdom). Named import: picked out by name.
import { render } from '@testing-library/react';
// createMemoryRouter builds a router that keeps its URL history in memory instead of the
// browser's address bar; RouterProvider shows the router's current page.
import { createMemoryRouter, RouterProvider } from 'react-router';
// The app's real route table, so tests check exactly what users get.
import { routes } from './routes';

// Show the app as if the browser had opened `url`. `export` lets test files import it.
// It returns the router, so a test can drive it directly (e.g. router.navigate(-1) to go back).
export function renderAt(url) {
  // initialEntries is the starting history: a list of URLs, and the last one is the current page.
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  // `router={router}` passes the router to RouterProvider as a prop (an input).
  render(<RouterProvider router={router} />);
  return router;
}
```

In `front-end/src/routes.test.js`:
- delete the local `renderAt` function and its comments;
- remove `render` from the `@testing-library/react` import (keep `act`, `screen`, `within`);
- remove the `react-router` and `./routes` imports;
- add:
```js
// renderAt(url) shows the app's real routes at `url` (see test-utils.js).
import { renderAt } from './test-utils';
```
Update the file's top comment to say the memory-router helper lives in `test-utils.js`.

Run the front-end tests. Expected: 29 pass (nothing changed in behaviour).

- [ ] **Step 2: Write the failing registration tests**

Create `front-end/src/pages/RegisterPage.test.js`:

```js
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
```

- [ ] **Step 3: Run the tests and check they fail for the right reason**

Run the front-end tests. Expected:
- In `RegisterPage.test.js`, all 11 tests FAIL with "Unable to find a label with the text of:
  First name". The placeholder page has no form.
- `routes.test.js` and `App.test.js` still pass: 29.

- [ ] **Step 4: Point the dev server at port 3001 and add the proxy**

In `front-end/package.json`, add this top-level property, after `"private": true`. JSON can't
hold comments, so the README explains it:
```json
  "proxy": "http://localhost:3000",
```

Create `front-end/.env.development` with PowerShell (the hook blocks the Write tool and Bash for
`.env*` files):
```powershell
Set-Content -Path front-end/.env.development -Encoding ascii -Value @(
'# Settings Create React App loads when running "npm start" (development only).',
'# Lines starting with # are comments. This file holds nothing secret, so it is committed.',
'#',
'# Run the React dev server on port 3001, because the API uses port 3000.',
'# Requests the dev server does not recognise (e.g. POST /auth/register) are passed on',
'# to the API by the "proxy" setting in package.json.',
'PORT=3001'
)
```

- [ ] **Step 5: Write the API helper**

Create `front-end/src/api/auth.js`:

```js
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
```

- [ ] **Step 6: Write the form, with `handleSubmit` left for the user**

Replace `front-end/src/pages/RegisterPage.js`:

```js
// The Register page (at /register): a form to create an account. Registering also signs the
// customer in (the API sets the session cookie), and then they're taken to the Products page.
//
// It's a "controlled" form: React state holds what's typed in each field, and each input
// displays that state. So React always knows the current values, ready to send.

// useState is a React "hook" (a function starting with `use` that a component calls to use a
// React feature). It gives the component a value that survives re-draws, plus a function to
// change it; changing it makes React re-draw the component with the new value.
import { useState } from 'react';
// Link: a link that changes page without reloading. useNavigate: a hook that returns a
// function for changing page from code (e.g. after a successful registration).
import { Link, useNavigate } from 'react-router';
// register(details): sends the details to the API (see ../api/auth.js).
import { register } from '../api/auth';

// The form's starting values: every field empty. Each key matches an input's `name`.
const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  confirm_password: '',
};

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function RegisterPage() {
  // `const [value, setValue] = useState(start)` is array destructuring: useState returns a
  // pair, and this names the two parts.
  // form: what's typed in each field.
  const [form, setForm] = useState(EMPTY_FORM);
  // error: the message to show (a string), or null when there's nothing to show.
  const [error, setError] = useState(null);
  // submitting: true while waiting for the API, so the button can be disabled.
  const [submitting, setSubmitting] = useState(false);
  // navigate('/some/url') changes page from code.
  const navigate = useNavigate();

  // Runs on every keystroke in any field. `event.target` is the input that changed.
  function handleChange(event) {
    // Destructuring: take the input's name (e.g. 'email') and its new value.
    const { name, value } = event.target;
    // Passing a function to setForm gives it the latest form state (`current`), which is
    // safest when updates happen quickly. `{ ...current, [name]: value }` copies every field,
    // then overwrites just the one that changed. `[name]` is a "computed key": it uses the
    // VALUE of name ('email') as the key, rather than the word "name".
    setForm((current) => ({ ...current, [name]: value }));
  }

  // Runs when the form is submitted (the Register button, or Enter in a field).
  async function handleSubmit(event) {
    // Stop the browser's normal form submission, which would reload the whole page.
    event.preventDefault();

    // TODO(human): check the passwords match, then register the customer.
  }

  return (
    <section>
      <h1>Register</h1>

      {/* onSubmit={handleSubmit} passes the function itself (no brackets), so React calls it
          when the form is submitted. className="form" applies the form styles in App.css. */}
      <form onSubmit={handleSubmit} className="form">
        {/* htmlFor (JSX's name for HTML's `for`) links a label to the input with that id.
            Clicking the label focuses the input, and screen readers read the label aloud. */}
        <label htmlFor="first_name">First name</label>
        {/* value={form.first_name} makes the input show the state; onChange keeps the state
            up to date. `required` stops the browser submitting an empty field.
            autoComplete hints let browsers and password managers fill the field in. */}
        <input
          id="first_name"
          name="first_name"
          value={form.first_name}
          onChange={handleChange}
          autoComplete="given-name"
          required
        />

        <label htmlFor="last_name">Last name</label>
        <input
          id="last_name"
          name="last_name"
          value={form.last_name}
          onChange={handleChange}
          autoComplete="family-name"
          required
        />

        <label htmlFor="email">Email</label>
        {/* type="email" makes the browser check it looks like an email address, and shows an
            email keyboard on phones. */}
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          autoComplete="email"
          required
        />

        <label htmlFor="password">Password</label>
        {/* type="password" hides what's typed. minLength={8} matches the API's rule, so the
            browser can catch a short password before sending. "new-password" tells password
            managers to suggest a new strong password, not fill in a saved one. */}
        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          autoComplete="new-password"
          minLength={8}
          required
        />

        <label htmlFor="confirm_password">Confirm password</label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          value={form.confirm_password}
          onChange={handleChange}
          autoComplete="new-password"
          minLength={8}
          required
        />

        {/* `error && <p>...</p>`: if error is null, nothing is drawn; if it's a message, the
            paragraph is. role="alert" makes screen readers announce it straight away. */}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        {/* disabled={submitting} stops a second click while the first request is in flight.
            `condition ? a : b` (the "ternary" operator) picks a if condition is true, else b. */}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Register'}
        </button>
      </form>

      {/* For people who already have an account. The space before <Link> is kept because
          the text and the link are on the same line. */}
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
```

Add the form styles to the end of `front-end/src/App.css`:

```css
/* The registration form (and later forms): labels and inputs stacked in one column.
   flex-direction: column stacks children vertically instead of in a row. */
.form {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-width: 24rem; /* forms are easier to fill in when they're not too wide */
}

/* A little space above each label, so each field's label and input read as a pair. */
.form label {
  margin-top: 0.75rem;
  font-weight: bold;
}

/* Bigger, easier-to-tap inputs and button. `font: inherit` uses the page's font, not the
   browser's default for form controls. */
.form input,
.form button {
  padding: 0.5rem;
  font: inherit;
}

.form button {
  margin-top: 1rem;
  cursor: pointer;
}

/* While submitting, the button is disabled: show it faded, with a "wait" cursor. */
.form button:disabled {
  cursor: wait;
  opacity: 0.7;
}

/* Error messages in red. */
.form-error {
  color: #b00020;
}
```

- [ ] **Step 7: Run the tests: the form tests pass, the submit tests fail**

Run the front-end tests. Expected: **2 PASS, 9 FAIL** in `RegisterPage.test.js`, and the other
29 still pass.
- **PASS:** "shows the five labelled fields…" and "links to the login page…".
- **FAIL:** the other 9, because submitting does nothing yet. They fail with "Unable to find role
  'alert'", the Products heading not found, or the "Creating account…" button not found. That
  includes the double-click test, which waits for "Creating account…" before its second click.

- [ ] **Step 8: Ask the user to write `handleSubmit` (Learn by Doing), then STOP**

Check there is exactly one `TODO(human)` in the repo (grep `TODO(human)`). Then send the Learn
by Doing request:
- **Context:** the form, state, `handleChange`, `register()` and the tests are ready, and 9 tests
  are waiting on `handleSubmit`.
- **Your Task:** in `front-end/src/pages/RegisterPage.js`, write `handleSubmit`'s body at
  `TODO(human)`.
- **Guidance** (what it must do, matching the spec):
  - if `form.password !== form.confirm_password`, call `setError('Passwords do not match')`
    and `return`;
  - otherwise clear any old error and `setSubmitting(true)`;
  - inside `try`, `await register(...)` with only the four API fields (hint: destructuring with
    `...rest` can leave `confirm_password` out), then `navigate('/')`;
  - inside `catch (err)`, `setError(err.message)` and `setSubmitting(false)`.
  - Ask them to annotate their lines too.

Wait for the user. Don't continue to Task 4 until they say they're done (or ask for help).

---

### Task 4: Finish: green tests, real check, README

- [ ] **Step 1: Run the front-end tests against the user's `handleSubmit`**

Expected: 40 pass (29 + 11). If any fail, explain to the user which behaviour is missing and
why, and let them fix it (offer a hint first, before code).

**Reference solution.** Use it only if the user asks you to write it or is stuck after a hint:
```js
    // Compare the two password fields; `!==` means "is not equal to".
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match');
      // Stop here: don't send anything to the API.
      return;
    }

    // Clear any old message and show that we're working on it.
    setError(null);
    setSubmitting(true);

    try {
      // `{ confirm_password, ...details } = form` takes confirm_password out, and puts every
      // OTHER field into a new object called details (the "rest" syntax).
      const { confirm_password, ...details } = form;
      await register(details);
      // Registered and signed in: go to the Products page.
      navigate('/');
    } catch (err) {
      // register() throws Errors with customer-friendly messages (see ../api/auth.js).
      setError(err.message);
      // Re-enable the button so they can fix the problem and try again.
      setSubmitting(false);
    }
```

- [ ] **Step 2: Mutation checks**

Make each change, rerun, confirm the named tests FAIL, then undo it:
1. Send the whole `form` to `register()`, including `confirm_password`. Expected: "registers with
   exactly the four API fields…" FAILS.
2. Remove `disabled={submitting}` from the button. Expected: "disables the button…" and "sends
   only one request…" FAIL.
3. In `api/auth.js`, remove the `try`/`catch` around `response.json()` (keep
   `body = await response.json();`). Expected: "…dev proxy answers with its own (non-JSON)
   error" FAILS.

If the user's code differs from the reference, adapt each mutation to their code.

- [ ] **Step 3: Build check**

Run: `$env:CI = 'true'; npm run build --prefix front-end`
Expected: "Compiled successfully." (CI=true makes lint warnings errors, e.g. an unused
variable.)

- [ ] **Step 4: Real check through the proxy**

1. Check ports 3000 and 3001 are free.
2. Start `npm run start:test --prefix back-end` in the background. Poll
   `http://localhost:3000/health` until it says `ecommerce_test`.
3. Start `$env:BROWSER = 'none'; npm start --prefix front-end` in the background. Poll
   `http://localhost:3001/` until it answers 200.
4. With curl (Bash), keeping cookies in a scratchpad cookie jar:
   - `curl -s -c jar -H 'Content-Type: application/json' -d '{"first_name":"Proxy","last_name":"Check","email":"proxy.check.<timestamp>@example.invalid","password":"proxy-check-pass"}' http://localhost:3001/auth/register`.
     Expected: 201 JSON, and `jar` contains `connect.sid`.
   - `curl -s -b jar -o /dev/null -w '%{http_code}' http://localhost:3001/account`.
     Expected: `200`.
   - `curl -s -o /dev/null -w '%{http_code}' -H 'Accept: text/html' http://localhost:3001/account`.
     Expected: `200`, with the React page's HTML (`<div id="root">`), not the API.
5. Stop both servers with TaskStop. Tell the user how to try it themselves in the browser.

- [ ] **Step 5: Update the README**

1. **Project Structure:** under `front-end/`, add:
   - `.env.development  # Dev server settings: runs React on port 3001`;
   - under `src/`: `api/` with `auth.js  # Calls the API's /auth endpoints (register)`;
   - `test-utils.js  # Shared test helper: renders the app at any URL`;
   - under `pages/`: `RegisterPage.test.js  # Tests for the registration form`.

   Update the `setupTests.js` line if needed.
2. **How to Use → 4. Start the server:** no change (the API is still on 3000).
3. **Register (API usage):** change the `201 Created` row to "The account was created **and
   you're logged in** (the response sets the session cookie). Returns the new customer (never
   the password)". Add a sentence under the table: "You don't need to call `/auth/login` after
   registering."
4. **Front end (React):** replace the "This opens http://localhost:3000 …" paragraph with:
   - the front end runs on **http://localhost:3001** (set in `front-end/.env.development`);
   - start the API first (`npm run dev` in `back-end`), then `npm start` in `front-end`;
   - the `"proxy"` setting in `front-end/package.json` passes API requests (e.g.
     `POST /auth/register`) to `http://localhost:3000`, so the browser only talks to one
     address and the session cookie works;
   - page addresses typed into the browser (which ask for HTML) are answered by React, not
     passed to the API. That's why `/account` can be both a page and an API endpoint.

   Change "So far it's a skeleton…" to say the Register page is connected to the API, and the
   other pages are still placeholders. In the page table, change `/register` to "Register: create
   an account (signs you in, then goes to Products)".
5. **Front-end tests paragraph (6. Run the tests):** no change needed, apart from the counts
   below.
6. **Technologies:** add `- bcryptjs: password hashing (pure-JavaScript bcrypt)`.
7. **Testing section:**
   - "There are 260 tests" becomes **264**;
   - "Registration (27)" becomes **(31)**, adding "being logged in straight away (and not after
     a failed registration)";
   - the E2E sentence gets the new request and assertion counts from Task 2 Step 8, and
     mentions "being logged in straight after registering";
   - the front end has **40** tests: add a sentence for the registration form (fields, link to
     log in, exact request sent, mismatched passwords, API and network errors, the button
     while sending, double-clicks, retrying after an error).

- [ ] **Step 6: Final verification**

Run and read each:
- Front-end tests: 40 pass, no warnings.
- `$env:CI = 'true'; npm run build --prefix front-end`: "Compiled successfully."
- The back-end full suite was green in Task 2 Step 8. If any back-end file changed since then,
  rerun it.
- `git status --short`. Expected changes:
  - `back-end/`: `package.json`, `package-lock.json`, `routes/auth.js`, `config/passport.js`,
    `tests/auth.register.test.js`, `openapi.yaml`, the E2E collection;
  - `docs/api-endpoints.md`;
  - `front-end/`: `package.json`, `.env.development`, `src/App.css`, `src/routes.test.js`,
    `src/pages/RegisterPage.js`, and the new `src/api/`, `src/test-utils.js` and
    `src/pages/RegisterPage.test.js`;
  - `README.md`;
  - the spec and plan.
- Grep for `TODO(human)`. Expected: none left.

- [ ] **Step 7: Report and give the commit message**

Don't commit. Report the test counts, E2E counts, mutation results, rulings and anything deferred.
Then give:

```
Add the registration page, and log customers in when they register

- Back end: switch password hashing from bcrypt to bcryptjs (pure JS)
- POST /auth/register now logs the new customer in (req.login), so the
  response sets the session cookie; failed registrations log no one in
- Front end: registration form (controlled, useState) with confirm
  password, friendly errors, and a link to log in; goes to Products
  after registering
- src/api/auth.js wraps fetch and turns failures into readable messages
- Dev server on port 3001 with a proxy to the API on 3000, so the
  session cookie is same-origin
- Tests: 4 new back-end tests (264), 11 new front-end tests (40),
  E2E checks being logged in straight after registering
- Docs: README, openapi.yaml, api-endpoints.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
