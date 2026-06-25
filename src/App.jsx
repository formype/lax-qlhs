import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { BottomNav } from './components/layout/BottomNav';
import { Dashboard } from './pages/Dashboard';
import { Features } from './pages/Features';
import { AddViolation } from './pages/AddViolation';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { ManageClasses } from './pages/ManageClasses';
import { ManageStudents } from './pages/ManageStudents';
import { Attendance } from './pages/Attendance';
import { AttendanceSearch } from './pages/AttendanceSearch';
import { StudentList } from './pages/StudentList';
import { AccountSettings } from './pages/AccountSettings';
import { ManageAccounts } from './pages/ManageAccounts';
import { ManageUpdates } from './pages/ManageUpdates';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { App as CapacitorApp } from '@capacitor/app';
import { getSystemConfig } from './lib/firebase';
import { APP_VERSION } from './config';
import { Button } from './components/ui/Button';
import { X } from 'lucide-react';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.blockedPages && user.blockedPages.includes(location.pathname)) {
    alert("Bạn không có quyền truy cập vào trang này!");
    return <Navigate to="/" replace />;
  }

  if (user.role === 'giaovien' && (
      location.pathname === '/add' || 
      location.pathname === '/attendance' || 
      location.pathname === '/classes' || 
      location.pathname === '/students'
  )) {
    alert("Giáo viên không có quyền truy cập chức năng này!");
    return <Navigate to="/" replace />;
  }

  if (user.role === 'giamthi' && (
      location.pathname === '/classes' || 
      location.pathname === '/students'
  )) {
    alert("Giám thị không có quyền truy cập chức năng này!");
    return <Navigate to="/" replace />;
  }

  return children;
};

const MainLayout = ({ children }) => {
  return (
    <>
      <div className="main-content">
        {children}
      </div>
      <BottomNav />
    </>
  );
};

const UpdateChecker = () => {
  const { user } = useAuth();
  const [showUpdate, setShowUpdate] = useState(false);
  const [downloadLink, setDownloadLink] = useState('');

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const config = await getSystemConfig();
        if (config && config.latestVersion && config.latestVersion !== APP_VERSION) {
          setDownloadLink(config.downloadLink);
          setShowUpdate(true);
        }
      } catch (error) {
        console.error("Error checking update:", error);
      }
    };
    
    // Initial check on mount
    checkUpdate();

    // Fallback for Web browser visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Capacitor listener for mobile app resume
    let appStateListener;
    const setupListener = async () => {
      appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          checkUpdate();
        }
      });
    };
    setupListener();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, [user]);

  if (!showUpdate) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '32px', position: 'relative' }}>
        <button 
          onClick={() => setShowUpdate(false)}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--danger)',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
          }}
        >
          <X size={24} />
        </button>
        <h3 style={{ color: 'var(--danger)', marginBottom: '16px', fontSize: '1.25rem', fontWeight: 700 }}>Đã có phiên bản mới!</h3>
        <p className="text-muted mb-4">Phiên bản hiện tại của bạn đã cũ, vui lòng cập nhật lên phiên bản mới nhất để tiếp tục sử dụng.</p>
        <div className="flex-col gap-3">
          <a href={downloadLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <Button fullWidth>Tải xuống bản cập nhật</Button>
          </a>
          {user?.role === 'vip-admin' && (
            <Button variant="secondary" fullWidth onClick={() => setShowUpdate(false)}>
              Bỏ qua (Dành cho VIP Admin)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Initial Dark Mode load
    if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark');
    }

    const listenerPromise = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (location.pathname === '/') {
        CapacitorApp.exitApp();
      } else if (location.pathname === '/features' || location.pathname === '/settings') {
        navigate('/', { replace: true });
      } else {
        navigate(-1);
      }
    });

    return () => {
      listenerPromise.then(listener => {
        if (listener) listener.remove();
      });
    };
  }, [location.pathname, navigate]);

  return (
    <div className="app-shell">
      <UpdateChecker />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><MainLayout><Dashboard /></MainLayout></ProtectedRoute>} />
        <Route path="/features" element={<ProtectedRoute><MainLayout><Features /></MainLayout></ProtectedRoute>} />
        <Route path="/add" element={<ProtectedRoute><MainLayout><AddViolation /></MainLayout></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><MainLayout><Search /></MainLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><MainLayout><Settings /></MainLayout></ProtectedRoute>} />
        <Route path="/account-settings" element={<ProtectedRoute><MainLayout><AccountSettings /></MainLayout></ProtectedRoute>} />
        <Route path="/manage-accounts" element={<ProtectedRoute><MainLayout><ManageAccounts /></MainLayout></ProtectedRoute>} />
        <Route path="/manage-updates" element={<ProtectedRoute><MainLayout><ManageUpdates /></MainLayout></ProtectedRoute>} />
        <Route path="/classes" element={<ProtectedRoute><MainLayout><ManageClasses /></MainLayout></ProtectedRoute>} />
        <Route path="/students" element={<ProtectedRoute><MainLayout><ManageStudents /></MainLayout></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute><MainLayout><Attendance /></MainLayout></ProtectedRoute>} />
        <Route path="/attendance-search" element={<ProtectedRoute><MainLayout><AttendanceSearch /></MainLayout></ProtectedRoute>} />
        <Route path="/student-list" element={<ProtectedRoute><MainLayout><StudentList /></MainLayout></ProtectedRoute>} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
