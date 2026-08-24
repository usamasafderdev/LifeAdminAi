export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  const response = {
    success: false,
    message: statusCode === 500 ? 'Internal server error' : err.message,
  };

  if (process.env.NODE_ENV === 'development') {
    response.error = err.message;
  }

  return res.status(statusCode).json(response);
}
