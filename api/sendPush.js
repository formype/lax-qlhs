import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { checkRateLimit } from './utils/rateLimiter.js';
import { validatePayloadSize, validateJsonBody, validatePushPayload } from './utils/requestValidator.js';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Or restrict to your domain
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-app-secret, Authorization'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. Enforce secret token authorization
  const expectedSecret = process.env.APP_PUSH_SECRET || process.env.VITE_APP_PUSH_SECRET;
  if (expectedSecret) {
    const providedSecret = req.headers['x-app-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (!providedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ success: false, error: 'Truy cập bị từ chối: Mã bảo mật không hợp lệ hoặc bị thiếu.' });
    }
  }

  // 2. Enforce payload size limit (max 250KB)
  if (!validatePayloadSize(req, res, 250 * 1024)) return;

  // 3. Validate JSON body structure and Content-Type
  if (!validateJsonBody(req, res)) return;

  // 4. Validate & sanitize push notification payload
  const validation = validatePushPayload(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ success: false, error: validation.error });
  }
  const { tokens, title, body, data: safeData } = validation.sanitized;

  // 4. Rate Limiting: Max 60 push requests per minute per IP
  const allowed = checkRateLimit(req, res, {
    windowMs: 60 * 1000,
    max: 60,
    keyPrefix: 'sendPush',
    message: 'Tần suất gửi thông báo quá nhanh. Vui lòng thử lại sau 1 phút.'
  });
  if (!allowed) return;

  try {
    if (getApps().length === 0) {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing from Environment Variables');
      }
      const saString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(saString);
      } catch (parseError) {
        throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON. Please ensure it is valid JSON.');
      }
      
      // Fix private key if newlines are messed up
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      initializeApp({
        credential: cert(serviceAccount)
      });
    }
  } catch (initError) {
    console.error('Admin Init Error:', initError);
    return res.status(500).json({ success: false, error: 'Firebase Admin Init Error: ' + initError.message });
  }

  const message = {
    notification: {
      title: title || 'Thông báo mới',
      body: body || 'Bạn có thông báo mới',
    },
    android: {
      notification: {
        channelId: 'qlhs_alerts',
        sound: 'default'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default'
        }
      }
    },
    data: safeData,
    tokens: tokens,
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);
    
    // Cleanup invalid tokens if needed (optional)
    const failedTokens = [];
    const failedErrors = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          failedErrors.push(resp.error.code || resp.error.message);
        }
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      successCount: response.successCount, 
      failureCount: response.failureCount,
      failedTokens,
      failedErrors
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
