import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { fetchUsers, addUser, updateUserAccount, deleteUser } from '../lib/firebase';
import { UserPlus, Edit2, Trash2, Shield, Lock, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AVAILABLE_PAGES = [
  { path: '/add', label: 'Ghi nhận vi phạm' },
  { path: '/search', label: 'Tra cứu vi phạm' },
  { path: '/attendance', label: 'Điểm danh' },
  { path: '/attendance-search', label: 'Tra cứu chuyên cần' },
  { path: '/classes', label: 'Quản lý Lớp học' },
  { path: '/students', label: 'Quản lý Học sinh' },
  { path: '/features', label: 'Tính năng' },
  { path: '/settings', label: 'Cài đặt chung' }
];

export function ManageAccounts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    roles: ['giamthi'],
    blockedPages: []
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.role?.includes('admin') && !user?.role?.includes('vip-admin')) {
      alert('Bạn không có quyền truy cập trang này.');
      navigate('/');
      return;
    }
    loadUsers();
  }, [user, navigate]);

  const loadUsers = async () => {
    setLoading(true);
    const data = await fetchUsers();
    setUsers(data);
    setLoading(false);
  };

  const handleOpenModal = (u = null) => {
    if (u && user?.role?.includes('admin') && (u.role?.includes('admin') || u.role?.includes('vip-admin'))) {
      alert("Bạn không có quyền chỉnh sửa tài khoản ngang hoặc cao hơn cấp của mình!");
      return;
    }
    if (u) {
      setEditingUser(u);
      setFormData({
        username: u.username,
        password: '',
        fullName: u.fullName,
        roles: Array.isArray(u.role) ? u.role : (u.role ? [u.role] : []),
        blockedPages: u.blockedPages || []
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        password: '123',
        fullName: '',
        roles: ['giamthi'],
        blockedPages: []
      });
    }
    setIsModalOpen(true);
  };

  const handleResetPassword = async (u) => {
    if (u.id === user.id) {
      alert("Bạn không thể reset mật khẩu của chính mình qua tính năng này.");
      return;
    }
    if (user?.role?.includes('admin') && !user?.role?.includes('vip-admin') && (u.role?.includes('admin') || u.role?.includes('vip-admin'))) {
      alert("Bạn không có quyền reset mật khẩu cho tài khoản quản trị ngang hoặc cao hơn cấp của mình!");
      return;
    }
    if (window.confirm(`Bạn có chắc muốn reset mật khẩu của tài khoản ${u.username} về mặc định "123" không?`)) {
      const res = await updateUserAccount(u.id, { password: '123' });
      if (res.success) {
        alert(`Đã reset mật khẩu của tài khoản ${u.username} thành công. Mật khẩu mới là: 123`);
      } else {
        alert("Reset mật khẩu thất bại: " + res.error);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleToggleBlockPage = (path) => {
    setFormData(prev => {
      const isBlocked = prev.blockedPages.includes(path);
      if (isBlocked) {
        return { ...prev, blockedPages: prev.blockedPages.filter(p => p !== path) };
      } else {
        return { ...prev, blockedPages: [...prev.blockedPages, path] };
      }
    });
  };

  const handleSave = async () => {
    if (!formData.username || !formData.fullName) {
      alert("Vui lòng nhập đầy đủ Tên đăng nhập và Họ tên.");
      return;
    }

    setSaving(true);
    if (editingUser) {
      const updates = {
        fullName: formData.fullName,
        role: formData.roles,
        blockedPages: formData.blockedPages
      };
      if (formData.password) {
        updates.password = formData.password;
      }
      const res = await updateUserAccount(editingUser.id, updates);
      if (res.success) {
        alert("Cập nhật tài khoản thành công!");
        handleCloseModal();
        loadUsers();
      } else {
        alert("Có lỗi xảy ra: " + res.error);
      }
    } else {
      if (!formData.password) {
        alert("Vui lòng nhập mật khẩu cho tài khoản mới.");
        setSaving(false);
        return;
      }
      const res = await addUser(formData);
      if (res.success) {
        alert("Thêm tài khoản thành công!");
        handleCloseModal();
        loadUsers();
      } else {
        alert("Thêm thất bại: " + res.error);
      }
    }
    setSaving(false);
  };

  const handleDelete = async (u) => {
    if (u.id === user.id) {
      alert("Bạn không thể xóa chính mình!");
      return;
    }
    if (user?.role?.includes('admin') && !user?.role?.includes('vip-admin') && (u.role?.includes('admin') || u.role?.includes('vip-admin'))) {
      alert("Bạn không có quyền xóa tài khoản ngang hoặc cao hơn cấp của mình!");
      return;
    }
    if (window.confirm(`Bạn có chắc muốn xóa tài khoản ${u.username} không?`)) {
      const res = await deleteUser(u.id);
      if (res.success) {
        alert("Đã xóa tài khoản.");
        loadUsers();
      } else {
        alert("Xóa thất bại: " + res.error);
      }
    }
  };

  return (
    <>
      <Header title="Quản lý Tài khoản" />
      <div className="page-wrapper" style={{ padding: '16px', paddingBottom: '100px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <Button onClick={() => handleOpenModal()} size="sm">
            <UserPlus size={16} className="mr-1" /> Thêm tài khoản
          </Button>
        </div>

        {loading ? (
          <p className="text-center text-muted mt-4">Đang tải dữ liệu...</p>
        ) : (
          <div className="account-list-container" style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {users.map((u) => (
              <Card key={u.id} className="account-card" style={{ transition: 'all 0.2s ease', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}>
                <CardBody style={{ padding: '20px' }}>
                  <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div className="flex-row gap-3">
                      <div className="avatar-circle" style={{ background: 'var(--primary-light)', color: 'var(--primary-color)', fontSize: '1.25rem', fontWeight: 'bold' }}>
                        {u.fullName ? u.fullName.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="flex-col">
                        <span className="font-bold text-dark" style={{ fontSize: '1.1rem' }}>{u.fullName}</span>
                        <span className="text-muted text-sm mt-1">@{u.username}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-row gap-1 flex-wrap mb-4">
                    {Array.isArray(u.role) ? u.role.map(r => (
                      <span key={r} className={`badge ${r === 'admin' || r === 'vip-admin' ? 'badge-danger' : (r === 'giamthi' ? 'badge-primary' : 'badge-success')}`} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                        {r === 'vip-admin' ? 'VIP Admin' : r === 'admin' ? 'Quản trị viên' : r === 'giamthi' ? 'Giám thị' : 'Giáo viên'}
                      </span>
                    )) : (
                      <span className="badge badge-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Khách</span>
                    )}
                  </div>

                  <div className="flex-row gap-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', justifyContent: 'flex-end' }}>
                    {!(user?.role?.includes('admin') && !user?.role?.includes('vip-admin') && (u.role?.includes('admin') || u.role?.includes('vip-admin'))) && (
                      <button className="action-btn edit-btn" onClick={() => handleOpenModal(u)} title="Sửa thông tin" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-app)' }}>
                        <Edit2 size={18} />
                      </button>
                    )}
                    {!(user?.role?.includes('admin') && !user?.role?.includes('vip-admin') && (u.role?.includes('admin') || u.role?.includes('vip-admin'))) && u.id !== user?.id && (
                      <button className="action-btn" onClick={() => handleResetPassword(u)} title="Khôi phục mật khẩu mặc định (123)" style={{ color: '#eab308', padding: '8px', borderRadius: '8px', background: 'var(--bg-app)' }}>
                        <RefreshCw size={18} />
                      </button>
                    )}
                    {u.id !== user?.id && !(user?.role?.includes('admin') && !user?.role?.includes('vip-admin') && (u.role?.includes('admin') || u.role?.includes('vip-admin'))) && (
                      <button className="action-btn delete-btn" onClick={() => handleDelete(u)} title="Xóa tài khoản" style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-app)' }}>
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
            {users.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border-color)' }}>
                <Users size={48} className="text-muted" style={{ margin: '0 auto', marginBottom: '16px', opacity: 0.5 }} />
                <p className="text-muted text-lg">Chưa có tài khoản nào được tạo.</p>
                <Button variant="primary" className="mt-4" onClick={() => handleOpenModal()}>Tạo tài khoản đầu tiên</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>{editingUser ? 'Sửa thông tin tài khoản' : 'Thêm tài khoản mới'}</h3>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="form-group mb-3">
                <label className="input-label">Tên đăng nhập</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  disabled={!!editingUser}
                  placeholder="Ví dụ: gv_nguyenvana"
                />
              </div>

              <div className="form-group mb-3">
                <label className="input-label">Họ và tên</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={formData.fullName}
                  onChange={e => setFormData({...formData, fullName: e.target.value})}
                  placeholder="Nhập họ và tên..."
                />
              </div>

              {editingUser ? (
                <div className="form-group mb-3">
                  <label className="input-label">Mật khẩu mới (Để trống nếu không đổi)</label>
                  <input 
                    type="password" 
                    className="input-field" 
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="Nhập mật khẩu mới..."
                  />
                </div>
              ) : (
                <div className="form-group mb-3">
                  <label className="input-label">Mật khẩu</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value="123 (Mặc định)"
                    disabled
                  />
                  <p className="text-xs text-muted mt-1">Mật khẩu mặc định cho tài khoản mới là 123.</p>
                </div>
              )}

              <div className="form-group mb-4">
                <label className="input-label">Vai trò</label>
                <div className="flex-col gap-2">
                  <label className="flex-row gap-2 cursor-pointer" style={{ alignItems: 'center' }}>
                    <input 
                      type="checkbox"
                      checked={formData.roles.includes('giaovien')}
                      onChange={(e) => {
                        let newRoles = [...formData.roles].filter(r => r !== 'admin' && r !== 'vip-admin');
                        if (e.target.checked) newRoles.push('giaovien');
                        else newRoles = newRoles.filter(r => r !== 'giaovien');
                        if (newRoles.length === 0) newRoles = ['giamthi'];
                        setFormData({...formData, roles: newRoles});
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span>Giáo viên</span>
                  </label>
                  <label className="flex-row gap-2 cursor-pointer" style={{ alignItems: 'center' }}>
                    <input 
                      type="checkbox"
                      checked={formData.roles.includes('giamthi')}
                      onChange={(e) => {
                        let newRoles = [...formData.roles].filter(r => r !== 'admin' && r !== 'vip-admin');
                        if (e.target.checked) newRoles.push('giamthi');
                        else newRoles = newRoles.filter(r => r !== 'giamthi');
                        if (newRoles.length === 0) newRoles = ['giaovien'];
                        setFormData({...formData, roles: newRoles});
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span>Giám thị</span>
                  </label>
                  <label className="flex-row gap-2 cursor-pointer" style={{ alignItems: 'center' }}>
                    <input 
                      type="checkbox"
                      checked={formData.roles.includes('admin')}
                      onChange={(e) => {
                        if (e.target.checked) setFormData({...formData, roles: ['admin']});
                        else setFormData({...formData, roles: ['giaovien']});
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ color: 'var(--danger)' }}>Quản trị viên (Admin)</span>
                  </label>
                  {user?.role?.includes('vip-admin') && (
                    <label className="flex-row gap-2 cursor-pointer" style={{ alignItems: 'center' }}>
                      <input 
                        type="checkbox"
                        checked={formData.roles.includes('vip-admin')}
                        onChange={(e) => {
                          if (e.target.checked) setFormData({...formData, roles: ['vip-admin']});
                          else setFormData({...formData, roles: ['admin']});
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>VIP Admin</span>
                    </label>
                  )}
                </div>
              </div>

              {!formData.roles.includes('admin') && !formData.roles.includes('vip-admin') && (
                <div className="form-group mb-2">
                  <label className="input-label flex-row gap-2" style={{ color: 'var(--danger)' }}>
                    <Shield size={16} /> Phân quyền (Chặn truy cập trang)
                  </label>
                  <p className="text-xs text-muted mb-2">Đánh dấu vào các trang mà bạn KHÔNG MUỐN người này truy cập.</p>
                  <div className="flex-col gap-2" style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    {AVAILABLE_PAGES.map(page => (
                      <label key={page.path} className="flex-row gap-2 cursor-pointer" style={{ fontSize: '0.875rem' }}>
                        <input 
                          type="checkbox" 
                          checked={formData.blockedPages.includes(page.path)}
                          onChange={() => handleToggleBlockPage(page.path)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        {formData.blockedPages.includes(page.path) ? (
                          <span style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>{page.label} (Đã bị chặn)</span>
                        ) : (
                          <span>{page.label}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={handleCloseModal}>Hủy</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu lại'}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
