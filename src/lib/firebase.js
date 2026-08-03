import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, Timestamp, where, doc, deleteDoc, updateDoc, setDoc, serverTimestamp, getDoc, writeBatch, onSnapshot, limit, arrayUnion, startAfter } from 'firebase/firestore';
import { 
  sanitizeText, 
  sanitizeUsername, 
  sanitizeDate, 
  validateViolationPayload, 
  validateUserAccountPayload, 
  validateImageBase64 
} from './sanitizer.js';
import { hashPassword, verifyPassword } from './crypto.js';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBwXa8K6417vl6aIF1vig3GVkfXgV5Ju6c",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "viphamhs.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "viphamhs",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "viphamhs.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "117208625100",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:117208625100:web:517913f5db05985b72f769",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-E5M207LRCD"
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

export const COLLECTIONS = {
  USERS: 'users',
  STUDENTS: 'students',
  CLASSES: 'classes',
  VIOLATIONS: 'violations',
  CONFIG: 'config',
  VIOLATION_RULES: 'violationRules',
  DISCIPLINARY_ACTIONS: 'disciplinaryActions',
  ATTENDANCE: 'attendance',
  NOTIFICATIONS: 'notifications'
};

// --- USERS / AUTH ---
export const loginUser = async (rawUsername, rawPassword) => {
  try {
    const cleanRaw = String(rawUsername || '').trim();
    const username = sanitizeUsername(cleanRaw);
    const password = typeof rawPassword === 'string' ? rawPassword.trim().substring(0, 100) : '';

    if (!cleanRaw || !password) {
      return { success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu hợp lệ.' };
    }

    let userDoc = null;
    let userData = null;
    let userId = null;

    // 1. Try querying by sanitized lowercase username
    if (username) {
      const q = query(
        collection(db, COLLECTIONS.USERS),
        where("username", "==", username)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        userDoc = querySnapshot.docs[0];
        userData = userDoc.data();
        userId = userDoc.id;
      }
    }

    // 2. If not found, try querying by raw username (case-sensitive)
    if (!userDoc && cleanRaw) {
      const qRaw = query(
        collection(db, COLLECTIONS.USERS),
        where("username", "==", cleanRaw)
      );
      const rawSnapshot = await getDocs(qRaw);
      if (!rawSnapshot.empty) {
        userDoc = rawSnapshot.docs[0];
        userData = userDoc.data();
        userId = userDoc.id;
      }
    }

    // 3. If still not found, try fetching doc directly by ID
    if (!userDoc) {
      try {
        const docRef = doc(db, COLLECTIONS.USERS, cleanRaw);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          userDoc = snap;
          userData = snap.data();
          userId = snap.id;
        }
      } catch (err) {
        // ignore
      }
    }

    // 4. Fallback: search all users (handles legacy accounts or case-insensitive matches)
    if (!userDoc) {
      const allUsersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
      const targetClean = cleanRaw.toLowerCase();
      const matched = allUsersSnap.docs.find(d => {
        const u = d.data();
        const uName = String(u.username || u.userName || u.taiKhoan || d.id || '').toLowerCase().trim();
        return uName === targetClean || (username && uName === username);
      });
      if (matched) {
        userDoc = matched;
        userData = matched.data();
        userId = matched.id;
      }
    }

    if (!userDoc || !userData) {
      return { success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
    }

    // Cryptographically verify password (supports modern salt-hash & legacy plain)
    const { isValid, needsUpgrade } = await verifyPassword(password, userData.password);
    if (!isValid) {
      return { success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' };
    }

    // Silent upgrade legacy plaintext passwords to salted hash and ensure username field is present
    try {
      const updates = {};
      if (needsUpgrade) {
        updates.password = await hashPassword(password);
      }
      if (!userData.username && username) {
        updates.username = username;
      }
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, COLLECTIONS.USERS, userId), updates);
      }
    } catch (upgradeErr) {
      console.warn("Silent user upgrade failed:", upgradeErr);
    }

    let roles = Array.isArray(userData.role) ? userData.role : (userData.role ? [userData.role] : []);
    
    let teacherClass = null;
    if (roles.includes('giaovien')) {
      const classQ = query(collection(db, COLLECTIONS.CLASSES), where("homeroomTeacherId", "==", userId));
      const classSnap = await getDocs(classQ);
      if (!classSnap.empty) {
        teacherClass = classSnap.docs[0].data().tenlop;
      }
    }

    // Strip password from returned user object for zero-leakage security
    const { password: _pwd, ...safeUserData } = userData;

    return { 
      success: true, 
      user: {
        ...safeUserData,
        id: userId,
        username: userData.username || username || cleanRaw,
        role: roles, 
        blockedPages: userData.blockedPages || [],
        teacherClass: teacherClass
      }  
    };
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
      // Strip password from returned list
      const { password: _pwd, ...safeUserData } = d;
      const resolvedUsername = d.username || d.userName || d.taiKhoan || doc.id;
      const resolvedFullName = d.fullName || d.name || d.hoten || resolvedUsername;
      users.push({ 
        id: doc.id, 
        ...safeUserData, 
        username: resolvedUsername,
        fullName: resolvedFullName,
        role: roles 
      });
    });
    return users;
  } catch (error) {
    console.error("Fetch Users Error:", error);
    return [];
  }
};

export const addUser = async (userData) => {
  try {
    // Validate & sanitize account data
    const validation = validateUserAccountPayload(userData, true);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }
    const cleanUserData = {
      ...userData,
      ...validation.sanitized
    };

    // Hash password if provided
    if (cleanUserData.password) {
      cleanUserData.password = await hashPassword(cleanUserData.password);
    }

    // Check if username already exists
    const q = query(collection(db, COLLECTIONS.USERS), where("username", "==", cleanUserData.username));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return { success: false, error: 'Tên đăng nhập đã tồn tại.' };
    }
    const docRef = await addDoc(collection(db, COLLECTIONS.USERS), cleanUserData);
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Add User Error:", error);
    return { success: false, error: error.message || error.toString() };
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
    const validation = validateUserAccountPayload(updates, false);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }
    const cleanUpdates = {
      ...updates,
      ...validation.sanitized
    };

    // If password is being updated, hash it before writing to Firestore
    if (cleanUpdates.password) {
      cleanUpdates.password = await hashPassword(cleanUpdates.password);
    }

    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, cleanUpdates);
    
    // Check if fullName is updated
    if (cleanUpdates.fullName !== undefined) {
      const qClass = query(collection(db, COLLECTIONS.CLASSES), where("homeroomTeacherId", "==", userId));
      const snap = await getDocs(qClass);
      if (!snap.empty) {
        const batchOp = writeBatch(db);
        snap.forEach(d => {
          batchOp.update(d.ref, { homeroomTeacherName: cleanUpdates.fullName || cleanUpdates.username || 'Giáo viên' });
        });
        await batchOp.commit();
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error("Update User Error:", error);
    return { success: false, error: error.message || error.toString() };
  }
};

export const changeUserPassword = async (userId, currentPassword, newPassword) => {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return { success: false, error: 'Không tìm thấy thông tin tài khoản.' };
    }
    const userData = userSnap.data();

    // Verify current password
    const { isValid } = await verifyPassword(currentPassword, userData.password);
    if (!isValid) {
      return { success: false, error: 'Mật khẩu hiện tại không đúng!' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Mật khẩu mới phải từ 6 ký tự trở lên!' };
    }

    const newHashedPassword = await hashPassword(newPassword);
    await updateDoc(userRef, {
      password: newHashedPassword,
      credentialsUpdatedAt: Date.now()
    });

    return { success: true };
  } catch (error) {
    console.error("Change Password Error:", error);
    return { success: false, error: error.message || error.toString() };
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
      // Strip password from returned user
      const { password: _pwd, ...safeUserData } = d;
      return { success: true, id: querySnapshot.docs[0].id, ...safeUserData, role: roles };
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
    // Validate violation payload and image size
    if (data.imageUrl) {
      const imgCheck = validateImageBase64(data.imageUrl);
      if (!imgCheck.isValid) {
        return { success: false, error: imgCheck.error };
      }
    }

    const cleanData = {
      ...data,
      hoten: sanitizeText(data.hoten || data.studentName, 100),
      tenlop: sanitizeText(data.tenlop || data.className, 50),
      noidung: sanitizeText(data.noidung || data.violationType || data.description, 500),
      mota: sanitizeText(data.mota || data.description, 500),
      nguoinhap: sanitizeText(data.nguoinhap || data.reporter, 100),
      diemtru: typeof data.diemtru === 'number' ? Math.max(0, data.diemtru) : (Number(data.diemtru) || 0),
      createdAt: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.VIOLATIONS), cleanData);
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error adding violation: ", error);
    return { success: false, error: error.message || error.toString() };
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
    const term = sanitizeText(searchTerm, 100).toLowerCase();
    
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
      trangthai: sanitizeText(newStatus, 50)
    });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateViolationDetails = async (violationId, updates) => {
  try {
    if (updates.imageUrl) {
      const imgCheck = validateImageBase64(updates.imageUrl);
      if (!imgCheck.isValid) {
        return { success: false, error: imgCheck.error };
      }
    }

    const cleanUpdates = { ...updates };
    if (cleanUpdates.hoten !== undefined) cleanUpdates.hoten = sanitizeText(cleanUpdates.hoten, 100);
    if (cleanUpdates.tenlop !== undefined) cleanUpdates.tenlop = sanitizeText(cleanUpdates.tenlop, 50);
    if (cleanUpdates.noidung !== undefined) cleanUpdates.noidung = sanitizeText(cleanUpdates.noidung, 500);
    if (cleanUpdates.mota !== undefined) cleanUpdates.mota = sanitizeText(cleanUpdates.mota, 500);
    if (cleanUpdates.nguoinhap !== undefined) cleanUpdates.nguoinhap = sanitizeText(cleanUpdates.nguoinhap, 100);

    const violationRef = doc(db, COLLECTIONS.VIOLATIONS, violationId);
    await updateDoc(violationRef, {
      ...cleanUpdates,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error("Error updating violation details: ", error);
    return { success: false, error: error.message || error.toString() };
  }
};

// --- ATTENDANCE ---
export const saveAttendance = async (date, session, className, attendanceData, createdBy = 'Hệ thống', reasonsData = {}) => {
  try {
    const cleanDate = sanitizeDate(date) || date;
    const cleanSession = (session === 'Chiều' || session === 'afternoon') ? 'Chiều' : 'Sáng';
    const cleanClassName = sanitizeText(className, 50);
    const safeClassName = cleanClassName.replace(/\//g, '-');
    const docId = `${safeClassName}_${cleanDate}_${cleanSession}`;
    const docRef = doc(db, COLLECTIONS.ATTENDANCE, docId);
    
    // Sanitize reasons
    const cleanReasons = {};
    if (reasonsData && typeof reasonsData === 'object') {
      for (const stId in reasonsData) {
        cleanReasons[stId] = sanitizeText(reasonsData[stId], 255);
      }
    }

    const docData = {
      date: cleanDate,
      session: cleanSession,
      className: cleanClassName,
      records: attendanceData, // Object mapping studentId -> status
      createdBy: sanitizeText(createdBy, 100),
      updatedAt: serverTimestamp()
    };
    
    if (Object.keys(cleanReasons).length > 0) {
      docData.reasons = cleanReasons;
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
    if (proofBase64) {
      const imgCheck = validateImageBase64(proofBase64);
      if (!imgCheck.isValid) {
        return { success: false, error: imgCheck.error };
      }
    }

    const cleanDate = sanitizeDate(date) || date;
    const cleanSession = (session === 'Chiều' || session === 'afternoon') ? 'Chiều' : 'Sáng';
    const safeClassName = sanitizeText(className, 50).replace(/\//g, '-');
    const docId = `${safeClassName}_${cleanDate}_${cleanSession}`;
    const docRef = doc(db, COLLECTIONS.ATTENDANCE, docId);
    
    const updates = {
      [`records.${studentId}`]: sanitizeText(newStatus, 50),
      updatedAt: serverTimestamp()
    };
    if (proofBase64) {
      updates[`proofs.${studentId}`] = proofBase64;
    }
    if (updatedBy) {
      updates[`updatedBy.${studentId}`] = sanitizeText(updatedBy, 100);
    }
    if (reason) {
      updates[`reasons.${studentId}`] = sanitizeText(reason, 255);
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
      
      // Show a safe toast when the website is open in the foreground
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

      const strongTitle = document.createElement('strong');
      strongTitle.textContent = notificationTitle;
      toast.appendChild(strongTitle);

      if (notificationOptions.body) {
        toast.appendChild(document.createElement('br'));
        const bodySpan = document.createElement('span');
        bodySpan.textContent = notificationOptions.body;
        toast.appendChild(bodySpan);
      }

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
              // Show safe toast to confirm registration
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
              toast.textContent = 'Đã kết nối Thông báo Đẩy thành công!';
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
            // Show safe toast for foreground notification
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

            const notifTitle = document.createElement('strong');
            notifTitle.textContent = notification.title || 'Thông báo mới';
            toast.appendChild(notifTitle);

            if (notification.body) {
              toast.appendChild(document.createElement('br'));
              const notifBody = document.createElement('span');
              notifBody.textContent = notification.body;
              toast.appendChild(notifBody);
            }

            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 5000);
          });
        }
        await PushNotifications.register();
      }
    } else {
      // Web Push
      if (!messaging) return;
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || "BHo-r8JpDpkLDUWUy-mBxr1DYa6Dto4BdjwUruByZJRAXA63_5539Pb0dKlHbvgvI2LeChdLQf4Dzyfnxk3YVGI";
      
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        let swRegistration;
        if ('serviceWorker' in navigator) {
          try {
            const swParams = new URLSearchParams({
              apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBwXa8K6417vl6aIF1vig3GVkfXgV5Ju6c",
              authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "viphamhs.firebaseapp.com",
              projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "viphamhs",
              storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "viphamhs.firebasestorage.app",
              messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "117208625100",
              appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:117208625100:web:517913f5db05985b72f769",
              measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-E5M207LRCD"
            });
            swRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${swParams.toString()}`);
          } catch (swErr) {
            console.warn('Service worker registration error:', swErr);
          }
        }

        const tokenOptions = { vapidKey };
        if (swRegistration) {
          tokenOptions.serviceWorkerRegistration = swRegistration;
        }

        const token = await getToken(messaging, tokenOptions);
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
    const cleanMessage = sanitizeText(message, 500);
    if (!cleanMessage) {
      return { success: false, error: 'Nội dung thông báo không được để trống.' };
    }

    const notifData = {
      message: cleanMessage,
      targetRoles: Array.isArray(targetRoles) ? targetRoles : (targetRoles ? [targetRoles] : []),
      targetClasses: Array.isArray(targetClasses) ? targetClasses : (targetClasses ? [targetClasses] : []),
      data: data && typeof data === 'object' ? data : {},
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
          
        const appSecret = import.meta.env.VITE_APP_PUSH_SECRET || '';
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-app-secret': appSecret
          },
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
