import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { loginUser, requestNotificationPermission, setupForegroundPush, db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const AuthContext = createContext(null);

if (typeof window !== 'undefined') {
  setupForegroundPush();
}

let localSessionId = localStorage.getItem('qlhs_session_id');
if (!localSessionId) {
  localSessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
  localStorage.setItem('qlhs_session_id', localSessionId);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const isAppActiveRef = useRef(true);
  const currentRemoteSessionIdRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const userRefState = useRef(null);

  // Keep ref synced with state to avoid stale closure in event listeners
  useEffect(() => {
    userRefState.current = user;
  }, [user]);

  const claimSession = async (userId) => {
     try {
       const userDoc = doc(db, 'users', userId);
       await updateDoc(userDoc, { currentActiveSession: localSessionId });
     } catch (e) {
       console.error("Lỗi khi giành session:", e);
     }
  };

  const handleStateChange = (isActive) => {
     isAppActiveRef.current = isActive;
     if (isActive && userRefState.current) {
        if (currentRemoteSessionIdRef.current !== localSessionId) {
            claimSession(userRefState.current.id);
        }
     }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('qlhs_user');
    if (storedUser) {
      let parsedUser = JSON.parse(storedUser);
      if (typeof parsedUser.role === 'string') {
        parsedUser.role = [parsedUser.role];
      } else if (!parsedUser.role) {
        parsedUser.role = [];
      }
      setUser(parsedUser);
      requestNotificationPermission(parsedUser.id);
    }
    setLoading(false);
    
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        handleStateChange(isActive);
      });
    } else {
      const visibilityHandler = () => {
         handleStateChange(!document.hidden);
      };
      window.addEventListener('visibilitychange', visibilityHandler);
      return () => {
         window.removeEventListener('visibilitychange', visibilityHandler);
      };
    }
  }, []); 

  useEffect(() => {
     if (!user) {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
        return;
     }
     
     if (isAppActiveRef.current) {
         claimSession(user.id);
     }
     
     const userDocRef = doc(db, 'users', user.id);
     const localCredentialsUpdatedAt = user.credentialsUpdatedAt || 0;

     unsubscribeRef.current = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
           const data = docSnap.data();
           currentRemoteSessionIdRef.current = data.currentActiveSession;
           
           if (data.credentialsUpdatedAt && data.credentialsUpdatedAt > localCredentialsUpdatedAt) {
               alert("Mật khẩu hoặc Thông tin cá nhân của bạn đã thay đổi! Vui lòng đăng nhập lại.");
               logout();
               return;
           }
           
           if (data.currentActiveSession && data.currentActiveSession !== localSessionId) {
               if (isAppActiveRef.current) {
                   alert("Tài khoản của bạn vừa được đăng nhập trên một thiết bị khác! Phiên đăng nhập hiện tại sẽ kết thúc.");
                   logout();
               }
           }
        }
     });
     
     return () => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
     };
  }, [user?.id]); 

  const login = async (username, password) => {
    const res = await loginUser(username, password);
    if (res.success) {
      setUser(res.user);
      requestNotificationPermission(res.user.id);
      localStorage.setItem('qlhs_user', JSON.stringify(res.user));
    }
    return res;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('qlhs_user');
  };

  const updateContextUser = (updatedData) => {
    if (user) {
      const newUser = { ...user, ...updatedData };
      setUser(newUser);
      localStorage.setItem('qlhs_user', JSON.stringify(newUser));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateContextUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
