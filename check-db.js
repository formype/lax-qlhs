import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBwXa8K6417vl6aIF1vig3GVkfXgV5Ju6c",
  authDomain: "viphamhs.firebaseapp.com",
  projectId: "viphamhs",
  storageBucket: "viphamhs.firebasestorage.app",
  messagingSenderId: "117208625100",
  appId: "1:117208625100:web:517913f5db05985b72f769"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const collectionsToTry = ['violations', 'vi_pham', 'ky_luat', 'danh_sach_vi_pham', 'students', 'hoc_sinh'];

async function checkCollections() {
  console.log("Checking database...");
  for (const coll of collectionsToTry) {
    try {
      const q = query(collection(db, coll), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        console.log(`\nFound data in collection: "${coll}"`);
        snapshot.forEach(doc => {
          console.log(`Sample Data ID: ${doc.id}`);
          console.log(doc.data());
        });
      } else {
        console.log(`Collection "${coll}" is empty or doesn't exist.`);
      }
    } catch (e) {
      console.log(`Error reading collection "${coll}": ${e.message}`);
    }
  }
  process.exit(0);
}

checkCollections();
