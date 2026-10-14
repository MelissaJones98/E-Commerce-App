// Middleware for routes that need a logged-in customer.
//
// Middleware is a function that runs before a route's own function. Add this
// one in front of a route to protect it, e.g.
//   router.post('/logout', requireAuth, (req, res) => { ... })
// or protect every route in a router with router.use(requireAuth).
//
// Express calls middleware with three arguments:
//   req:  the incoming request
//   res:  used to send a response
//   next: a function to call to move on to the next middleware or the route
export const requireAuth = (req, res, next) => {
  // req.isAuthenticated() is added by Passport. It's true if the session has a
  // logged-in customer (i.e. req.user is set), false otherwise.
  if (!req.isAuthenticated()) {
    // Not logged in: reply 401 Unauthorized. Because we send a response and
    // `return` without calling next(), the route itself never runs.
    return res.status(401).json({ error: 'You must be logged in' });
  }
  // Logged in: carry on to the route.
  next();
};
