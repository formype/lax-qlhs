import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { fetchTeachers, deleteTeacher, updateTeacher } from '../lib/firebase';
import { UserCircle, Users, Edit, Trash2, X, Eye, GraduationCap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import './StudentList.css'; // Reusing student list styles

const DEPARTMENTS = {
  'Tổ Toán': ['Toán'],
  'Tổ Văn': ['Văn'],
  'Tổ Tự nhiên': ['KHTN'],
  'Tổ Xã hội': ['Sử - Địa', 'GDCD'],
  'Tổ VTM': ['Mỹ thuật', 'Nhạc', 'Thể dục'],
  'Tổ Tin học - Công nghệ': ['Tin học', 'Công nghệ'],
  'Tổ Tiếng anh': ['Tiếng Anh']
};

export function TeacherList() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [filterType, setFilterType] = useState('Toàn trường'); // Toàn trường, Theo tổ chuyên môn, Theo bộ môn
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterSubject, setFilterSubject] = useState('');

  // Edit Modal State
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editForm, setEditForm] = useState({
    magv: '', hoten: '', tochuyenmon: '', bomon: ''
  });

  const { user } = useAuth();
  const isAdmin = user?.role?.includes('admin') || user?.role?.includes('vip-admin');
  const isGiamthi = user?.role?.includes('giamthi');
  const canEdit = isAdmin || isGiamthi;

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await fetchTeachers();
      setTeachers(data.sort((a, b) => (a.magv || '').localeCompare(b.magv || '')));
      setLoading(false);
    };
    loadData();
  }, []);

  const allSubjects = useMemo(() => {
    const subjects = new Set();
    Object.values(DEPARTMENTS).forEach(arr => arr.forEach(s => subjects.add(s)));
    return Array.from(subjects).sort();
  }, []);

  const filteredTeachers = useMemo(() => {
    let result = [...teachers];
    if (filterType === 'Theo tổ chuyên môn' && filterDepartment) {
      result = result.filter(t => t.tochuyenmon === filterDepartment);
    } else if (filterType === 'Theo bộ môn' && filterSubject) {
      result = result.filter(t => t.bomon === filterSubject);
    }
    return result;
  }, [teachers, filterType, filterDepartment, filterSubject]);

  const handleDelete = async (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa giáo viên này?")) {
      const res = await deleteTeacher(id);
      if (res.success) {
        setTeachers(teachers.filter(t => t.id !== id));
      } else {
        alert("Lỗi khi xóa giáo viên.");
      }
    }
  };

  const openEditModal = (teacher) => {
    setEditingTeacher(teacher);
    setEditForm({
      magv: teacher.magv || '',
      hoten: teacher.hoten || '',
      tochuyenmon: teacher.tochuyenmon || '',
      bomon: teacher.bomon || ''
    });
  };

  const handleEditDepartmentChange = (e) => {
    const selectedDept = e.target.value;
    setEditForm(prev => {
      const newForm = { ...prev, tochuyenmon: selectedDept };
      if (selectedDept && DEPARTMENTS[selectedDept]?.length === 1) {
        newForm.bomon = DEPARTMENTS[selectedDept][0];
      } else {
        newForm.bomon = '';
      }
      return newForm;
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.magv.trim() || !editForm.hoten.trim() || !editForm.tochuyenmon || !editForm.bomon) {
      alert("Vui lòng nhập đầy đủ thông tin bắt buộc!");
      return;
    }

    const updates = {
      magv: editForm.magv.trim().toUpperCase(),
      hoten: editForm.hoten.trim(),
      tochuyenmon: editForm.tochuyenmon,
      bomon: editForm.bomon
    };

    const res = await updateTeacher(editingTeacher.id, updates);
    if (res.success) {
      setTeachers(teachers.map(t => t.id === editingTeacher.id ? { ...t, ...updates } : t));
      setEditingTeacher(null);
    } else {
      alert("Lỗi khi cập nhật thông tin.");
    }
  };

  return (
    <>
      <Header title="Danh sách giáo viên" />
      <div className="student-list-container">
        <div className="student-list-header mb-4">
          <div className="flex-row items-center gap-2">
            <GraduationCap size={28} className="text-primary" />
            <h2>Quản Lý Danh Sách Giáo Viên</h2>
          </div>
          <div className="student-list-stats">
            <span className="stat-badge">
              <Users size={16} />
              Tổng số: {filteredTeachers.length}
            </span>
          </div>
        </div>

        <Card className="filter-card mb-4" style={{ padding: '4px' }}>
          <CardBody>
            <div className="filter-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Tùy chọn lọc</label>
                <Select
                  value={filterType}
                  onChange={(e) => {
                    setFilterType(e.target.value);
                    setFilterDepartment('');
                    setFilterSubject('');
                  }}
                  options={[
                    { value: 'Toàn trường', label: 'Toàn trường' },
                    { value: 'Theo tổ chuyên môn', label: 'Theo tổ chuyên môn' },
                    { value: 'Theo bộ môn', label: 'Theo bộ môn' }
                  ]}
                />
              </div>
              
              {filterType === 'Theo tổ chuyên môn' && (
                <div className="filter-group">
                  <label className="text-sm font-semibold mb-1 block">Tổ chuyên môn</label>
                  <Select
                    value={filterDepartment}
                    onChange={(e) => setFilterDepartment(e.target.value)}
                    options={[
                      { value: '', label: '-- Chọn tổ chuyên môn --' },
                      ...Object.keys(DEPARTMENTS).map(d => ({ value: d, label: d }))
                    ]}
                  />
                </div>
              )}

              {filterType === 'Theo bộ môn' && (
                <div className="filter-group">
                  <label className="text-sm font-semibold mb-1 block">Bộ môn giảng dạy</label>
                  <Select
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    options={[
                      { value: '', label: '-- Chọn bộ môn --' },
                      ...allSubjects.map(s => ({ value: s, label: s }))
                    ]}
                  />
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {loading ? (
          <p className="text-muted text-center mt-4">Đang tải...</p>
        ) : filteredTeachers.length === 0 ? (
          <p className="text-muted text-center mt-4">Không có giáo viên.</p>
        ) : (
          <div className="student-list-items">
            {filteredTeachers.map((t, idx) => (
              <Card key={t.id} className="student-list-row">
                <CardBody className="flex-row gap-3">
                  <div className="student-list-idx">{idx + 1}</div>
                  <div className="avatar-circle small">
                    <UserCircle size={20} color="var(--primary-color)" />
                  </div>
                  <div className="flex-1">
                    <div className="student-list-name">
                      {t.hoten}
                      <span className="class-badge" style={{ backgroundColor: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>{t.bomon}</span>
                    </div>
                    <div className="text-muted text-xs">{t.magv} - {t.tochuyenmon}</div>
                  </div>
                  <div className="student-actions">
                    <button className="action-btn edit-btn" onClick={() => openEditModal(t)}>
                      {canEdit ? <Edit size={16} /> : <Eye size={16} />}
                    </button>
                    {isAdmin && (
                      <button className="action-btn delete-btn" onClick={() => handleDelete(t.id)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {editingTeacher && (
        <div className="modal-overlay" onClick={() => setEditingTeacher(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{canEdit ? 'Sửa Thông Tin Giáo Viên' : 'Chi Tiết Thông Tin Giáo Viên'}</h3>
              <button className="close-btn" onClick={() => setEditingTeacher(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="modal-body">
              <div className="form-grid-2">
                <Input 
                  label="MÃ GIÁO VIÊN *" 
                  value={editForm.magv} 
                  onChange={e => setEditForm({...editForm, magv: e.target.value})} 
                  disabled={!canEdit}
                />
                <Input 
                  label="HỌ VÀ TÊN *" 
                  value={editForm.hoten} 
                  onChange={e => setEditForm({...editForm, hoten: e.target.value})} 
                  disabled={!canEdit}
                />
                <Select
                  label="TỔ CHUYÊN MÔN *"
                  value={editForm.tochuyenmon}
                  onChange={handleEditDepartmentChange}
                  options={[
                    { value: '', label: '-- Chọn tổ chuyên môn --' },
                    ...Object.keys(DEPARTMENTS).map(d => ({ value: d, label: d }))
                  ]}
                  disabled={!canEdit}
                />
                <Select
                  label="BỘ MÔN GIẢNG DẠY *"
                  value={editForm.bomon}
                  onChange={e => setEditForm({...editForm, bomon: e.target.value})}
                  options={[
                    { value: '', label: editForm.tochuyenmon ? '-- Chọn bộ môn --' : '-- Chọn tổ chuyên môn trước --' },
                    ...(editForm.tochuyenmon && DEPARTMENTS[editForm.tochuyenmon] ? DEPARTMENTS[editForm.tochuyenmon].map(b => ({ value: b, label: b })) : [])
                  ]}
                  disabled={!canEdit}
                />
              </div>
              <div className="modal-footer mt-4">
                <Button variant="outline" type="button" onClick={() => setEditingTeacher(null)}>{canEdit ? 'Hủy' : 'Đóng'}</Button>
                {canEdit && <Button type="submit">Lưu Thay Đổi</Button>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
