import React, { createContext, useState, useContext, useEffect } from 'react';
import { loginUser, requestNotificationPermission, setupForegroundPush } from '../lib/firebase';

const AuthContext = createContext(null);

// Khởi tạo nhận thông báo khi app đang mở
if (typeof window !== 'undefined') {
  setupForegroundPush();
}


export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for persistent login
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
  }, []);

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
