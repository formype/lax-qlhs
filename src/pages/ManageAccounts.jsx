import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { fetchUsers, addUser, updateUserAccount, deleteUser } from '../lib/firebase';
import { UserPlus, Edit2, Trash2, Shield, Lock } from 'lucide-react';
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
    role: 'giamthi',
    blockedPages: []
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'vip-admin') {
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
    if (u && user?.role === 'admin' && (u.role === 'admin' || u.role === 'vip-admin')) {
      alert("Bạn không có quyền chỉnh sửa tài khoản ngang hoặc cao hơn cấp của mình!");
      return;
    }
    if (u) {
      setEditingUser(u);
      setFormData({
        username: u.username,
        password: '',
        fullName: u.fullName,
        role: u.role,
        blockedPages: u.blockedPages || []
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        password: '',
        fullName: '',
        role: 'giamthi',
        blockedPages: []
      });
    }
    setIsModalOpen(true);
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
        role: formData.role,
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
    if (user?.role === 'admin' && (u.role === 'admin' || u.role === 'vip-admin')) {
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
      <div className="main-content" style={{ padding: '16px', paddingBottom: '100px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <Button onClick={() => handleOpenModal()} size="sm">
            <UserPlus size={16} className="mr-1" /> Thêm tài khoản
          </Button>
        </div>

        {loading ? (
          <p className="text-center text-muted mt-4">Đang tải dữ liệu...</p>
        ) : (
          <div className="table-responsive">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Tên đăng nhập</th>
                  <th>Họ và tên</th>
                  <th>Vai trò</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-dark">{u.username}</td>
                    <td>{u.fullName}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' || u.role === 'vip-admin' ? 'badge-danger' : (u.role === 'giamthi' ? 'badge-primary' : 'badge-success')}`}>
                        {u.role === 'vip-admin' ? 'VIP Admin' : u.role === 'admin' ? 'Quản trị viên' : u.role === 'giamthi' ? 'Giám thị' : 'Giáo viên'}
                      </span>
                    </td>
                    <td>
                      <div className="flex-row gap-2 justify-center">
                        {!(user?.role === 'admin' && (u.role === 'admin' || u.role === 'vip-admin')) && (
                          <button className="action-btn edit-btn" onClick={() => handleOpenModal(u)}>
                            <Edit2 size={16} />
                          </button>
                        )}
                        {u.id !== user?.id && !(user?.role === 'admin' && (u.role === 'admin' || u.role === 'vip-admin')) && (
                          <button className="action-btn delete-btn" onClick={() => handleDelete(u)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">Chưa có tài khoản nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
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

              <div className="form-group mb-3">
                <label className="input-label">Mật khẩu {editingUser ? '(Để trống nếu không đổi)' : ''}</label>
                <input 
                  type="password" 
                  className="input-field" 
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  placeholder={editingUser ? "Nhập mật khẩu mới..." : "Nhập mật khẩu..."}
                />
              </div>

              <div className="form-group mb-4">
                <label className="input-label">Vai trò</label>
                <select 
                  className="input-field"
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                >
                  <option value="giaovien">Giáo viên</option>
                  <option value="giamthi">Giám thị</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                  {user?.role === 'vip-admin' && (
                    <option value="vip-admin">VIP Admin</option>
                  )}
                </select>
              </div>

              {formData.role !== 'admin' && formData.role !== 'vip-admin' && (
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
