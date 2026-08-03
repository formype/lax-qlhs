import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { User as UserIcon, Lock, ArrowRight, AlertTriangle } from 'lucide-react';
import { 
  checkAuthRateLimit, 
  recordFailedAuthAttempt, 
  recordSuccessfulAuth,
  formatRemainingTime 
} from '../lib/rateLimiter';
import './Login.css';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimitState, setRateLimitState] = useState({
    isLocked: false,
    remainingMs: 0,
    formattedTime: '',
    remainingAttempts: 5
  });
  const { login } = useAuth();
  const navigate = useNavigate();

  // Check rate limit status on mount and tick countdown
  useEffect(() => {
    const status = checkAuthRateLimit();
    setRateLimitState(status);

    const timer = setInterval(() => {
      const currentStatus = checkAuthRateLimit();
      setRateLimitState(currentStatus);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    // Pre-check rate limit
    const currentRateLimit = checkAuthRateLimit();
    if (currentRateLimit.isLocked) {
      setError(`Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau ${currentRateLimit.formattedTime}.`);
      return;
    }

    setLoading(true);

    const res = await login(cleanUsername, cleanPassword);
    if (res.success) {
      recordSuccessfulAuth();
      if (rememberMe) {
        localStorage.setItem('qlhs_saved_username', cleanUsername);
        localStorage.setItem('qlhs_saved_password', cleanPassword);
      } else {
        localStorage.removeItem('qlhs_saved_username');
        localStorage.removeItem('qlhs_saved_password');
      }
      navigate('/');
    } else {
      const updatedLimit = recordFailedAuthAttempt();
      setRateLimitState(updatedLimit);

      if (updatedLimit.isLocked) {
        setError(`Bạn đã thử đăng nhập sai quá 5 lần. Hệ thống tạm khóa trong ${updatedLimit.formattedTime}.`);
      } else {
        const remainingText = updatedLimit.remainingAttempts > 0 
          ? ` Bạn còn ${updatedLimit.remainingAttempts} lần thử.` 
          : '';
        setError((res.message || 'Đăng nhập thất bại.') + remainingText);
      }
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
          {rateLimitState.isLocked ? (
            <div className="login-error" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #f87171' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0 }} />
              <div>
                <strong>Tài khoản tạm khóa</strong>
                <div>Vui lòng thử lại sau: <span style={{ fontWeight: 'bold', textDecoration: 'underline' }}>{rateLimitState.formattedTime}</span></div>
              </div>
            </div>
          ) : error ? (
            <div className="login-error">{error}</div>
          ) : null}
          
          <div className="form-group">
            <label className="input-label-upper">TÀI KHOẢN</label>
            <div className="input-with-icon">
              <UserIcon className="input-icon" size={18} />
              <input 
                className="input-field"
                placeholder="Nhập tên đăng nhập" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={rateLimitState.isLocked || loading}
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
                disabled={rateLimitState.isLocked || loading}
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
              disabled={rateLimitState.isLocked || loading}
            />
            <span>Ghi nhớ tên đăng nhập và mật khẩu</span>
          </label>

          <div className="login-submit-wrapper">
            <button 
              type="submit" 
              disabled={rateLimitState.isLocked || loading} 
              className="login-submit-btn"
              style={rateLimitState.isLocked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
            >
              {loading ? 'Đang xử lý...' : (
                rateLimitState.isLocked ? `Tạm khóa (${rateLimitState.formattedTime})` : (
                  <>Đăng Nhập <ArrowRight size={18} /></>
                )
              )}
            </button>
          </div>
        </form>
      </div>
      
      <div className="login-footer">
        © 2026 THCS Lê Anh Xuân. All rights reserved.
      </div>
    </div>
  );
}
