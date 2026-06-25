import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, Timestamp, where, doc, deleteDoc, updateDoc, setDoc, serverTimestamp, getDoc, writeBatch } from 'firebase/firestore';

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

const COLLECTIONS = {
  STUDENTS: 'students',
  CLASSES: 'classes',
  VIOLATIONS: 'violations',
  USERS: 'users',
  ATTENDANCE: 'attendance'
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
      return { 
        success: true, 
        user: {
          id: querySnapshot.docs[0].id,
          username: userData.username,
          fullName: userData.fullName,
          role: userData.role,
          password: userData.password,
          blockedPages: userData.blockedPages || []
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
      users.push({ id: doc.id, ...doc.data() });
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
      return { success: true, id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
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
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error adding class:", error);
    return { success: false, error };
  }
};

export const deleteClass = async (classId) => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.CLASSES, classId));
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

// --- ATTENDANCE ---
export const saveAttendance = async (date, className, attendanceData, createdBy = 'Hệ thống') => {
  try {
    const safeClassName = className.replace(/\//g, '-');
    const docId = `${safeClassName}_${date}`; // e.g. 10A1_2026-09-07
    const docRef = doc(db, COLLECTIONS.ATTENDANCE, docId);
    await setDoc(docRef, {
      date,
      className,
      records: attendanceData, // Object mapping studentId -> status (present, absent)
      createdBy,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error("Error saving attendance:", error);
    return { success: false, error: error.message || error.toString() };
  }
};

export const updateAttendanceStudent = async (date, className, studentId, newStatus, proofBase64) => {
  try {
    const safeClassName = className.replace(/\//g, '-');
    const docId = `${safeClassName}_${date}`;
    const docRef = doc(db, COLLECTIONS.ATTENDANCE, docId);
    
    const updates = {
      [`records.${studentId}`]: newStatus,
      updatedAt: serverTimestamp()
    };
    if (proofBase64) {
      updates[`proofs.${studentId}`] = proofBase64;
    }
    
    await updateDoc(docRef, updates);
    return { success: true };
  } catch (error) {
    console.error("Error updating attendance student:", error);
    return { success: false, error: error.message || error.toString() };
  }
};

export const getAttendanceForDateClass = async (date, className) => {
  try {
    const safeClassName = className.replace(/\//g, '-');
    const docId = `${safeClassName}_${date}`;
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
