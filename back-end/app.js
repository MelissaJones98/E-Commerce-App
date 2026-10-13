// Import Express, the web framework that handles HTTP requests and responses.
// `import` syntax works because package.json sets "type": "module".
import express from 'express';
// Import the query helper that runs SQL against the PostgreSQL database.
import { query } from './db/index.js';
import authRouter from './routes/auth.js';

// Create the application object. Routes and middleware are attached to it.
// The server is started in server.js, so tests can import the app without
// it listening on a port.
const app = express();

// Parse JSON request bodies so routes can read them from req.body.
app.use(express.json());

// All routes in routes/auth.js are reached under /auth, e.g. /auth/register.
app.use('/auth', authRouter);

// Route: when a GET request arrives at "/", send back a plain-text response.
// `req` holds details of the incoming request (unused here); `res` is used to reply.
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Health check: confirms the app can reach the database.
// Runs a trivial query; if it succeeds the database is connected.
app.get('/health', async (req, res) => {
  try {
    const result = await query('SELECT current_database() AS database, now() AS time');
    res.json({ status: 'ok', ...result.rows[0] });
  } catch (err) {
    // 503 Service Unavailable: the app is running but its database isn't reachable.
    console.error('Database health check failed:', err.message);
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// Error handler: Express sends any error thrown in a route here.
// It must take four arguments, which is how Express recognises it.
app.use((err, req, res, next) => {
  // express.json() raises this when the request body isn't valid JSON.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  // Anything else is unexpected: log the details, but don't send them to the
  // client, as they can reveal how the app works internally.
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
