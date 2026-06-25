import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { User as UserIcon, Lock, ArrowRight } from 'lucide-react';
import './Login.css';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Load saved credentials on mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('qlhs_saved_username');
    const savedPassword = localStorage.getItem('qlhs_saved_password');
    if (savedUsername && savedPassword) {
      setUsername(savedUsername);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await login(username, password);
    if (res.success) {
      if (rememberMe) {
        localStorage.setItem('qlhs_saved_username', username);
        localStorage.setItem('qlhs_saved_password', password);
      } else {
        localStorage.removeItem('qlhs_saved_username');
        localStorage.removeItem('qlhs_saved_password');
      }
      navigate('/');
    } else {
      setError(res.message || 'Đăng nhập thất bại.');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-logo-container">
        <img 
          src="/school-logo.png" 
          alt="Logo Trường THCS Lê Anh Xuân" 
          className="login-logo-img"
        />
        <h1 className="login-title">Đăng nhập ứng dụng</h1>
        <p className="login-subtitle">Quản lý học sinh - THCS Lê Anh Xuân</p>
      </div>

      <div className="login-card">
        <form onSubmit={handleLogin} className="login-form">
          {error && <div className="login-error">{error}</div>}
          
          <div className="form-group">
            <label className="input-label-upper">TÀI KHOẢN</label>
            <div className="input-with-icon">
              <UserIcon className="input-icon" size={18} />
              <input 
                className="input-field"
                placeholder="Nhập tên đăng nhập" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="input-label-upper">MẬT KHẨU</label>
            <div className="input-with-icon">
              <Lock className="input-icon" size={18} />
              <input 
                className="input-field"
                type="password"
                placeholder="Nhập mật khẩu" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <label className="remember-me-label">
            <input 
              type="checkbox" 
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="remember-checkbox"
            />
            <span>Ghi nhớ tên đăng nhập và mật khẩu</span>
          </label>

          <button type="submit" disabled={loading} className="login-submit-btn">
            {loading ? 'Đang xử lý...' : (
              <>Đăng Nhập <ArrowRight size={18} /></>
            )}
          </button>
        </form>
      </div>
      
      <div className="login-footer">
        © 2026 THCS Lê Anh Xuân. All rights reserved.
      </div>
    </div>
  );
}
