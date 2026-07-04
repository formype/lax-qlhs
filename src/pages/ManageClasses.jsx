import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { fetchClasses, addClass, deleteClass, fetchUsers, updateClass } from '../lib/firebase';
import { Trash2, Plus, Users, Edit2 } from 'lucide-react';
import './ManageClasses.css';

export function ManageClasses() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newTeacherId, setNewTeacherId] = useState('');
  const [error, setError] = useState('');

  const [editingClass, setEditingClass] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ tenlop: '', khoi: '', homeroomTeacherId: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadClasses = async () => {
    setLoading(true);
    const [data, users] = await Promise.all([fetchClasses(), fetchUsers()]);
    setClasses(data);
    const gvs = users.filter(u => u.role?.includes('giaovien'));
    setTeachers(gvs);
    setLoading(false);
  };

  useEffect(() => {
    loadClasses();
  }, []);

  const availableTeachers = teachers.filter(t => !classes.some(c => c.homeroomTeacherId === t.id));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newClassName || !newGrade || !newTeacherId) {
      setError('Vui lòng nhập tên lớp, khối và chọn giáo viên chủ nhiệm');
      return;
    }
    setError('');
    const teacher = teachers.find(t => t.id === newTeacherId);
    const res = await addClass({ 
      tenlop: newClassName, 
      khoi: newGrade,
      homeroomTeacherId: teacher.id,
      homeroomTeacherName: teacher.fullName || teacher.username
    });
    if (res.success) {
      setNewClassName('');
      setNewGrade('');
      setNewTeacherId('');
      loadClasses();
    } else {
      setError('Lỗi khi thêm lớp');
    }
  };

  const handleDelete = async (id) => {
    if(window.confirm('Bạn có chắc muốn xoá lớp này?')) {
      await deleteClass(id);
      loadClasses();
    }
  };

  const handleOpenEdit = (c) => {
    setEditingClass(c);
    setEditFormData({
      tenlop: c.tenlop || '',
      khoi: c.khoi || '',
      homeroomTeacherId: c.homeroomTeacherId || ''
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setEditingClass(null);
  };

  const handleSaveEdit = async () => {
    if (!editFormData.tenlop || !editFormData.khoi) {
      setEditError('Vui lòng nhập tên lớp và khối');
      return;
    }
    setEditSaving(true);
    
    const teacher = teachers.find(t => t.id === editFormData.homeroomTeacherId);
    
    const updates = {
      tenlop: editFormData.tenlop,
      khoi: editFormData.khoi,
      homeroomTeacherId: teacher ? teacher.id : null,
      homeroomTeacherName: teacher ? (teacher.fullName || teacher.username) : null
    };

    const res = await updateClass(editingClass.id, updates);
    if (res.success) {
      handleCloseEdit();
      loadClasses();
    } else {
      setEditError('Lỗi khi cập nhật lớp');
    }
    setEditSaving(false);
  };

  const availableTeachersForEdit = teachers.filter(t => 
    !classes.some(c => c.homeroomTeacherId === t.id && c.id !== editingClass?.id)
  );

  return (
    <>
      <Header title="Quản lý Lớp học" />
      <div className="manage-classes-content">
        <Card className="mb-4">
          <CardBody>
            <h3 className="section-title text-sm mb-3">Thêm Lớp Mới</h3>
            <form onSubmit={handleAdd} className="flex-col gap-3">
              {error && <p className="text-danger text-sm">{error}</p>}
              <div className="flex-row gap-2">
                <Select
                  value={newGrade}
                  onChange={(e) => setNewGrade(e.target.value)}
                  options={[
                    { value: '', label: '-- Chọn khối --' },
                    { value: 'Khối 6', label: 'Khối 6' },
                    { value: 'Khối 7', label: 'Khối 7' },
                    { value: 'Khối 8', label: 'Khối 8' },
                    { value: 'Khối 9', label: 'Khối 9' },
                  ]}
                  className="flex-1"
                  label="Chọn Khối"
                />
                <Input 
                  label="Tên lớp"
                  placeholder="VD: 6/1" 
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="flex-2"
                />
              </div>
              <div className="flex-row gap-2">
                <Select
                  value={newTeacherId}
                  onChange={(e) => setNewTeacherId(e.target.value)}
                  options={[
                    { value: '', label: '-- Chọn giáo viên --' },
                    ...availableTeachers.map(t => ({ value: t.id, label: t.fullName || t.username }))
                  ]}
                  className="flex-1"
                  label="Giáo viên chủ nhiệm"
                />
              </div>
              <Button type="submit"><Plus size={18} /> Thêm Lớp</Button>
            </form>
          </CardBody>
        </Card>

        <h3 className="section-title">Danh sách Lớp học ({classes.length})</h3>
        {loading ? (
          <p className="text-center text-muted">Đang tải...</p>
        ) : (
          <div className="class-list">
            {classes.map(c => (
              <Card key={c.id} className="mb-2">
                <CardBody className="flex-between">
                  <div className="flex-row gap-3">
                    <div className="avatar-circle small">
                      <Users size={16} color="var(--primary-color)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: '600' }}>Lớp {c.tenlop}</div>
                      <div className="text-muted text-sm">{c.khoi} {c.homeroomTeacherName ? `- GVCN: ${c.homeroomTeacherName}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex-row gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(c)}>
                      <Edit2 size={16} color="var(--primary-color)" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                      <Trash2 size={16} color="var(--danger)" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {isEditModalOpen && (
        <div className="modal-overlay" onClick={handleCloseEdit}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Chỉnh sửa Lớp học</h3>
            </div>
            <div className="modal-body">
              {editError && <p className="text-danger text-sm mb-3">{editError}</p>}
              
              <div className="form-group mb-3">
                <Select
                  value={editFormData.khoi}
                  onChange={(e) => setEditFormData({...editFormData, khoi: e.target.value})}
                  options={[
                    { value: '', label: '-- Chọn khối --' },
                    { value: 'Khối 6', label: 'Khối 6' },
                    { value: 'Khối 7', label: 'Khối 7' },
                    { value: 'Khối 8', label: 'Khối 8' },
                    { value: 'Khối 9', label: 'Khối 9' },
                  ]}
                  label="Chọn Khối"
                />
              </div>

              <div className="form-group mb-3">
                <Input 
                  label="Tên lớp"
                  placeholder="VD: 6/1" 
                  value={editFormData.tenlop}
                  onChange={(e) => setEditFormData({...editFormData, tenlop: e.target.value})}
                />
              </div>

              <div className="form-group mb-4">
                <Select
                  value={editFormData.homeroomTeacherId || ''}
                  onChange={(e) => setEditFormData({...editFormData, homeroomTeacherId: e.target.value})}
                  options={[
                    { value: '', label: '-- Không có --' },
                    ...availableTeachersForEdit.map(t => ({ value: t.id, label: t.fullName || t.username }))
                  ]}
                  label="Giáo viên chủ nhiệm"
                />
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={handleCloseEdit}>Hủy</Button>
              <Button onClick={handleSaveEdit} disabled={editSaving}>{editSaving ? 'Đang lưu...' : 'Lưu lại'}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
