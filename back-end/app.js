// Import Express, the web framework that handles HTTP requests and responses.
// `import` syntax works because package.json sets "type": "module".
import express from 'express';
// Import the query helper that runs SQL against the PostgreSQL database.
import { query } from './db/index.js';

// Create the application object. Routes and middleware are attached to it.
const app = express();

// Use the PORT environment variable if one is set (hosting platforms such as
// Render or Heroku set it for you), otherwise fall back to 3000 for local dev.
const port = process.env.PORT || 3000;

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

// Start the server listening for requests on the chosen port.
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
