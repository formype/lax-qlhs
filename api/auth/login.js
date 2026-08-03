import { checkRateLimit } from '../utils/rateLimiter.js';
import { validatePayloadSize, validateJsonBody, sanitizeText } from '../utils/requestValidator.js';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. Enforce payload size limit (max 50KB)
  if (!validatePayloadSize(req, res, 50 * 1024)) return;

  // 2. Validate JSON body
  if (!validateJsonBody(req, res)) return;

  // 3. Rate Limiting: Max 5 attempts per 15 minutes (900,000 ms)
  const allowed = checkRateLimit(req, res, {
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyPrefix: 'auth_login',
    message: 'Bạn đã thử đăng nhập quá 5 lần. Vui lòng thử lại sau 15 phút.'
  });

  if (!allowed) return;

  // Endpoint rate check passed
  return res.status(200).json({
    success: true,
    message: 'Rate limit check passed.'
  });
}
