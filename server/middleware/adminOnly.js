const pool = require('../db');

// adminOnly — ensures the requesting user has role = 'admin'.
//
// We re-query the DB on every request rather than caching the role in the
// session. Caching would be faster, but a demoted admin would retain elevated
// access until their session expired. For a support tool where roles can change,
// freshness matters more than the extra query.
async function adminOnly(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (!rows.length || rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = adminOnly;
