const jwt = require('jsonwebtoken');
const AppError = require('../errors/AppError');

/**
 * authenticate middleware
 *
 * Reads the Authorization header, verifies the JWT, and attaches the decoded
 * payload to req.user so downstream route handlers know who is making the request.
 *
 * If the token is missing or invalid we throw a 401 — the global error handler
 * will format and send the response.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  // Header must be in the form: "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Access token is missing or invalid', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach the user payload (id, email) to the request for use in routes
    req.user = decoded;
    next();
  } catch {
    return next(new AppError('Access token is missing or invalid', 401));
  }
}

module.exports = authenticate;
