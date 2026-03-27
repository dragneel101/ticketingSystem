// requireAuth — gates any route behind an active session.
// Usage: router.use(requireAuth)  or  router.get('/path', requireAuth, handler)
//
// Express middleware follows the (req, res, next) pattern:
// - call next() to pass control to the next handler
// - call res.status(401) to short-circuit the chain
function requireAuth(req, res, next) {
  if (req.session?.userId) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

module.exports = requireAuth;
