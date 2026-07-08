import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Or restrict to your domain
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

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

  const { tokens, title, body, data } = req.body;

  if (!tokens || !tokens.length) {
    return res.status(400).json({ message: 'No tokens provided' });
  }

  let safeData = {};
  if (data && typeof data === 'object') {
    for (const key in data) {
      safeData[key] = String(data[key]);
    }
  }

  const message = {
    notification: {
      title: title || 'Thông báo mới',
      body: body || 'Bạn có thông báo mới',
    },
    android: {
      notification: {
        channel_id: 'qlhs_alerts',
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
