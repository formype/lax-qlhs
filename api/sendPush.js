import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error.stack);
  }
}

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

  const { tokens, title, body, data } = req.body;

  if (!tokens || !tokens.length) {
    return res.status(400).json({ message: 'No tokens provided' });
  }

  const message = {
    notification: {
      title: title || 'Thông báo mới',
      body: body || 'Bạn có thông báo mới',
    },
    data: data || {},
    tokens: tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    
    // Cleanup invalid tokens if needed (optional)
    const failedTokens = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      successCount: response.successCount, 
      failureCount: response.failureCount,
      failedTokens 
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
