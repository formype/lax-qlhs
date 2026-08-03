importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

const firebaseConfig = {
  apiKey: params.get('apiKey') || "AIzaSyBwXa8K6417vl6aIF1vig3GVkfXgV5Ju6c",
  authDomain: params.get('authDomain') || "viphamhs.firebaseapp.com",
  projectId: params.get('projectId') || "viphamhs",
  storageBucket: params.get('storageBucket') || "viphamhs.firebasestorage.app",
  messagingSenderId: params.get('messagingSenderId') || "117208625100",
  appId: params.get('appId') || "1:117208625100:web:517913f5db05985b72f769",
  measurementId: params.get('measurementId') || "G-E5M207LRCD"
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
