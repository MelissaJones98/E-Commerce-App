// Middleware for routes that need a logged-in customer. Add it before the
// route handler, e.g. router.get('/account', requireAuth, handler).
export const requireAuth = (req, res, next) => {
  // isAuthenticated() is added by Passport: true if the session has a customer.
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'You must be logged in' });
  }
  next();
};
