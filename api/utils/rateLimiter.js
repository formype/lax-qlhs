/**
 * In-memory sliding window rate limiter for Serverless Functions / API Endpoints.
 */
const rateLimitStore = new Map();

// Periodic cleanup of expired rate limit entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get client identifier (IP address or fallback)
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Check rate limit for a request
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {object} options - Options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 minutes)
 * @param {number} options.max - Max attempts allowed in window (default: 5 for auth, 60 for general)
 * @param {string} options.keyPrefix - Prefix for cache key (e.g. 'auth_login', 'send_push')
 * @param {string} options.message - Custom error message
 * @returns {boolean} - Returns true if request is allowed, false if blocked (and responds with 429)
 */
export function checkRateLimit(req, res, options = {}) {
  cleanupExpiredEntries();

  const {
    windowMs = 15 * 60 * 1000,
    max = 5,
    keyPrefix = 'api',
    message = 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
  } = options;

  const clientIp = getClientIp(req);
  const key = `${keyPrefix}:${clientIp}`;
  const now = Date.now();

  let record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs
    };
    rateLimitStore.set(key, record);
    return true;
  }

  record.count += 1;

  if (record.count > max) {
    const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
    res.setHeader('Retry-After', retryAfterSec);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    res.status(429).json({
      success: false,
      error: message,
      retryAfterSeconds: retryAfterSec,
      retryAfterFormatted: `${Math.ceil(retryAfterSec / 60)} phút`
    });
    return false;
  }

  res.setHeader('X-RateLimit-Limit', max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

  return true;
}
