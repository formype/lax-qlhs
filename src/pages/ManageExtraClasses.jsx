import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { 
  fetchExtraClasses, 
  addExtraClass, 
  updateExtraClass, 
  deleteExtraClass 
} from '../lib/firebase';
import { Plus, Trash2, Edit2, Sparkles, Search, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import './ManageExtraClasses.css';

export function ManageExtraClasses() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal edit state
  const [editingClass, setEditingClass] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const isAdmin = user?.role?.includes('admin') || user?.role?.includes('vip-admin');

  const loadData = async () => {
    setLoading(true);
    const data = await fetchExtraClasses();
    setClasses(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) {
      setError('Vui lòng nhập tên lớp ngoại khóa.');
      return;
    }
    setError('');
    setSuccess('');
    setSubmitting(true);

    const res = await addExtraClass({
      tenlopngoaikhoa: newClassName.trim(),
      createdBy: user?.fullName || user?.username || 'Admin'
    });

    setSubmitting(false);

    if (res.success) {
      setNewClassName('');
      setSuccess('Đã thêm lớp ngoại khóa thành công!');
      loadData();
      setTimeout(() => setSuccess(''), 3500);
    } else {
      setError(res.error || 'Có lỗi xảy ra khi thêm lớp ngoại khóa.');
    }
  };

  const handleDelete = async (cls) => {
    const name = cls.tenlopngoaikhoa || cls.name;
    if (window.confirm(`Bạn có chắc chắn muốn xoá lớp ngoại khóa "${name}"?`)) {
      const res = await deleteExtraClass(cls.id);
      if (res.success) {
        loadData();
      } else {
        alert(res.error || 'Có lỗi xảy ra khi xoá lớp.');
      }
    }
  };

  const handleOpenEdit = (cls) => {
    setEditingClass(cls);
    setEditClassName(cls.tenlopngoaikhoa || cls.name || '');
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setEditingClass(null);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editClassName.trim()) {
      setEditError('Vui lòng nhập tên lớp ngoại khóa.');
      return;
    }
    setEditSaving(true);
    setEditError('');

    const res = await updateExtraClass(editingClass.id, editClassName.trim());
    setEditSaving(false);

    if (res.success) {
      handleCloseEdit();
      loadData();
    } else {
      setEditError(res.error || 'Lỗi khi cập nhật lớp ngoại khóa.');
    }
  };

  const filteredClasses = classes.filter(c => {
    const name = (c.tenlopngoaikhoa || c.name || '').toLowerCase();
    return name.includes(searchQuery.toLowerCase().trim());
  });

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      if (ts.toDate) {
        return format(ts.toDate(), 'dd/MM/yyyy HH:mm');
      }
      if (typeof ts === 'number') {
        return format(new Date(ts), 'dd/MM/yyyy HH:mm');
      }
    } catch {
      return '';
    }
    return '';
  };

  if (!isAdmin) {
    return (
      <>
        <Header title="Nhập thông tin lớp ngoại khóa" />
        <div className="manage-extra-classes-content">
          <div className="p-4 text-center text-danger">
            Bạn không có quyền truy cập vào chức năng này!
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Nhập thông tin lớp ngoại khóa" />
      <div className="manage-extra-classes-content">
        {/* Form thêm lớp mới */}
        <Card className="mb-3">
          <CardBody>
            <div className="flex-row items-center gap-2 mb-3">
              <div className="extra-class-badge-icon">
                <Sparkles size={18} color="#8b5cf6" />
              </div>
              <h3 className="section-title text-base font-bold m-0" style={{ color: 'var(--text-color)' }}>
                Tạo lớp ngoại khóa mới
              </h3>
            </div>

            <form onSubmit={handleAdd} className="flex-col gap-3">
              {error && (
                <div className="extra-alert error-alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="extra-alert success-alert">
                  <CheckCircle size={16} />
                  <span>{success}</span>
                </div>
              )}

              <div className="input-group full-width">
                <label className="input-label required-label font-semibold">Tên lớp ngoại khóa</label>
                <Input
                  type="text"
                  placeholder="VD: Bóng rổ, Bóng đá, Võ thuật, Cầu lông, STEM, Tiếng Anh..."
                  value={newClassName}
                  onChange={(e) => {
                    setNewClassName(e.target.value);
                    if (error) setError('');
                  }}
                  required
                />
              </div>

              <Button
                type="submit"
                fullWidth
                disabled={submitting || !newClassName.trim()}
                className="submit-extra-btn"
              >
                <Plus size={18} style={{ marginRight: '6px' }} />
                {submitting ? 'Đang tạo lớp...' : 'Thêm lớp ngoại khóa'}
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Danh sách lớp ngoại khóa */}
        <Card>
          <CardBody>
            <div className="list-header-row mb-3">
              <div className="flex-row items-center gap-2">
                <h3 className="section-title text-base font-bold m-0" style={{ color: 'var(--text-color)' }}>
                  Danh sách lớp ngoại khóa
                </h3>
                <span className="count-badge">{classes.length}</span>
              </div>
            </div>

            {classes.length > 5 && (
              <div className="search-bar-wrapper mb-3">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="search-extra-input"
                  placeholder="Tìm kiếm lớp ngoại khóa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {loading ? (
              <div className="loading-state py-4 text-center text-muted">
                Đang tải danh sách lớp ngoại khóa...
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="empty-state py-4 text-center">
                <div className="empty-icon-circle mb-2">
                  <Sparkles size={28} color="#94a3b8" />
                </div>
                <p className="text-muted text-sm m-0">
                  {searchQuery ? 'Không tìm thấy lớp ngoại khóa phù hợp' : 'Chưa có lớp ngoại khóa nào được tạo'}
                </p>
              </div>
            ) : (
              <div className="extra-classes-grid">
                {filteredClasses.map((c) => {
                  const name = c.tenlopngoaikhoa || c.name;
                  const timeStr = formatTimestamp(c.createdAt);
                  return (
                    <div key={c.id} className="extra-class-item-card">
                      <div className="extra-class-info">
                        <div className="extra-class-icon-thumb">
                          <Sparkles size={18} color="#8b5cf6" />
                        </div>
                        <div className="extra-class-details">
                          <h4 className="extra-class-name">{name}</h4>
                          {timeStr && <span className="extra-class-time text-xs text-muted">Tạo lúc: {timeStr}</span>}
                        </div>
                      </div>
                      <div className="extra-class-actions">
                        <button
                          type="button"
                          className="action-btn edit-btn"
                          title="Chỉnh sửa tên lớp"
                          onClick={() => handleOpenEdit(c)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="action-btn delete-btn"
                          title="Xóa lớp"
                          onClick={() => handleDelete(c)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Modal Chỉnh Sửa */}
      {isEditModalOpen && (
        <div className="modal-overlay" onClick={handleCloseEdit}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header flex-row items-center justify-between pb-3 border-b">
              <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-color)' }}>Chỉnh sửa Lớp ngoại khóa</h3>
              <button type="button" className="close-modal-btn" onClick={handleCloseEdit}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body py-4">
              {editError && (
                <div className="extra-alert error-alert mb-3">
                  <AlertCircle size={16} />
                  <span>{editError}</span>
                </div>
              )}
              <div className="input-group full-width">
                <label className="input-label required-label font-semibold">Tên lớp ngoại khóa</label>
                <Input
                  type="text"
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  placeholder="Nhập tên mới của lớp ngoại khóa..."
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer flex-row justify-end gap-2 pt-3 border-t">
              <Button variant="secondary" onClick={handleCloseEdit} disabled={editSaving}>
                Hủy
              </Button>
              <Button onClick={handleSaveEdit} disabled={editSaving || !editClassName.trim()}>
                {editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
