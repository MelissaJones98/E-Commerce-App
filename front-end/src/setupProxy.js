// Extra proxy rules for the React dev server (npm start). Create React App finds this file by
// its name and runs it automatically; nothing imports it. It only affects development.
//
// Why it's needed: the "proxy" setting in package.json passes API requests made with fetch()
// on to the API, but it never passes on a request that asks for a web page (HTML); React
// answers those itself. The "Sign in with Google" and "Sign in with Facebook" buttons are
// ordinary links, so clicking one IS a request for a web page. Without these rules, React
// would answer /auth/google with the app (showing "Page not found") instead of the API
// redirecting the browser to Google.
//
// This file uses CommonJS (`require` and `module.exports`) instead of `import`/`export`,
// because the dev server loads it directly with Node, not through the React build.

// createProxyMiddleware builds middleware that forwards matching requests to another server.
// `{ createProxyMiddleware } = require(...)` takes just that one export from the package.
const { createProxyMiddleware } = require('http-proxy-middleware');

// The dev server calls this function with its Express app, so we can add middleware to it.
module.exports = function (app) {
  app.use(
    createProxyMiddleware(
      // Which requests to forward. These match by prefix, so /auth/google/callback (where
      // Google sends the browser back) is forwarded too.
      ['/auth/google', '/auth/facebook'],
      // Where to send them: the API. There's no changeOrigin option, so the API still sees
      // Host: localhost:3001. Its redirects (e.g. back to /) then stay on the React app's
      // address, and the session cookie is set for that address too.
      { target: 'http://localhost:3000' },
    ),
  );
};
