import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { fetchClasses, addClass, deleteClass, fetchUsers } from '../lib/firebase';
import { Trash2, Plus, Users } from 'lucide-react';
import './ManageClasses.css';

export function ManageClasses() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newTeacherId, setNewTeacherId] = useState('');
  const [error, setError] = useState('');

  const loadClasses = async () => {
    setLoading(true);
    const [data, users] = await Promise.all([fetchClasses(), fetchUsers()]);
    setClasses(data);
    const gvs = users.filter(u => u.role === 'giaovien');
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
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                    <Trash2 size={16} color="var(--danger)" />
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
