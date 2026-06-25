import React, { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { getRecentViolations, getAttendanceByDate } from '../lib/firebase';
import { format, isToday, isThisWeek, parseISO } from 'date-fns';
import { AlertCircle, Clock, ShieldAlert, TrendingUp, CheckCircle, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION } from '../config';
import './Dashboard.css';

export function Dashboard() {
  const { user } = useAuth();
  const [violations, setViolations] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const [data, attendanceData] = await Promise.all([
        getRecentViolations(),
        getAttendanceByDate(todayStr)
      ]);
      setViolations(data);

      let presentCount = 0;
      let absentCount = 0;
      attendanceData.forEach(doc => {
        if (doc.records) {
          Object.values(doc.records).forEach(status => {
            if (status === 'present') presentCount++;
            else if (status.startsWith('absent')) absentCount++;
          });
        }
      });
      setAttendanceStats({ present: presentCount, absent: absentCount });
      setLoading(false);
    };
    fetchStats();
  }, []);

  const todayCount = violations.filter(v => {
    try { return isToday(parseISO(v.ngayvipham)); } catch { return false; }
  }).length;

  const weekCount = violations.filter(v => {
    try { return isThisWeek(parseISO(v.ngayvipham)); } catch { return false; }
  }).length;

  const pendingCount = violations.filter(v => v.trangthai === 'Chưa xử lý').length;
  const resolvedCount = violations.filter(v => v.trangthai === 'Đã xử lý').length;

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
                <span>Có mặt ({format(new Date(), 'dd/MM/yyyy')})</span>
              </div>
              <div className="stat-number" style={{ color: 'var(--primary-color)' }}>{loading ? '-' : attendanceStats.present}</div>
            </CardBody>
          </Card>
          <Card className="stat-card">
            <CardBody className="flex-col gap-2">
              <div className="flex-row gap-2 text-muted">
                <UserX size={16} color="var(--danger)" />
                <span>Vắng ({format(new Date(), 'dd/MM/yyyy')})</span>
              </div>
              <div className="stat-number" style={{ color: 'var(--danger)' }}>{loading ? '-' : attendanceStats.absent}</div>
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
