importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
  measurementId: params.get('measurementId') || ''
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    firebase.initializeApp(firebaseConfig);
  } catch (e) {
    console.error('[firebase-messaging-sw.js] Init error:', e);
  }
}

let messaging = null;
try {
  messaging = firebase.messaging();
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Messaging init warning:', e);
}

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Thông báo mới';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/vite.svg',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
