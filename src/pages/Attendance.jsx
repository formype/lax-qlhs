import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { fetchClasses, fetchStudents, saveAttendance, getAttendanceForDateClass, createNotification } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, XCircle, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import './Attendance.css';

const STATUS_OPTIONS = [
  { key: 'present', label: 'Có mặt', icon: CheckCircle, color: '#10b981' },
  { key: 'absent_kp', label: 'Vắng mặt', icon: XCircle, color: '#ef4444' },
  { key: 'absent_p', label: 'Vắng mặt', icon: XCircle, color: '#ef4444' }
];

export function Attendance() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [session, setSession] = useState(new Date().getHours() < 12 ? 'Sáng' : 'Chiều');
  const dateInputRef = React.useRef(null);
  const [attendance, setAttendance] = useState({});
  const attendanceRef = React.useRef({});
  const [reasons, setReasons] = useState({});
  const reasonsRef = React.useRef({});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadClasses = async () => {
      const classesData = await fetchClasses();
      setClasses(classesData);
    };
    loadClasses();
  }, []);

  useEffect(() => {
    const loadClassData = async () => {
      if (!selectedClass || !date) {
        setStudents([]);
        setAttendance({});
        attendanceRef.current = {};
        setReasons({});
        reasonsRef.current = {};
        return;
      }

      setLoading(true);
      try {
        const [studentsData, existingData] = await Promise.all([
          fetchStudents({ className: selectedClass }),
          getAttendanceForDateClass(date, session, selectedClass)
        ]);

        setStudents(studentsData);

        const newAtt = {};
        const newReasons = {};
        if (existingData && existingData.records) {
          studentsData.forEach(s => {
            newAtt[s.id] = existingData.records[s.id] || 'present';
            if (existingData.reasons && existingData.reasons[s.id]) {
              newReasons[s.id] = existingData.reasons[s.id];
            }
          });
        } else {
          studentsData.forEach(s => { newAtt[s.id] = 'present'; });
        }
        setAttendance(newAtt);
        attendanceRef.current = newAtt;
        setReasons(newReasons);
        reasonsRef.current = newReasons;
      } catch (err) {
        console.error("Failed to load class data", err);
      }
      setLoading(false);
    };

    loadClassData();
  }, [selectedClass, date, session]);

  const toggleStatus = (studentId) => {
    setAttendance(prev => {
      const current = prev[studentId] || 'present';
      let nextStatus = 'present';
      if (current === 'present') {
        nextStatus = 'absent_kp'; // Mặc định là không phép
      } else if (current.startsWith('absent')) {
        nextStatus = 'present';
      }
      
      const newState = { ...prev, [studentId]: nextStatus };
      attendanceRef.current = newState;
      return newState;
    });
  };

  const setAbsentReason = (studentId, isExcused) => {
    setAttendance(prev => {
      const newState = { ...prev, [studentId]: isExcused ? 'absent_p' : 'absent_kp' };
      attendanceRef.current = newState;
      return newState;
    });
    if (isExcused) {
      setReasons(prev => {
        const newState = { ...prev, [studentId]: prev[studentId] || 'Việc riêng' };
        reasonsRef.current = newState;
        return newState;
      });
    }
  };

  const updateDetailReason = (studentId, reason) => {
    setReasons(prev => {
      const newState = { ...prev, [studentId]: reason };
      reasonsRef.current = newState;
      return newState;
    });
  };

  const handleSave = async () => {
    if (!selectedClass || !date || students.length === 0) return;
    setSaving(true);
    const payload = attendanceRef.current;
    const reasonsPayload = reasonsRef.current;
    const result = await saveAttendance(date, session, selectedClass, payload, user?.fullName || user?.username || 'Hệ thống', reasonsPayload);
    setSaving(false);
    
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      
      // Send notifications for absentees
      const updaterName = user?.fullName || user?.username || 'Hệ thống';
      
      // Count absentees
      let absentCount = 0;
      Object.values(payload).forEach(status => {
        if (status === 'absent_kp' || status === 'absent_p' || status === 'absent') absentCount++;
      });

      // 1. Send Class-level notification (Only to homeroom teacher)
      // targetRoles is empty so Admins do not receive this.
      // targetClasses contains the class name so the teacher of this class receives it.
      createNotification(
        `Tài khoản ${updaterName} đã điểm danh lớp ${selectedClass}. Có ${absentCount} học sinh vắng.`,
        [], 
        [selectedClass], 
        {
          type: 'attendance_class',
          className: selectedClass,
          date: date,
          session: session,
          absentCount: absentCount,
          updatedBy: updaterName
        }
      );
      
    } else {
      alert("Lưu thất bại. Chi tiết lỗi: " + result.error);
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

  const classOptions = [
    { value: '', label: '-- Chọn lớp --' },
    ...classes.map(c => ({ value: c.tenlop, label: c.tenlop }))
  ];

  return (
    <>
      <Header title="Điểm danh" />
      <div className="attendance-content">
        <Card>
          <CardBody className="flex-col gap-3">
            <div className="flex-row gap-2">
              <Select
                label="Chọn lớp"
                options={classOptions}
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="flex-1"
              />
              <div className="input-group" style={{ maxWidth: '140px', position: 'relative' }}>
                <label className="input-label">Ngày</label>
                <input
                  type="text"
                  className="input-field"
                  value={formatDateToVN(date)}
                  onClick={() => dateInputRef.current?.showPicker()}
                  readOnly
                  style={{ cursor: 'pointer' }}
                />
                <input
                  type="date"
                  ref={dateInputRef}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, bottom: 0 }}
                />
              </div>
              
              <div className="flex-row gap-2 mt-2">
                <Select
                  label="Buổi học"
                  options={[
                    { value: 'Sáng', label: 'Buổi Sáng' },
                    { value: 'Chiều', label: 'Buổi Chiều' }
                  ]}
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {selectedClass && students.length > 0 && !loading && (
          <>
            <Button fullWidth onClick={handleSave} className="mb-3" disabled={saving}>
              <UserCheck size={18} />
              {saving ? 'Đang lưu...' : saved ? 'Đã lưu ✓' : 'Lưu điểm danh'}
            </Button>

            {/* Summary bar */}
            <div className="attendance-summary">
              <div className="summary-item">
                <CheckCircle size={14} color="#10b981" />
                <span>{summary.present}</span>
              </div>
              <div className="summary-item">
                <XCircle size={14} color="#ef4444" />
                <span>{summary.absent}</span>
              </div>
              <span className="text-muted text-xs">Tổng: {students.length}</span>
            </div>

            {/* Student list */}
            <div className="attendance-list">
              {students.map((s, idx) => {
                const status = attendance[s.id] || 'present';
                const info = getStatusInfo(status);
                const StatusIcon = info.icon;
                const isAbsent = status.startsWith('absent');
                const isExcused = status === 'absent_p';

                return (
                  <div
                    key={s.id}
                    className="attendance-row"
                    onClick={() => toggleStatus(s.id)}
                  >
                    <div className="attendance-idx">{idx + 1}</div>
                    <div className="attendance-info">
                      <div className="attendance-name">{s.hoten}</div>
                      <div className="text-muted text-xs">{s.mahs}</div>
                    </div>
                    
                    <div className="attendance-actions" onClick={e => e.stopPropagation()}>
                      {isAbsent && (
                        <div className="absent-reason-group mr-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <div className="flex">
                            <button 
                              className={`reason-btn ${isExcused ? 'active-p' : ''}`}
                              onClick={(e) => { e.stopPropagation(); setAbsentReason(s.id, true); }}
                            >
                              Phép
                            </button>
                            <button 
                              className={`reason-btn ${!isExcused ? 'active-kp' : ''}`}
                              onClick={(e) => { e.stopPropagation(); setAbsentReason(s.id, false); }}
                            >
                              K.Phép
                            </button>
                          </div>
                          {isExcused && (
                            <select 
                              className="input-select text-xs p-1 h-auto min-h-0 ml-1"
                              style={{ width: 'auto', display: 'inline-block' }}
                              value={reasons[s.id] || 'Việc riêng'}
                              onChange={(e) => { e.stopPropagation(); updateDetailReason(s.id, e.target.value); }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="Việc riêng">Việc riêng</option>
                              <option value="Bệnh">Bệnh</option>
                            </select>
                          )}
                        </div>
                      )}
                      
                      <button
                        className="attendance-status-btn"
                        style={{ backgroundColor: info.color + '18', color: info.color }}
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

        {selectedClass && !loading && students.length === 0 && (
          <p className="text-muted text-center mt-4">Không có học sinh trong lớp này.</p>
        )}

        {loading && (
          <p className="text-muted text-center mt-4">Đang tải dữ liệu...</p>
        )}
      </div>
    </>
  );
}
