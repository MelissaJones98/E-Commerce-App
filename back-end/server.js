// Entry point: starts the app listening for HTTP requests.
// `npm start` and `npm run dev` run this file (see "scripts" in package.json).
// The app itself is built in app.js; this file only starts it, so the tests
// can import app.js without a server starting up.

import app from './app.js';

// The port is the "door number" on this computer the server listens on, so
// requests to http://localhost:3000 reach it.
// Use the PORT environment variable if one is set (hosting platforms such as
// Render set it for you). `||` means "or": if PORT isn't set, use 3000.
const port = process.env.PORT || 3000;

// Start listening. The function is called once the server is ready.
// The backticks make a "template literal", so ${port} is replaced by the
// port number in the message.
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
