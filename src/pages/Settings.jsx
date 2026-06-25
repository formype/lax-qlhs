import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LogOut, User as UserIcon, Database, Moon, Users, BookOpen, Calendar, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchSystemSettings, updateSystemSettings } from '../lib/firebase';
import './Settings.css';

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [academicSettings, setAcademicSettings] = React.useState({
    semester1StartDate: '2026-09-07',
    semester2StartDate: '2027-01-18',
    semester1Weeks: 18,
    semester2Weeks: 17
  });
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    fetchSystemSettings().then(data => setAcademicSettings(data));
    const currentMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(currentMode);
    if (currentMode) {
      document.body.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    if (newMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSaveAcademicSettings = async () => {
    setSavingSettings(true);
    const result = await updateSystemSettings(academicSettings);
    setSavingSettings(false);
    if (result.success) {
      alert("Đã lưu cấu hình năm học thành công!");
    } else {
      alert("Có lỗi xảy ra khi lưu cấu hình.");
    }
  };

  return (
    <>
      <Header title="Cài đặt" />
      <div className="settings-content">
        <Card className="profile-card">
          <CardBody className="flex-row gap-4">
            <div className="avatar-circle">
              <UserIcon size={32} color="var(--primary-color)" />
            </div>
            <div>
              <h3 className="profile-name">{user ? user.fullName : 'Chưa đăng nhập'}</h3>
              <p className="text-muted">Vai trò: {user ? (user.role === 'admin' ? 'Quản trị viên' : user.role === 'giamthi' ? 'Giám thị' : 'Giáo viên') : 'Khách'}</p>
            </div>
          </CardBody>
        </Card>

        {/* Removed Quản lý Dữ liệu as requested */}

        {user && (user.role === 'admin' || user.role === 'vip-admin') && (
          <>
            <h4 className="settings-group-title mt-4">Quản lý</h4>
            <div className="settings-list">
              <Card className="settings-item" onClick={() => navigate('/manage-accounts')} style={{ cursor: 'pointer' }}>
                <CardBody className="flex-between">
                  <div className="flex-row gap-3">
                    <Users size={20} className="text-primary" />
                    <span>Quản lý tài khoản</span>
                  </div>
                </CardBody>
              </Card>
              {user.role === 'vip-admin' && (
                <Card className="settings-item mt-2" onClick={() => navigate('/manage-updates')} style={{ cursor: 'pointer' }}>
                  <CardBody className="flex-between">
                    <div className="flex-row gap-3">
                      <RefreshCw size={20} className="text-primary" />
                      <span>Quản lý cập nhật</span>
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          </>
        )}

        <h4 className="settings-group-title mt-4">Tài khoản</h4>
        <div className="settings-list">
          <Card className="settings-item" onClick={() => navigate('/account-settings')} style={{ cursor: 'pointer' }}>
            <CardBody className="flex-between">
              <div className="flex-row gap-3">
                <UserIcon size={20} className="text-primary" />
                <span>Cài đặt tài khoản</span>
              </div>
            </CardBody>
          </Card>
        </div>

        {user && (user.role === 'admin' || user.role === 'vip-admin') && (
          <>
            <h4 className="settings-group-title mt-4">Cấu hình Năm học</h4>
            <Card className="mb-3">
              <CardBody>
                <div className="flex-col gap-3">
                  <div className="flex-row gap-3">
                    <div className="input-group flex-1">
                      <label className="input-label">Ngày bắt đầu Tuần 1 (HK1)</label>
                      <input 
                        type="date" 
                        className="input-field" 
                        value={academicSettings.semester1StartDate}
                        onChange={(e) => setAcademicSettings({...academicSettings, semester1StartDate: e.target.value})}
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label className="input-label">Ngày bắt đầu Tuần 1 (HK2)</label>
                      <input 
                        type="date" 
                        className="input-field" 
                        value={academicSettings.semester2StartDate}
                        onChange={(e) => setAcademicSettings({...academicSettings, semester2StartDate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="flex-row gap-3">
                    <div className="input-group flex-1">
                      <label className="input-label">Số tuần Học kỳ 1</label>
                      <input 
                        type="number" 
                        className="input-field" 
                        value={academicSettings.semester1Weeks}
                        onChange={(e) => setAcademicSettings({...academicSettings, semester1Weeks: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label className="input-label">Số tuần Học kỳ 2</label>
                      <input 
                        type="number" 
                        className="input-field" 
                        value={academicSettings.semester2Weeks}
                        onChange={(e) => setAcademicSettings({...academicSettings, semester2Weeks: parseInt(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                  <Button onClick={handleSaveAcademicSettings} disabled={savingSettings} size="sm" className="mt-2" fullWidth>
                    <Save size={16} /> {savingSettings ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </Button>
                </div>
              </CardBody>
            </Card>
          </>
        )}

        <h4 className="settings-group-title mt-4">Tuỳ chọn hệ thống</h4>
        
        <div className="settings-list">
          <Card className="settings-item">
            <CardBody className="flex-between">
              <div className="flex-row gap-3">
                <Database size={20} className="text-muted" />
                <span>Trạng thái máy chủ</span>
              </div>
              <span className="text-success text-sm">Đã kết nối</span>
            </CardBody>
          </Card>
          
          <Card className="settings-item" onClick={toggleDarkMode} style={{ cursor: 'pointer' }}>
            <CardBody className="flex-between">
              <div className="flex-row gap-3">
                <Moon size={20} className="text-muted" />
                <span>Chế độ tối (Dark mode)</span>
              </div>
              <div className={`toggle-switch ${isDarkMode ? 'active' : ''}`} style={{ 
                width: '44px', height: '24px', background: isDarkMode ? 'var(--success)' : 'var(--border-color)', 
                borderRadius: '12px', position: 'relative', transition: 'background 0.3s'
              }}>
                <div className="toggle-knob" style={{ 
                  width: '20px', height: '20px', background: 'white', borderRadius: '50%', 
                  position: 'absolute', top: '2px', left: isDarkMode ? '22px' : '2px', transition: 'left 0.3s' 
                }}></div>
              </div>
            </CardBody>
          </Card>
        </div>

        <Button variant="danger" fullWidth className="mt-4" style={{ marginTop: '32px' }} onClick={handleLogout}>
          <LogOut size={18} />
          Đăng xuất
        </Button>
      </div>
    </>
  );
}
