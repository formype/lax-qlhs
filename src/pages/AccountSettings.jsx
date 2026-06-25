import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { User as UserIcon, Lock, Save, ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { updateUserAccount, getUserByUsername } from '../lib/firebase';

export function AccountSettings() {
  const { user, updateContextUser, logout } = useAuth();
  const navigate = useNavigate();
  
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) {
      alert('Không tìm thấy thông tin tài khoản hợp lệ.');
      return;
    }

    setSaving(true);
    let currentUserId = user.id;
    let currentUserData = user;

    if (!currentUserId) {
      const fetchResult = await getUserByUsername(user.username);
      if (fetchResult.success) {
        currentUserId = fetchResult.id;
        currentUserData = { ...user, ...fetchResult };
      } else {
        setSaving(false);
        alert('Phiên đăng nhập đã cũ, vui lòng đăng xuất và đăng nhập lại!');
        return;
      }
    }

    // Password validation
    if (newPassword || currentPassword) {
      if (currentPassword !== currentUserData.password) {
        setSaving(false);
        alert('Mật khẩu hiện tại không đúng!');
        return;
      }
      if (newPassword !== confirmPassword) {
        alert('Mật khẩu mới và xác nhận mật khẩu không khớp!');
        return;
      }
      if (newPassword.length < 6) {
        alert('Mật khẩu mới phải từ 6 ký tự trở lên!');
        return;
      }
    }

    if (!fullName.trim()) {
      setSaving(false);
      alert('Họ tên không được để trống!');
      return;
    }

    const updates = { fullName };
    if (newPassword) {
      updates.password = newPassword;
    }

    const result = await updateUserAccount(currentUserId, updates);
    setSaving(false);

    if (result.success) {
      if (newPassword) {
        alert('Cập nhật tài khoản thành công! Vui lòng đăng nhập lại với mật khẩu mới.');
        logout();
        navigate('/login');
      } else {
        updateContextUser({ ...updates, id: currentUserId, password: currentUserData.password });
        alert('Cập nhật tài khoản thành công!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } else {
      alert('Có lỗi xảy ra: ' + result.error);
    }
  };

  return (
    <>
      <div className="header-container" style={{ display: 'flex', alignItems: 'center', padding: '16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
        <button className="action-btn" onClick={() => navigate(-1)} style={{ marginRight: '16px' }}>
          <ChevronLeft size={24} />
        </button>
        <h2 className="section-title" style={{ margin: 0, fontSize: '1.25rem' }}>Cài đặt tài khoản</h2>
      </div>

      <div className="settings-content" style={{ padding: '20px', paddingBottom: '100px', overflowY: 'auto', height: '100%' }}>
        <Card className="mb-4">
          <CardBody>
            <div className="flex-row gap-3 mb-4">
              <UserIcon size={24} color="var(--primary-color)" />
              <h4 style={{ margin: 0 }}>Thông tin cá nhân</h4>
            </div>
            
            <div className="form-group mb-3">
              <label className="input-label">Tên đăng nhập</label>
              <input type="text" className="input-field" value={user?.username || ''} disabled style={{ backgroundColor: 'var(--bg-app)', opacity: 0.7 }} />
            </div>

            <div className="form-group mb-3">
              <label className="input-label">Vai trò</label>
              <input type="text" className="input-field" value={user?.role === 'vip-admin' ? 'VIP Admin' : user?.role === 'admin' ? 'Quản trị viên' : user?.role === 'giamthi' ? 'Giám thị' : 'Giáo viên'} disabled style={{ backgroundColor: 'var(--bg-app)', opacity: 0.7 }} />
            </div>

            <div className="form-group mb-3">
              <label className="input-label">Họ và tên</label>
              <input 
                type="text" 
                className="input-field" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nhập họ và tên..."
              />
            </div>
          </CardBody>
        </Card>

        <Card className="mb-4">
          <CardBody>
            <div className="flex-row gap-3 mb-4">
              <Lock size={24} color="var(--primary-color)" />
              <h4 style={{ margin: 0 }}>Đổi mật khẩu</h4>
            </div>

            <div className="form-group mb-3">
              <label className="input-label">Mật khẩu hiện tại</label>
              <input 
                type="password" 
                className="input-field" 
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Để trống nếu không đổi mật khẩu"
              />
            </div>

            <div className="form-group mb-3">
              <label className="input-label">Mật khẩu mới</label>
              <input 
                type="password" 
                className="input-field" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới..."
              />
            </div>

            <div className="form-group mb-3">
              <label className="input-label">Xác nhận mật khẩu mới</label>
              <input 
                type="password" 
                className="input-field" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới..."
              />
            </div>
          </CardBody>
        </Card>

        <Button fullWidth onClick={handleSave} disabled={saving} size="lg">
          <Save size={20} style={{ marginRight: '8px' }} />
          {saving ? 'Đang cập nhật...' : 'Lưu thay đổi'}
        </Button>
      </div>
    </>
  );
}
