/**
 * AppError extends the built-in Error class so we can attach an HTTP status
 * code to any error we throw. The global error handler then reads this to
 * decide what status code to send back to the client.
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

module.exports = AppError;
