const { ZodError } = require('zod');

/**
 * Global error handler — must be registered LAST in Express (4 arguments).
 *
 * Handles three cases:
 *  1. ZodError  — validation failure → 400 with field-level details
 *  2. AppError  — our own thrown errors (401, 403, 404, 409, 422…)
 *  3. Everything else → 500
 */
function errorHandler(err, req, res, next) {
  // 1. Zod validation errors → 400 Bad Request
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
        type: e.code,
      })),
    });
  }

  // 2. Our own AppError — use the status code we attached
  if (err.name === 'AppError') {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // 3. Unexpected errors — don't leak internals to the client
  console.error('Unhandled error:', err);
  return res.status(500).json({ message: 'An unexpected error occurred' });
}

module.exports = errorHandler;
