import React, { createContext, useState, useContext, useEffect } from 'react';
import { loginUser } from '../lib/firebase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for persistent login
    const storedUser = localStorage.getItem('qlhs_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const res = await loginUser(username, password);
    if (res.success) {
      setUser(res.user);
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
