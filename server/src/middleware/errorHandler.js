export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  if (err.code?.startsWith('AI_')) console.warn('[chat.ai.error]', { code: err.code, statusCode });
  const response = {
    success: false,
    ...(err.code?.startsWith('AI_') ? { code: err.code } : {}),
    message: statusCode === 500 ? 'Internal server error' : err.message,
  };

  return res.status(statusCode).json(response);
}
