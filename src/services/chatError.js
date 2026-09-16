export function chatError(error) {
  const status = error.response?.status;
  const code = error.response?.data?.code || error.code;
  if ([408, 504].includes(status) || ['AI_TIMEOUT', 'ECONNABORTED', 'ETIMEDOUT'].includes(code))
    return "LifeAdmin couldn't complete that request because the AI service took too long to respond. Please try again.";
  if (status === 429) return 'LifeAdmin is temporarily busy. Please try again in a moment.';
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403 || status === 404) return 'This conversation or document is unavailable.';
  if (status === 409)
    return 'LifeAdmin is still processing this conversation. Please retry in a moment.';
  if (status === 400)
    return error.response?.data?.message || 'Please check your question and try again.';
  if (status === 502) return 'The AI response could not be processed. Please try again.';
  if (status === 503) return 'LifeAdmin is temporarily unavailable. Please try again shortly.';
  return 'Something went wrong while contacting LifeAdmin. Please try again.';
}
