import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { fetchStudents, fetchClasses, deleteStudent, updateStudent } from '../lib/firebase';
import { UserCircle, Users, Edit, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { DayPicker } from '../components/ui/DatePicker';
import './StudentList.css';

export function StudentList() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [filterGrade, setFilterGrade] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Edit Modal State
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({
    mahs: '', hoten: '', ngaysinh: '', gioitinh: '', khoi: '', tenlop: '', diachi: '', lienhe: ''
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [stData, clData] = await Promise.all([
        fetchStudents(), // Fetch all to allow smooth local filtering
        fetchClasses()
      ]);
      setStudents(stData);
      setClasses(clData);
      setLoading(false);
    };
    loadData();
  }, []);

  // Extract unique grades
  const gradeOptions = useMemo(() => {
    const grades = [...new Set(classes.map(c => c.khoi).filter(Boolean))];
    return [
      { value: '', label: 'Tất cả khối' },
      ...grades.sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, ''))).map(g => ({ value: g, label: String(g).includes('Khối') ? g : `Khối ${g}` }))
    ];
  }, [classes]);

  // Filter classes based on selected grade
  const classOptions = useMemo(() => {
    let filteredClasses = classes;
    if (filterGrade) {
      filteredClasses = classes.filter(c => c.khoi === filterGrade);
    }
    return [
      { value: '', label: 'Tất cả lớp' },
      ...filteredClasses.map(c => ({ value: c.tenlop, label: c.tenlop }))
    ];
  }, [classes, filterGrade]);

  // Handle grade change -> reset class filter if class is no longer in this grade
  const handleGradeChange = (e) => {
    const newGrade = e.target.value;
    setFilterGrade(newGrade);
    setFilterClass('');
  };

  // Filter students locally
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (filterGrade && s.khoi !== filterGrade && !s.tenlop?.startsWith(filterGrade)) {
        // Fallback: If student doesn't have 'khoi' field, we guess from 'tenlop' prefix (e.g. 10A1 -> starts with 10)
        return false;
      }
      if (filterClass && s.tenlop !== filterClass) return false;
      return true;
    });
  }, [students, filterGrade, filterClass]);

  const handleDelete = async (id) => {
    if (window.confirm('Bạn có chắc chắn muốn xoá học sinh này? Tất cả dữ liệu liên quan sẽ bị mất.')) {
      const res = await deleteStudent(id);
      if (res.success) {
        setStudents(students.filter(s => s.id !== id));
      } else {
        alert('Có lỗi xảy ra khi xoá học sinh.');
      }
    }
  };

  const openEditModal = (student) => {
    setEditForm({
      mahs: student.mahs || '',
      hoten: student.hoten || '',
      ngaysinh: student.ngaysinh || '',
      gioitinh: student.gioitinh || '',
      khoi: student.khoi || '',
      tenlop: student.tenlop || '',
      diachi: student.diachi || '',
      lienhe: student.lienhe || ''
    });
    setEditingStudent(student);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.mahs || !editForm.hoten || !editForm.khoi || !editForm.tenlop) {
      alert('Vui lòng điền đủ các trường bắt buộc (*)');
      return;
    }
    
    // Update object
    const updateData = {
      mahs: editForm.mahs.toUpperCase().trim(),
      hoten: editForm.hoten.trim(),
      ngaysinh: editForm.ngaysinh,
      gioitinh: editForm.gioitinh,
      khoi: editForm.khoi,
      tenlop: editForm.tenlop,
      diachi: editForm.diachi,
      lienhe: editForm.lienhe
    };

    const res = await updateStudent(editingStudent.id, updateData);
    if (res.success) {
      setStudents(students.map(s => s.id === editingStudent.id ? { ...s, ...updateData } : s));
      setEditingStudent(null);
    } else {
      alert('Lỗi khi cập nhật thông tin.');
    }
  };

  return (
    <>
      <Header title="Danh sách Học sinh" />
      <div className="student-list-content">
        <div className="student-list-toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div className="student-list-count" style={{ width: '100%', marginBottom: '4px' }}>
            <Users size={16} color="var(--primary-color)" />
            <span className="font-semibold">{filteredStudents.length} học sinh</span>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <Select
              value={filterGrade}
              onChange={handleGradeChange}
              options={gradeOptions}
              className="filter-select"
            />
            <Select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              options={classOptions}
              className="filter-select"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-muted text-center mt-4">Đang tải...</p>
        ) : filteredStudents.length === 0 ? (
          <p className="text-muted text-center mt-4">Không có học sinh.</p>
        ) : (
          <div className="student-list-items">
            {filteredStudents.map((s, idx) => (
              <Card key={s.id} className="student-list-row">
                <CardBody className="flex-row gap-3">
                  <div className="student-list-idx">{idx + 1}</div>
                  <div className="avatar-circle small">
                    <UserCircle size={20} color="var(--primary-color)" />
                  </div>
                  <div className="flex-1">
                    <div className="student-list-name">
                      {s.hoten}
                      <span className="class-badge">{s.tenlop}</span>
                    </div>
                    <div className="text-muted text-xs">{s.mahs}</div>
                  </div>
                  <div className="student-actions">
                    <button className="action-btn edit-btn" onClick={() => openEditModal(s)}>
                      <Edit size={16} />
                    </button>
                    {user?.role !== 'giamthi' && user?.role !== 'giaovien' && (
                      <button className="action-btn delete-btn" onClick={() => handleDelete(s.id)}>
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

      {editingStudent && (
        <div className="modal-overlay" onClick={() => setEditingStudent(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Sửa Thông Tin Học Sinh</h3>
              <button className="close-btn" onClick={() => setEditingStudent(null)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="modal-body">
              <div className="form-grid-2">
                <Input 
                  label="MÃ HỌC SINH *" 
                  value={editForm.mahs} 
                  onChange={e => setEditForm({...editForm, mahs: e.target.value})} 
                />
                <Input 
                  label="HỌ VÀ TÊN *" 
                  value={editForm.hoten} 
                  onChange={e => setEditForm({...editForm, hoten: e.target.value})} 
                />
                <div className="input-group full-width">
                  <label className="input-label">NGÀY SINH</label>
                  <DayPicker 
                    value={editForm.ngaysinh} 
                    onChange={v => setEditForm({...editForm, ngaysinh: v})} 
                  />
                </div>
                <Select
                  label="GIỚI TÍNH"
                  value={editForm.gioitinh}
                  onChange={e => setEditForm({...editForm, gioitinh: e.target.value})}
                  options={[
                    { value: '', label: '-- Chọn --' },
                    { value: 'Nam', label: 'Nam' },
                    { value: 'Nữ', label: 'Nữ' }
                  ]}
                />
                <Select
                  label="KHỐI *"
                  value={editForm.khoi}
                  onChange={e => setEditForm({...editForm, khoi: e.target.value, tenlop: ''})}
                  options={gradeOptions}
                />
                <Select
                  label="LỚP *"
                  value={editForm.tenlop}
                  onChange={e => setEditForm({...editForm, tenlop: e.target.value})}
                  options={[
                    { value: '', label: '-- Chọn lớp --' },
                    ...classes.filter(c => String(c.khoi) === String(editForm.khoi)).map(c => ({ value: c.tenlop, label: c.tenlop }))
                  ]}
                />
              </div>
              <div className="input-group full-width mt-3">
                <label className="input-label">ĐỊA CHỈ</label>
                <textarea 
                  className="input-field textarea-field" 
                  rows="2" 
                  value={editForm.diachi}
                  onChange={e => setEditForm({...editForm, diachi: e.target.value})}
                ></textarea>
              </div>
              <div className="input-group full-width mt-3">
                <label className="input-label">LIÊN HỆ</label>
                <Input 
                  value={editForm.lienhe}
                  onChange={e => setEditForm({...editForm, lienhe: e.target.value})}
                  hideLabel
                />
              </div>
              <div className="modal-footer">
                <Button variant="outline" type="button" onClick={() => setEditingStudent(null)}>Huỷ</Button>
                <Button type="submit">Lưu Thay Đổi</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
