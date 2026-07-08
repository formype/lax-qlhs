importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBwXa8K6417vl6aIF1vig3GVkfXgV5Ju6c",
  authDomain: "viphamhs.firebaseapp.com",
  projectId: "viphamhs",
  storageBucket: "viphamhs.firebasestorage.app",
  messagingSenderId: "117208625100",
  appId: "1:117208625100:web:517913f5db05985b72f769",
  measurementId: "G-E5M207LRCD"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

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
