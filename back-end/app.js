// Builds the Express app: loads its settings, attaches middleware and routes,
// and handles errors. It does NOT start the server; server.js does that.
// Keeping the two apart lets the tests import the app and send it requests
// without it listening on a real network port.

// `import` loads code from a package or another file so this file can use it.
// `import` syntax (instead of the older `require()`) works because
// package.json sets "type": "module".

// Express: the web framework that receives HTTP requests and sends responses.
import express from 'express';
// query(): runs a SQL statement against PostgreSQL (see db/index.js).
import { query } from './db/index.js';
// express-session: remembers visitors between requests using a cookie.
import session from 'express-session';
// Passport, already configured to check logins (see config/passport.js).
import passport from './config/passport.js';
// Each router holds a group of related routes, defined in its own file.
import authRouter from './routes/auth.js';
import productsRouter from './routes/products.js';
import accountRouter from './routes/account.js';
import cartRouter from './routes/cart.js';

// `process.env` holds environment variables: settings that come from outside
// the code, here from back-end/.env (loaded by the --env-file flag in the
// npm scripts in package.json).
// The session secret is used to sign the session cookie, so a cookie someone
// has edited or made up gets rejected. Without it sessions would be insecure,
// so stop immediately with a clear message instead of starting the server.
// `throw` raises an error; nothing after this line runs if the secret is missing.
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to back-end/.env');
}

// Create the application object. Middleware and routes are attached to it below.
const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// Middleware are functions that run on each request, in the order they're
// added with app.use(), before the request reaches a route. Each one can read
// or change the request, or send a response itself.

// express.json() reads a request's body and, if it's JSON, converts it into a
// JavaScript object on req.body. Without this, req.body would be undefined.
app.use(express.json());

// Sessions: the first time someone logs in, they're given a cookie containing
// a random session ID. Their session data (e.g. which customer is logged in)
// is kept on the server under that ID, and the browser sends the cookie back
// with every request so the server knows who they are.
app.use(
  session({
    // The secret used to sign the cookie (checked above).
    secret: process.env.SESSION_SECRET,
    // resave: false means don't save the session again if nothing changed.
    resave: false,
    // saveUninitialized: false means don't create a session (or send a
    // cookie) until something is stored in it, i.e. until someone logs in.
    saveUninitialized: false,
    // HttpOnly: JavaScript running in the browser can't read the cookie, so a
    // malicious script injected into a web page can't steal it.
    cookie: { httpOnly: true },
  })
);

// On each request, Passport reads the customer's id from the session, looks
// the customer up, and puts them on req.user (see deserializeUser in
// config/passport.js). It also adds helpers such as req.isAuthenticated().
app.use(passport.session());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
// app.use(path, router) "mounts" a router: every route inside it is reached
// under that path. E.g. router.post('/register') in routes/auth.js becomes
// POST /auth/register.
app.use('/auth', authRouter);
app.use('/products', productsRouter);
app.use('/account', accountRouter);
app.use('/cart', cartRouter);

// GET /: a simple test route. app.get() handles GET requests to a path.
// The function receives `req` (the incoming request; unused here) and `res`
// (used to send the reply). res.send() sends plain text.
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// GET /health: confirms the app can reach the database.
// `async` lets the function use `await`, which waits for a slow operation
// (here, a database query) to finish without blocking other requests.
app.get('/health', async (req, res) => {
  // try/catch: if anything in `try` throws an error, run `catch` instead of crashing.
  try {
    // A trivial query: ask PostgreSQL for the database's name and the time.
    // If this works, the database is connected.
    const result = await query('SELECT current_database() AS database, now() AS time');
    // `...result.rows[0]` "spreads" the row's properties (database and time)
    // into the response object alongside status.
    res.json({ status: 'ok', ...result.rows[0] });
  } catch (err) {
    // 503 Service Unavailable: the app is running, but its database isn't reachable.
    console.error('Database health check failed:', err.message);
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
// Express sends any error thrown in a route (or passed to next(err)) here.
// Express recognises an error handler because it takes FOUR arguments, so
// `next` must be listed even though it isn't used. It's added last, so it
// catches errors from everything above.
app.use((err, req, res, next) => {
  // express.json() raises an error with this `type` when the request body
  // isn't valid JSON. That's the client's mistake, so reply 400 Bad Request.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  // Anything else is a bug or an unexpected problem. Log the full details on
  // the server for debugging, but send the client only a generic message:
  // error details can reveal how the app works internally.
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// `export default` makes `app` the main thing this file provides, so server.js
// and the tests can `import app from './app.js'`.
export default app;
