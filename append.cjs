const fs = require('fs');
const file = 'src/lib/firebase.js';
let text = fs.readFileSync(file, 'utf8');

const newCode = 

// --- DAILY LOGS ---
export const addDailyLog = async (logData) => {
  try {
    const dailyLogsRef = collection(db, COLLECTIONS.DAILY_LOGS);
    const docRef = await addDoc(dailyLogsRef, {
      ...logData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error adding daily log: ", error);
    return { success: false, error: error.message };
  }
};
;
fs.writeFileSync(file, text + newCode, 'utf8');
