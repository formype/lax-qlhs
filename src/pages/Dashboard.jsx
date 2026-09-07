import React, { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { getRecentViolations, getAttendanceByDate, fetchStudents } from '../lib/firebase';
import { format, isToday, isThisWeek, parseISO } from 'date-fns';
import { AlertCircle, Clock, ShieldAlert, TrendingUp, CheckCircle, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION } from '../config';
import './Dashboard.css';

export function Dashboard() {
  const { user } = useAuth();
  const [violations, setViolations] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({ 
    present: 0, 
    absent: 0, 
    attended: 0,
    unattended: 0,
    unattendedClasses: [],
    session: '' 
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const [data, attendanceData, studentsData] = await Promise.all([
        getRecentViolations(),
        getAttendanceByDate(todayStr),
        fetchStudents()
      ]);
      setViolations(data);

      const isGlobalView = user?.role?.some(r => ['admin', 'vip-admin', 'giamthi'].includes(r));
      const teacherClass = user?.teacherClass;
      const currentSession = new Date().getHours() < 12 ? 'Sáng' : 'Chiều';

      let totalStudents = 0;
      let validStudents = studentsData;
      if (!isGlobalView && teacherClass) {
        validStudents = studentsData.filter(s => s.tenlop === teacherClass);
      }
      totalStudents = validStudents.length;

      // Group students by class
      const classStudentCounts = {};
      validStudents.forEach(s => {
        const cName = s.tenlop || 'Chưa xếp lớp';
        classStudentCounts[cName] = (classStudentCounts[cName] || 0) + 1;
      });

      let presentCount = 0;
      let absentCount = 0;
      let attendedClasses = new Set();

      attendanceData.forEach(doc => {
        // Filter by class if not global view
        if (!isGlobalView && teacherClass && doc.className !== teacherClass) {
          return;
        }
        // Filter by current session
        if (doc.session !== currentSession) {
          return;
        }

        if (doc.records) {
          attendedClasses.add(doc.className || 'Chưa xếp lớp');
          Object.values(doc.records).forEach(status => {
            if (status === 'present') presentCount++;
            else if (status.startsWith('absent')) absentCount++;
          });
        }
      });
      
      let attendedCount = presentCount + absentCount;
      let unattendedCount = totalStudents - attendedCount;
      if (unattendedCount < 0) unattendedCount = 0;

      let unattendedClassesList = [];
      Object.keys(classStudentCounts).forEach(cName => {
        if (!attendedClasses.has(cName)) {
          unattendedClassesList.push(`${cName}`);
        }
      });

      setAttendanceStats({ 
        present: presentCount, 
        absent: absentCount, 
        attended: attendedCount,
        unattended: unattendedCount,
        unattendedClasses: unattendedClassesList,
        session: currentSession 
      });
      setLoading(false);
    };
    fetchStats();
  }, [user]);

  const isGlobalView = user?.role?.some(r => ['admin', 'vip-admin', 'giamthi'].includes(r));
  const teacherClass = user?.teacherClass;

  const filteredViolations = violations.filter(v => {
    if (isGlobalView) return true;
    if (teacherClass && v.tenlop === teacherClass) return true;
    return false;
  });

  const todayCount = filteredViolations.filter(v => {
    try { return isToday(parseISO(v.ngayvipham)); } catch { return false; }
  }).length;

  const weekCount = filteredViolations.filter(v => {
    try { return isThisWeek(parseISO(v.ngayvipham)); } catch { return false; }
  }).length;

  const pendingCount = filteredViolations.filter(v => v.trangthai === 'Chưa xử lý').length;
  const resolvedCount = filteredViolations.filter(v => v.trangthai === 'Đã xử lý').length;

  return (
    <>
      <Header title="Tổng quan" />
      <div className="dashboard-content">
        {user && (
          <div className="welcome-banner">
            <span className="welcome-text">Xin chào, <strong>{user.fullName || user.username}</strong> 👋</span>
          </div>
        )}

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <AlertCircle size={16} color="var(--warning)" />
                <span>Hôm nay</span>
              </div>
              <div className="stat-number">{loading ? '-' : todayCount}</div>
            </CardBody>
          </Card>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <ShieldAlert size={16} color="var(--primary-color)" />
                <span>Tuần này</span>
              </div>
              <div className="stat-number">{loading ? '-' : weekCount}</div>
            </CardBody>
          </Card>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <Clock size={16} color="var(--danger)" />
                <span>Chưa xử lý</span>
              </div>
              <div className="stat-number" style={{ color: 'var(--danger)' }}>{loading ? '-' : pendingCount}</div>
            </CardBody>
          </Card>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <CheckCircle size={16} color="var(--success)" />
                <span>Đã xử lý</span>
              </div>
              <div className="stat-number" style={{ color: 'var(--success)' }}>{loading ? '-' : resolvedCount}</div>
            </CardBody>
          </Card>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <UserCheck size={16} color="var(--primary-color)" />
                <span>Có mặt ({attendanceStats.session || 'Sáng'} - {format(new Date(), 'dd/MM/yyyy')})</span>
              </div>
              <div className="stat-number" style={{ color: 'var(--primary-color)' }}>{loading ? '-' : attendanceStats.present}</div>
            </CardBody>
          </Card>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <UserX size={16} color="var(--danger)" />
                <span>Vắng ({attendanceStats.session || 'Sáng'} - {format(new Date(), 'dd/MM/yyyy')})</span>
              </div>
              <div className="stat-number" style={{ color: 'var(--danger)' }}>{loading ? '-' : attendanceStats.absent}</div>
            </CardBody>
          </Card>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <CheckCircle size={16} color="var(--success)" />
                <span>Đã điểm danh ({attendanceStats.session || 'Sáng'} - {format(new Date(), 'dd/MM/yyyy')})</span>
              </div>
              <div className="stat-number" style={{ color: 'var(--success)' }}>{loading ? '-' : attendanceStats.attended}</div>
            </CardBody>
          </Card>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <AlertCircle size={16} color="var(--warning)" />
                <span>Chưa điểm danh ({attendanceStats.session || 'Sáng'} - {format(new Date(), 'dd/MM/yyyy')})</span>
              </div>
              <div className="stat-number" style={{ color: 'var(--warning)' }}>{loading ? '-' : attendanceStats.unattended}</div>
              {!loading && attendanceStats.unattendedClasses?.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Lớp: {attendanceStats.unattendedClasses.join(', ')}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div style={{ textAlign: 'center', marginTop: 'auto', paddingBottom: '20px', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.6' }}>
          <p style={{ marginBottom: '4px' }}>Version: {APP_VERSION}</p>
          <p style={{ marginBottom: '4px' }}>© 2026 THCS Lê Anh Xuân. All rights reserved.</p>
          <p style={{ margin: 0 }}>Ứng dụng được phát triển bởi Formype. Mọi chi tiết xin liên hệ tvhnhan.laxq11@hcm.edu.vn</p>
        </div>
      </div>
    </>
  );
}
