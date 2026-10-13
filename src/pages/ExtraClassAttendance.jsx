import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { 
  fetchExtraClasses, 
  fetchStudentsForExtraClass, 
  saveExtraClassAttendance, 
  getExtraClassAttendance,
  createNotification
} from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, XCircle, UserCheck, Sparkles, Calendar, CheckSquare } from 'lucide-react';
import { format } from 'date-fns';
import './ExtraClassAttendance.css';

const STATUS_OPTIONS = [
  { key: 'present', label: 'Có mặt', icon: CheckCircle, color: '#10b981' },
  { key: 'absent', label: 'Vắng mặt', icon: XCircle, color: '#ef4444' }
];

export function ExtraClassAttendance() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Role authorization check: giamthi, admin, vip-admin only
  const isAuthorized = user?.role?.includes('admin') || 
                       user?.role?.includes('vip-admin') || 
                       user?.role?.includes('giamthi');

  const [extraClasses, setExtraClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const dateInputRef = useRef(null);

  const [attendance, setAttendance] = useState({});
  const attendanceRef = useRef({});
  const [loading, setLoading] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthorized) {
      alert('Bạn không có quyền truy cập vào chức năng này!');
      navigate('/', { replace: true });
      return;
    }

    const loadExtraClasses = async () => {
      try {
        setLoadingClasses(true);
        const data = await fetchExtraClasses();
        setExtraClasses(data);
      } catch (err) {
        console.error("Lỗi khi tải danh sách lớp ngoại khóa:", err);
      } finally {
        setLoadingClasses(false);
      }
    };

    loadExtraClasses();
  }, [isAuthorized, navigate]);

  // Load students & attendance record for the selected extra class and date
  useEffect(() => {
    const loadData = async () => {
      if (!selectedClassId || !date) {
        setStudents([]);
        setAttendance({});
        attendanceRef.current = {};
        setSelectedClass(null);
        return;
      }

      const currentCls = extraClasses.find(c => c.id === selectedClassId) || null;
      setSelectedClass(currentCls);

      setLoading(true);
      try {
        const [studentsData, existingData] = await Promise.all([
          fetchStudentsForExtraClass(selectedClassId),
          getExtraClassAttendance(date, selectedClassId)
        ]);

        setStudents(studentsData);

        const newAtt = {};
        if (existingData && existingData.records) {
          studentsData.forEach(s => {
            newAtt[s.id] = existingData.records[s.id] || 'present';
          });
        } else {
          // Mặc định tất cả học sinh là có mặt
          studentsData.forEach(s => {
            newAtt[s.id] = 'present';
          });
        }

        setAttendance(newAtt);
        attendanceRef.current = newAtt;
      } catch (err) {
        console.error("Lỗi khi tải dữ liệu điểm danh ngoại khóa:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedClassId, date, extraClasses]);

  // Toggle có mặt <-> vắng mặt (không phân biệt phép / không phép)
  const toggleStatus = (studentId) => {
    setAttendance(prev => {
      const current = prev[studentId] || 'present';
      const nextStatus = current === 'present' ? 'absent' : 'present';
      const newState = { ...prev, [studentId]: nextStatus };
      attendanceRef.current = newState;
      return newState;
    });
  };

  // Đánh dấu tất cả có mặt
  const setAllPresent = () => {
    const newAtt = {};
    students.forEach(s => {
      newAtt[s.id] = 'present';
    });
    setAttendance(newAtt);
    attendanceRef.current = newAtt;
  };

  // Lưu điểm danh
  const handleSave = async () => {
    if (!selectedClassId || !date || students.length === 0) return;
    
    setSaving(true);
    const className = selectedClass?.tenlopngoaikhoa || selectedClass?.name || 'Môn ngoại khóa';
    const payload = attendanceRef.current;
    const updaterName = user?.fullName || user?.username || 'Giám thị';

    const result = await saveExtraClassAttendance(
      date, 
      selectedClassId, 
      className, 
      payload, 
      updaterName
    );
    
    setSaving(false);

    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);

      // Gửi thông báo đến giáo viên chủ nhiệm (GVCN) của các học sinh vắng ngoại khóa
      const absenteesByClass = {};
      students.forEach(s => {
        const stStatus = payload[s.id];
        if (stStatus === 'absent') {
          const regClass = s.tenlop || s.lop;
          if (regClass) {
            if (!absenteesByClass[regClass]) {
              absenteesByClass[regClass] = [];
            }
            absenteesByClass[regClass].push(s.hoten || s.name || s.mahs);
          }
        }
      });

      // Gửi thông báo đến từng lớp chủ nhiệm có học sinh vắng
      const formattedDate = formatDateToVN(date);
      Object.entries(absenteesByClass).forEach(([regClass, studentNames]) => {
        let msg = '';
        if (studentNames.length === 1) {
          msg = `Học sinh ${studentNames[0]} (lớp ${regClass}) vắng học ngoại khóa môn ${className} ngày ${formattedDate}.`;
        } else {
          msg = `Có ${studentNames.length} học sinh lớp ${regClass} vắng học ngoại khóa môn ${className} ngày ${formattedDate}: ${studentNames.join(', ')}.`;
        }

        createNotification(
          msg,
          [], // targetRoles rỗng để chỉ GVCN lớp đó nhận thông báo
          [regClass], // targetClasses: lớp chủ nhiệm của học sinh
          {
            type: 'extra_class_absence',
            className: regClass,
            extraClassName: className,
            date: formattedDate,
            absentStudents: studentNames,
            updatedBy: updaterName
          }
        );
      });
    } else {
      alert("Lưu điểm danh thất bại. Chi tiết lỗi: " + result.error);
    }
  };

  const getStatusInfo = (status) => {
    return STATUS_OPTIONS.find(s => s.key === status) || STATUS_OPTIONS[0];
  };

  const summary = {
    present: Object.values(attendance).filter(v => v === 'present').length,
    absent: Object.values(attendance).filter(v => v === 'absent').length,
  };

  const formatDateToVN = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  const extraClassOptions = [
    { value: '', label: '-- Chọn lớp ngoại khóa --' },
    ...extraClasses.map(c => ({ 
      value: c.id, 
      label: c.tenlopngoaikhoa || c.name 
    }))
  ];

  return (
    <>
      <Header title="Điểm danh ngoại khóa" />
      <div className="extra-attendance-content">
        <Card className="selector-card">
          <CardBody className="flex-col gap-3">
            <div className="selector-grid">
              {/* Chọn lớp ngoại khóa */}
              <div className="class-select-box">
                <Select
                  label="Chọn lớp ngoại khóa"
                  options={extraClassOptions}
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  disabled={loadingClasses}
                />
              </div>

              {/* Chọn ngày điểm danh (Không có tùy chọn buổi) */}
              <div className="date-select-box">
                <label className="input-label">Ngày điểm danh</label>
                <div className="date-input-container">
                  <input
                    type="text"
                    className="input-field date-display-field"
                    value={formatDateToVN(date)}
                    onClick={() => dateInputRef.current?.showPicker()}
                    readOnly
                  />
                  <Calendar size={18} className="date-calendar-icon" onClick={() => dateInputRef.current?.showPicker()} />
                  <input
                    type="date"
                    ref={dateInputRef}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="native-date-hidden"
                  />
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Khi đã chọn lớp ngoại khóa và có học sinh */}
        {selectedClassId && students.length > 0 && !loading && (
          <>
            <div className="attendance-action-bar">
              <Button 
                fullWidth 
                onClick={handleSave} 
                className="save-attendance-btn" 
                disabled={saving}
              >
                <UserCheck size={18} />
                <span>{saving ? 'Đang lưu điểm danh...' : saved ? 'Đã lưu điểm danh ✓' : 'Lưu điểm danh ngoại khóa'}</span>
              </Button>
            </div>

            {/* Thanh thống kê có mặt / vắng mặt */}
            <div className="extra-attendance-summary">
              <div className="summary-left">
                <div className="summary-chip present">
                  <CheckCircle size={15} />
                  <span>Có mặt: <strong>{summary.present}</strong></span>
                </div>
                <div className="summary-chip absent">
                  <XCircle size={15} />
                  <span>Vắng mặt: <strong>{summary.absent}</strong></span>
                </div>
                <span className="summary-total">Tổng: <strong>{students.length}</strong> học sinh</span>
              </div>

              <button 
                type="button" 
                className="quick-all-present-btn"
                onClick={setAllPresent}
                title="Đánh dấu tất cả có mặt"
              >
                <CheckSquare size={14} />
                <span>Tất cả có mặt</span>
              </button>
            </div>

            {/* Danh sách học sinh điểm danh */}
            <div className="extra-attendance-list">
              {students.map((s, idx) => {
                const status = attendance[s.id] || 'present';
                const info = getStatusInfo(status);
                const StatusIcon = info.icon;
                const isAbsent = status === 'absent';

                return (
                  <div
                    key={s.id}
                    className={`extra-attendance-row ${isAbsent ? 'row-absent' : 'row-present'}`}
                    onClick={() => toggleStatus(s.id)}
                  >
                    <div className="extra-attendance-idx">{idx + 1}</div>
                    
                    <div className="extra-attendance-info">
                      <div className="extra-attendance-name">{s.hoten || '---'}</div>
                      <div className="extra-attendance-sub">
                        <span className="student-code">{s.mahs || '---'}</span>
                        {(s.tenlop || s.lop) && (
                          <span className="student-regular-class">Lớp: {s.tenlop || s.lop}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="extra-attendance-action" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`status-toggle-button ${isAbsent ? 'status-absent' : 'status-present'}`}
                        onClick={() => toggleStatus(s.id)}
                      >
                        <StatusIcon size={16} />
                        <span>{info.label}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Thông báo trạng thái trống hoặc đang tải */}
        {selectedClassId && !loading && students.length === 0 && (
          <div className="empty-class-notice">
            <Sparkles size={36} color="#8b5cf6" />
            <h4>Chưa có học sinh trong lớp ngoại khóa này</h4>
            <p>Vui lòng vào tính năng "Nhập thông tin học sinh ngoại khóa" để thêm học sinh vào lớp.</p>
          </div>
        )}

        {loading && (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Đang tải danh sách học sinh...</p>
          </div>
        )}
      </div>
    </>
  );
}
