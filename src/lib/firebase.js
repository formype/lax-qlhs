import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, Timestamp, where, doc, deleteDoc, updateDoc, setDoc, serverTimestamp, getDoc, writeBatch, onSnapshot, limit, arrayUnion, startAfter } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export let messaging = null;
if (typeof window !== 'undefined') {
  try {
    messaging = getMessaging(app);
  } catch(e) {
    console.error('Firebase messaging not supported', e);
  }
}

const COLLECTIONS = {
  STUDENTS: 'students',
  CLASSES: 'classes',
  VIOLATIONS: 'violations',
  USERS: 'users',
  ATTENDANCE: 'attendance',
  NOTIFICATIONS: 'notifications'
};

// --- USERS / AUTH ---
export const loginUser = async (username, password) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.USERS),
      where("username", "==", username),
      where("password", "==", password)
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data();
      const userId = querySnapshot.docs[0].id;
      let roles = Array.isArray(userData.role) ? userData.role : (userData.role ? [userData.role] : []);
      
      let teacherClass = null;
      if (roles.includes('giaovien')) {
        const classQ = query(collection(db, COLLECTIONS.CLASSES), where("homeroomTeacherId", "==", userId));
        const classSnap = await getDocs(classQ);
        if (!classSnap.empty) {
          teacherClass = classSnap.docs[0].data().tenlop;
        }
      }

      return { 
        success: true, 
        user: {
          id: userId,
          username: userData.username,
          fullName: userData.fullName,
          role: roles, 
          password: userData.password,
          blockedPages: userData.blockedPages || [],
          teacherClass: teacherClass
        }  
      };
    } else {
      return { success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
    }
  } catch (error) {
    console.error("Login Error:", error);
    return { success: false, message: 'Lỗi kết nối khi đăng nhập.' };
  }
};

export const fetchUsers = async () => {
  try {
    const q = query(collection(db, COLLECTIONS.USERS));
    const querySnapshot = await getDocs(q);
    const users = [];
    querySnapshot.forEach((doc) => {
      const d = doc.data();
      const roles = Array.isArray(d.role) ? d.role : (d.role ? [d.role] : []);
      users.push({ id: doc.id, ...d, role: roles });
    });
    return users;
  } catch (error) {
    console.error("Fetch Users Error:", error);
    return [];
  }
};

export const addUser = async (userData) => {
  try {
    // Check if username already exists
    const q = query(collection(db, COLLECTIONS.USERS), where("username", "==", userData.username));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return { success: false, error: 'Tên đăng nhập đã tồn tại.' };
    }
    const docRef = await addDoc(collection(db, COLLECTIONS.USERS), userData);
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Add User Error:", error);
    return { success: false, error };
  }
};

export const deleteUser = async (userId) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.USERS, userId));
    return { success: true };
  } catch (error) {
    console.error("Delete User Error:", error);
    return { success: false, error };
  }
};

export const updateUserAccount = async (userId, updates) => {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, updates);
    
    // Check if fullName is updated
    if (updates.fullName !== undefined) {
      const qClass = query(collection(db, COLLECTIONS.CLASSES), where("homeroomTeacherId", "==", userId));
      const snap = await getDocs(qClass);
      if (!snap.empty) {
        const batchOp = writeBatch(db);
        snap.forEach(d => {
          batchOp.update(d.ref, { homeroomTeacherName: updates.fullName || updates.username || 'Giáo viên' });
        });
        await batchOp.commit();
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error("Update User Error:", error);
    return { success: false, error };
  }
};

export const getUserByUsername = async (username) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.USERS),
      where("username", "==", username)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const d = querySnapshot.docs[0].data();
      const roles = Array.isArray(d.role) ? d.role : (d.role ? [d.role] : []);
      return { success: true, id: querySnapshot.docs[0].id, ...d, role: roles };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error };
  }
};

// --- CLASSES ---
export const fetchClasses = async (grade) => {
  try {
    let q = collection(db, COLLECTIONS.CLASSES);
    if (grade) {
      q = query(q, where("khoi", "==", grade));
    }
    const querySnapshot = await getDocs(q);
    const classes = [];
    querySnapshot.forEach((doc) => {
      classes.push({ id: doc.id, ...doc.data() });
    });
    return classes.sort((a, b) => a.tenlop.localeCompare(b.tenlop));
  } catch (error) {
    console.error("Error fetching classes:", error);
    return [];
  }
};

export const addClass = async (classData) => {
  try {
    const docRef = await addDoc(collection(db, COLLECTIONS.CLASSES), classData);
    
    if (classData.homeroomTeacherId) {
      await updateDoc(doc(db, COLLECTIONS.USERS, classData.homeroomTeacherId), {
        teacherClass: classData.tenlop
      });
    }

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error adding class:", error);
    return { success: false, error };
  }
};

export const deleteClass = async (classId) => {
  try {
    const classRef = doc(db, COLLECTIONS.CLASSES, classId);
    const oldClassSnap = await getDoc(classRef);
    if (oldClassSnap.exists()) {
      const oldClass = oldClassSnap.data();
      if (oldClass.homeroomTeacherId) {
        await updateDoc(doc(db, COLLECTIONS.USERS, oldClass.homeroomTeacherId), {
          teacherClass: null
        });
      }
    }
    await deleteDoc(classRef);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateClass = async (classId, updates) => {
  try {
    const classRef = doc(db, COLLECTIONS.CLASSES, classId);
    const oldClassSnap = await getDoc(classRef);
    const oldClass = oldClassSnap.exists() ? oldClassSnap.data() : null;

    await updateDoc(classRef, updates);

    const oldTeacherId = oldClass?.homeroomTeacherId;
    const newTeacherId = updates.homeroomTeacherId !== undefined ? updates.homeroomTeacherId : oldTeacherId;
    const newTenlop = updates.tenlop !== undefined ? updates.tenlop : (oldClass?.tenlop || '');

    if (oldTeacherId && oldTeacherId !== newTeacherId) {
      await updateDoc(doc(db, COLLECTIONS.USERS, oldTeacherId), { teacherClass: null });
    }
    
    if (newTeacherId) {
      await updateDoc(doc(db, COLLECTIONS.USERS, newTeacherId), { teacherClass: newTenlop });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

// --- STUDENTS ---
export const fetchStudents = async (filters = {}) => {
  try {
    let constraints = [];
    if (filters.grade) constraints.push(where("khoi", "==", filters.grade));
    if (filters.className) constraints.push(where("tenlop", "==", filters.className));

    const q = query(collection(db, COLLECTIONS.STUDENTS), ...constraints);
    const querySnapshot = await getDocs(q);
    const students = [];
    querySnapshot.forEach((doc) => {
      students.push({ id: doc.id, ...doc.data() });
    });
    return students.sort((a, b) => (a.mahs || '').localeCompare(b.mahs || ''));
  } catch (error) {
    console.error("Error fetching students:", error);
    return [];
  }
};

export const getStudentByCode = async (mahs) => {
  try {
    const q = query(collection(db, COLLECTIONS.STUDENTS), where("mahs", "==", mahs.trim().toUpperCase()));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return { success: true, data: { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } };
    }
    return { success: false };
  } catch (error) {
    console.error("Error finding student:", error);
    return { success: false };
  }
};

export const addStudent = async (studentData) => {
  try {
    const docRef = await addDoc(collection(db, COLLECTIONS.STUDENTS), studentData);
    return { success: true, id: docRef.id };
  } catch (error) {
    return { success: false, error };
  }
};

export const addMultipleStudents = async (studentsArray) => {
  try {
    const batch = writeBatch(db);
    const studentsCol = collection(db, COLLECTIONS.STUDENTS);
    
    studentsArray.forEach((student) => {
      const newDocRef = doc(studentsCol); // auto-generate ID
      batch.set(newDocRef, student);
    });
    
    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error("Batch add error:", error);
    return { success: false, error };
  }
};

export const deleteStudent = async (studentId) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.STUDENTS, studentId));
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateStudent = async (studentId, updateData) => {
  try {
    const docRef = doc(db, COLLECTIONS.STUDENTS, studentId);
    await updateDoc(docRef, updateData);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

// --- VIOLATIONS ---
export const addViolation = async (data) => {
  try {
    const docRef = await addDoc(collection(db, COLLECTIONS.VIOLATIONS), {
      ...data,
      createdAt: Timestamp.now()
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error adding violation: ", error);
    return { success: false, error };
  }
};

export const getRecentViolations = async () => {
  try {
    const q = query(collection(db, COLLECTIONS.VIOLATIONS), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const data = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });
    return data;
  } catch (e) {
    console.error("Error fetching violations: ", e);
    return [];
  }
};

export const searchViolations = async (searchTerm) => {
  try {
    const q = query(collection(db, COLLECTIONS.VIOLATIONS), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const data = [];
    const term = searchTerm.toLowerCase();
    
    querySnapshot.forEach((doc) => {
      const d = doc.data();
      const hoten = (d.hoten || '').toLowerCase();
      const tenlop = (d.tenlop || '').toLowerCase();
      const mahs = (d.mahs || '').toLowerCase();

      if(hoten.includes(term) || tenlop.includes(term) || mahs.includes(term)) {
        data.push({ id: doc.id, ...d });
      }
    });
    return data;
  } catch (e) {
    console.error("Error searching violations: ", e);
    return [];
  }
};

export const deleteViolation = async (violationId) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.VIOLATIONS, violationId));
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateViolationStatus = async (violationId, newStatus) => {
  try {
    await updateDoc(doc(db, COLLECTIONS.VIOLATIONS, violationId), {
      trangthai: newStatus
    });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateViolationDetails = async (violationId, updates) => {
  try {
    const violationRef = doc(db, COLLECTIONS.VIOLATIONS, violationId);
    await updateDoc(violationRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error("Error updating violation details: ", error);
    return { success: false, error: error.message };
  }
};

// --- ATTENDANCE ---
export const saveAttendance = async (date, session, className, attendanceData, createdBy = 'Hệ thống', reasonsData = {}) => {
  try {
    const safeClassName = className.replace(/\//g, '-');
    const docId = `${safeClassName}_${date}_${session}`; // e.g. 10A1_2026-09-07_Sáng
    const docRef = doc(db, COLLECTIONS.ATTENDANCE, docId);
    
    const docData = {
      date,
      session,
      className,
      records: attendanceData, // Object mapping studentId -> status (present, absent)
      createdBy,
      updatedAt: serverTimestamp()
    };
    
    if (Object.keys(reasonsData).length > 0) {
      docData.reasons = reasonsData;
    }

    await setDoc(docRef, docData, { merge: true });
    return { success: true };
  } catch (error) {
    console.error("Error saving attendance:", error);
    return { success: false, error: error.message || error.toString() };
  }
};

export const updateAttendanceStudent = async (date, session, className, studentId, newStatus, proofBase64, updatedBy = null, reason = null) => {
  try {
    const safeClassName = className.replace(/\//g, '-');
    const docId = `${safeClassName}_${date}_${session}`;
    const docRef = doc(db, COLLECTIONS.ATTENDANCE, docId);
    
    const updates = {
      [`records.${studentId}`]: newStatus,
      updatedAt: serverTimestamp()
    };
    if (proofBase64) {
      updates[`proofs.${studentId}`] = proofBase64;
    }
    if (updatedBy) {
      updates[`updatedBy.${studentId}`] = updatedBy;
    }
    if (reason) {
      updates[`reasons.${studentId}`] = reason;
    }
    
    await updateDoc(docRef, updates);
    return { success: true };
  } catch (error) {
    console.error("Error updating attendance student:", error);
    return { success: false, error: error.message || error.toString() };
  }
};

export const getAttendanceForDateClass = async (date, session, className) => {
  try {
    const safeClassName = className.replace(/\//g, '-');
    const docId = `${safeClassName}_${date}_${session}`;
    const docRef = doc(db, COLLECTIONS.ATTENDANCE, docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (e) {
    console.error("Error fetching attendance for date/class:", e);
    return null;
  }
};

export const getAttendanceByDate = async (date) => {
  try {
    const q = query(collection(db, COLLECTIONS.ATTENDANCE), where('date', '==', date));
    const querySnapshot = await getDocs(q);
    const data = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });
    return data;
  } catch (e) {
    console.error("Error fetching attendance for date:", e);
    return [];
  }
};

export const getAttendanceHistory = async () => {
  try {
    const q = query(collection(db, COLLECTIONS.ATTENDANCE), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    const data = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });
    return data;
  } catch (e) {
    console.error("Error fetching attendance:", e);
    return [];
  }
};

// --- VIOLATION TYPES ---
export const fetchViolationTypes = async () => {
  try {
    const defaultTypes = [
      'Đi trễ',
      'Sai đồng phục',
      'Vi phạm nội quy lớp học',
      'Vô lễ với giáo viên',
      'Đánh nhau',
      'Mang/Sử dụng điện thoại',
      'Mang giày sai quy định',
      'Phá hoại tài sản nhà trường'
    ];
    
    const q = collection(db, 'custom_violations');
    const querySnapshot = await getDocs(q);
    const customTypes = [];
    querySnapshot.forEach((doc) => {
      customTypes.push(doc.data().name);
    });
    
    const merged = Array.from(new Set([...defaultTypes, ...customTypes]));
    return [...merged.map(t => ({ value: t, label: t })), { value: 'Khác', label: 'Khác' }];
  } catch (error) {
    console.error("Error fetching violation types:", error);
    return [
      { value: 'Đi trễ', label: 'Đi trễ' },
      { value: 'Sai đồng phục', label: 'Sai đồng phục' },
      { value: 'Vi phạm nội quy lớp học', label: 'Vi phạm nội quy lớp học' },
      { value: 'Vô lễ với giáo viên', label: 'Vô lễ với giáo viên' },
      { value: 'Đánh nhau', label: 'Đánh nhau' },
      { value: 'Mang/Sử dụng điện thoại', label: 'Mang/Sử dụng điện thoại' },
      { value: 'Mang giày sai quy định', label: 'Mang giày sai quy định' },
      { value: 'Phá hoại tài sản nhà trường', label: 'Phá hoại tài sản nhà trường' },
      { value: 'Khác', label: 'Khác' }
    ];
  }
};

export const addCustomViolationType = async (typeName) => {
  if (!typeName || !typeName.trim()) return { success: false };
  try {
    const q = query(collection(db, 'custom_violations'), where("name", "==", typeName.trim()));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      await addDoc(collection(db, 'custom_violations'), {
        name: typeName.trim(),
        createdAt: Timestamp.now()
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Error adding custom violation type:", error);
    return { success: false, error };
  }
};

// --- SETTINGS ---
export const fetchSystemSettings = async () => {
  try {
    // Return default settings directly. Real DB logic can be added later.
    // For now we try to read from "settings" collection "academic_year" doc
    const q = collection(db, 'settings');
    const querySnapshot = await getDocs(q);
    let settings = {
      semester1StartDate: '2026-09-07',
      semester2StartDate: '2027-01-18',
      semester1Weeks: 18,
      semester2Weeks: 17
    };
    querySnapshot.forEach((doc) => {
      if (doc.id === 'academic_year') {
        const data = doc.data();
        // Migrate old schoolYearStartDate to semester1StartDate if needed
        if (data.schoolYearStartDate && !data.semester1StartDate) {
          data.semester1StartDate = data.schoolYearStartDate;
        }
        settings = { ...settings, ...data };
      }
    });
    return settings;
  } catch (error) {
    console.error("Error fetching settings:", error);
    return {
      semester1StartDate: '2026-09-07',
      semester2StartDate: '2027-01-18',
      semester1Weeks: 18,
      semester2Weeks: 17
    };
  }
};

export const updateSystemSettings = async (settingsData) => {
  try {
    const docRef = doc(db, 'settings', 'academic_year');
    await setDoc(docRef, settingsData, { merge: true });
    return { success: true };
  } catch (error) {
    console.error("Error updating settings:", error);
    return { success: false, error };
  }
};

export const getSystemConfig = async () => {
  try {
    const docRef = doc(db, 'settings', 'system_config');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return { latestVersion: '1.0.0', downloadLink: '' };
  } catch (error) {
    console.error("Error getting system config:", error);
    return { latestVersion: '1.0.0', downloadLink: '' };
  }
};

export const updateSystemConfig = async (configData) => {
  try {
    const docRef = doc(db, 'settings', 'system_config');
    await setDoc(docRef, configData, { merge: true });
    return { success: true };
  } catch (error) {
    console.error("Error updating system config:", error);
    return { success: false, error };
  }
};

// --- SAO LƯU & KHÔI PHỤC DỮ LIỆU ---

export const exportDatabase = async () => {
  try {
    const data = {
      students: [],
      classes: [],
      violations: [],
      attendance: [],
      settings: [],
      notifications: []
    };
    
    // Fetch all collections except users
    const studentsSnap = await getDocs(collection(db, COLLECTIONS.STUDENTS));
    studentsSnap.forEach(doc => data.students.push({ id: doc.id, ...doc.data() }));
    
    const classesSnap = await getDocs(collection(db, COLLECTIONS.CLASSES));
    classesSnap.forEach(doc => data.classes.push({ id: doc.id, ...doc.data() }));
    
    const violationsSnap = await getDocs(collection(db, COLLECTIONS.VIOLATIONS));
    violationsSnap.forEach(doc => data.violations.push({ id: doc.id, ...doc.data() }));
    
    const attendanceSnap = await getDocs(collection(db, COLLECTIONS.ATTENDANCE));
    attendanceSnap.forEach(doc => data.attendance.push({ id: doc.id, ...doc.data() }));

    const settingsSnap = await getDocs(collection(db, 'settings'));
    settingsSnap.forEach(doc => data.settings.push({ id: doc.id, ...doc.data() }));

    const notifSnap = await getDocs(collection(db, COLLECTIONS.NOTIFICATIONS));
    notifSnap.forEach(doc => data.notifications.push({ id: doc.id, ...doc.data() }));

    return data;
  } catch (error) {
    console.error("Lỗi khi xuất dữ liệu:", error);
    throw error;
  }
};

export const deleteAllData = async () => {
  try {
    const collectionsToClear = [
      COLLECTIONS.STUDENTS,
      COLLECTIONS.CLASSES,
      COLLECTIONS.VIOLATIONS,
      COLLECTIONS.ATTENDANCE,
      COLLECTIONS.NOTIFICATIONS
    ];

    for (const col of collectionsToClear) {
      const snap = await getDocs(collection(db, col));
      let batch = writeBatch(db);
      let count = 0;
      for (const docSnap of snap.docs) {
        batch.delete(docSnap.ref);
        count++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    }
    return true;
  } catch (error) {
    console.error("Lỗi khi xóa dữ liệu:", error);
    throw error;
  }
};

export const importDatabase = async (backupData) => {
  try {
    // 1. Wipe current collections
    const collectionsToClear = [
      { name: COLLECTIONS.STUDENTS, data: backupData.students || [] },
      { name: COLLECTIONS.CLASSES, data: backupData.classes || [] },
      { name: COLLECTIONS.VIOLATIONS, data: backupData.violations || [] },
      { name: COLLECTIONS.ATTENDANCE, data: backupData.attendance || [] },
      { name: COLLECTIONS.NOTIFICATIONS, data: backupData.notifications || [] },
      { name: 'settings', data: backupData.settings || [] }
    ];

    for (const colObj of collectionsToClear) {
      // Delete all existing
      const snap = await getDocs(collection(db, colObj.name));
      let batch = writeBatch(db);
      let count = 0;
      for (const docSnap of snap.docs) {
        batch.delete(docSnap.ref);
        count++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }

      // Write new data
      let writeCount = 0;
      batch = writeBatch(db);
      for (const item of colObj.data) {
        const itemData = { ...item };
        const docId = itemData.id;
        delete itemData.id; 

        const docRef = doc(db, colObj.name, docId);
        batch.set(docRef, itemData);
        writeCount++;
        if (writeCount === 500) {
          await batch.commit();
          batch = writeBatch(db);
          writeCount = 0;
        }
      }
      if (writeCount > 0) {
        await batch.commit();
      }
    }
    return true;
  } catch (error) {
    console.error("Lỗi khi khôi phục dữ liệu:", error);
    throw error;
  }
};

// --- NOTIFICATIONS ---

export const setupForegroundPush = () => {
  if (typeof window !== 'undefined' && messaging && !Capacitor.isNativePlatform()) {
    onMessage(messaging, (payload) => {
      console.log('Message received in foreground: ', payload);
      const notificationTitle = payload.notification?.title || 'Thông báo mới';
      const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/vite.svg'
      };
      
      // Show a toast when the website is open in the foreground
      const toast = document.createElement('div');
      toast.style.position = 'fixed';
      toast.style.top = '20px';
      toast.style.right = '20px';
      toast.style.background = 'var(--primary-color, #4361ee)';
      toast.style.color = 'white';
      toast.style.padding = '15px 20px';
      toast.style.borderRadius = '8px';
      toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      toast.style.zIndex = '9999';
      toast.style.maxWidth = '300px';
      toast.innerHTML = `<strong>${notificationTitle}</strong><br/>${notificationOptions.body}`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);

      if (Notification.permission === 'granted') {
        new Notification(notificationTitle, notificationOptions);
      }
    });
  }
};


export const requestNotificationPermission = async (userId) => {
  try {
    if (Capacitor.isNativePlatform()) {
      // Android / iOS Capacitor Push
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive === 'granted') {
        
        try {
          await PushNotifications.createChannel({
            id: 'qlhs_alerts',
            name: 'Cảnh báo Vi phạm',
            description: 'Thông báo có vi phạm mới',
            importance: 5,
            visibility: 1,
            vibration: true,
          });
        } catch (e) {
          console.warn('Could not create channel', e);
        }

        // Add listeners only once
        if (!window.pushListenersRegistered) {
          window.pushListenersRegistered = true;
          PushNotifications.addListener('registration', async (token) => {
            console.log('Push registration success, token: ' + token.value);
            try {
              const userRef = doc(db, COLLECTIONS.USERS, userId);
              await updateDoc(userRef, {
                fcmTokens: arrayUnion(token.value)
              });
              // Show toast to confirm registration
              const toast = document.createElement('div');
              toast.style.position = 'fixed';
              toast.style.bottom = '20px';
              toast.style.left = '50%';
              toast.style.transform = 'translateX(-50%)';
              toast.style.background = '#4CAF50';
              toast.style.color = 'white';
              toast.style.padding = '10px 20px';
              toast.style.borderRadius = '5px';
              toast.style.zIndex = '9999';
              toast.innerHTML = 'Đã kết nối Thông báo Đẩy thành công!';
              document.body.appendChild(toast);
              setTimeout(() => toast.remove(), 3000);
            } catch (e) {
              console.error('Lỗi khi lưu token:', e);
            }
          });
          PushNotifications.addListener('registrationError', (error) => {
            console.error('Error on push registration: ' + JSON.stringify(error));
          });
          
          // Also listen for foreground push notifications to show a local notification
          PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push received in foreground', notification);
            // Show toast for foreground notification
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.top = '20px';
            toast.style.right = '20px';
            toast.style.background = 'var(--primary-color, #4361ee)';
            toast.style.color = 'white';
            toast.style.padding = '15px 20px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            toast.style.zIndex = '9999';
            toast.style.maxWidth = '300px';
            toast.innerHTML = `<strong>${notification.title || 'Thông báo mới'}</strong><br/>${notification.body || ''}`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 5000);
          });
        }
        await PushNotifications.register();
      }
    } else {
      // Web Push
      if (!messaging) return;
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY });
        if (token) {
          const userRef = doc(db, COLLECTIONS.USERS, userId);
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(token)
          });
        }
      }
    }
  } catch (error) {
    console.error('Failed to get push token:', error);
  }
};

export const createNotification = async (message, targetRoles, targetClasses = [], data = {}) => {
  try {
    const notifData = {
      message,
      targetRoles,
      targetClasses,
      data,
      readBy: [],
      createdAt: Date.now()
    };
    const docRef = await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), notifData);
    
    // Trigger push notification
    try {
      const tokens = [];
      
      // If targetRoles is provided, get users by role
      if (targetRoles && targetRoles.length > 0) {
        const qRole = query(collection(db, COLLECTIONS.USERS), where('role', 'in', targetRoles));
        const roleSnap = await getDocs(qRole);
        roleSnap.forEach(doc => {
          const u = doc.data();
          if (u.fcmTokens && Array.isArray(u.fcmTokens)) {
            tokens.push(...u.fcmTokens);
          }
        });
      }

      // If targetClasses is provided, we need to find homeroom teachers for those classes
      if (targetClasses && targetClasses.length > 0) {
        const qClass = query(collection(db, COLLECTIONS.CLASSES), where('tenlop', 'in', targetClasses));
        const classSnap = await getDocs(qClass);
        
        for (const classDoc of classSnap.docs) {
          const classData = classDoc.data();
          if (classData.homeroomTeacherId) {
            const userRef = doc(db, COLLECTIONS.USERS, classData.homeroomTeacherId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const u = userSnap.data();
              if (u.fcmTokens && Array.isArray(u.fcmTokens)) {
                tokens.push(...u.fcmTokens);
              }
            }
          }
        }
      }
      
      const uniqueTokens = [...new Set(tokens)];
      if (uniqueTokens.length > 0) {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.')
          ? 'https://lax-qlhs.vercel.app/api/sendPush' 
          : '/api/sendPush';
          
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokens: uniqueTokens,
            title: 'Hệ thống Quản lý học sinh',
            body: message,
            data: data
          })
        }).catch(err => console.error("Error calling sendPush API:", err));
      }
    } catch(err) {
      console.error("Error triggering push:", err);
    }

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Lỗi khi tạo thông báo:", error);
    return { success: false, error };
  }
};

export const listenToNotifications = (userRoles, userClass, userName, callback) => {
  const q = query(
    collection(db, COLLECTIONS.NOTIFICATIONS),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const notifications = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Filter client-side
      const roleMatch = data.targetRoles && data.targetRoles.some(r => userRoles.includes(r));
      const classMatch = userClass && data.targetClasses && data.targetClasses.includes(userClass);
      
      const creator = data.data?.createdBy || data.data?.updatedBy;
      const isCreator = userName && creator && creator === userName;
      
      const isAttendanceEvent = data.data?.type === 'attendance_absence' || data.data?.type === 'attendance_class';
      
      if ((roleMatch || classMatch) && (!isCreator || isAttendanceEvent)) {
        notifications.push({ id: doc.id, ...data });
      }
    });
    callback(notifications);
  }, (error) => {
    console.error("Lỗi khi lắng nghe thông báo:", error);
  });

  return unsubscribe;
};

export const markNotificationAsRead = async (notificationId, userId) => {
  try {
    const docRef = doc(db, COLLECTIONS.NOTIFICATIONS, notificationId);
    await updateDoc(docRef, {
      readBy: arrayUnion(userId)
    });
    return true;
  } catch (error) {
    console.error("Lỗi khi đánh dấu đã đọc:", error);
    return false;
  }
};

export const markAllNotificationsAsRead = async (userId) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      limit(100) // we'll just update recent ones for simplicity, or we can fetch all where readBy doesn't contain userId
    );
    const snap = await getDocs(q);
    let batch = writeBatch(db);
    let count = 0;
    
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.readBy || !data.readBy.includes(userId)) {
        batch.update(docSnap.ref, {
          readBy: arrayUnion(userId)
        });
        count++;
      }
    });
    
    if (count > 0) {
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error("Lỗi khi đánh dấu đã đọc toàn bộ:", error);
    return false;
  }
};

export const getNotificationsPaginated = async (userRoles, userClass, userName, lastDoc = null, limitCount = 20) => {
  try {
    let q;
    const fetchLimit = limitCount * 2; 

    if (lastDoc) {
      q = query(
        collection(db, COLLECTIONS.NOTIFICATIONS),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(fetchLimit)
      );
    } else {
      q = query(
        collection(db, COLLECTIONS.NOTIFICATIONS),
        orderBy("createdAt", "desc"),
        limit(fetchLimit)
      );
    }

    const snapshot = await getDocs(q);
    const notifications = [];
    let newLastDoc = null;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      newLastDoc = doc; 
      
      const roleMatch = data.targetRoles && data.targetRoles.some(r => userRoles.includes(r));
      const classMatch = userClass && data.targetClasses && data.targetClasses.includes(userClass);
      
      const creator = data.data?.createdBy || data.data?.updatedBy;
      const isCreator = userName && creator && creator === userName;
      
      const isAttendanceEvent = data.data?.type === 'attendance_absence' || data.data?.type === 'attendance_class';
      
      if ((roleMatch || classMatch) && (!isCreator || isAttendanceEvent)) {
        notifications.push({ id: doc.id, ...data });
      }
    });

    // If we filtered out too many, we just return what we have. 
    // The user can press "Load more" again.
    return {
      notifications: notifications.slice(0, limitCount),
      lastDoc: newLastDoc,
      hasMore: snapshot.docs.length === fetchLimit
    };
  } catch (error) {
    console.error("Lỗi khi tải thông báo phân trang:", error);
    return { notifications: [], lastDoc: null, hasMore: false };
  }
};
