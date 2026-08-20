import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { getDailyLogs, deleteDailyLog, fetchSystemSettings, fetchUsers } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO, parse } from 'date-fns';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { DayPicker, MonthPicker } from '../components/ui/DatePicker';
import { Card, CardBody } from '../components/ui/Card';
import { ExternalLink, Trash2, Calendar, Clock, User } from 'lucide-react';
import './Search.css'; // Re-use search css

export function DailyLogList() {
  const [allLogs, setAllLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  
  const [timeFilterType, setTimeFilterType] = useState('all'); // all, day, week, month
  const [timeValueDay, setTimeValueDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeValueWeek, setTimeValueWeek] = useState('1');
  const [timeValueMonth, setTimeValueMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  const [sessionFilter, setSessionFilter] = useState('all'); // all, Sáng, Chiều
  
  const { user } = useAuth();
  
  const isAdmin = user?.role?.includes('admin') || user?.role?.includes('vip-admin');
  const isGiamthi = user?.role?.includes('giamthi');

  const fetchData = async () => {
    setLoading(true);
    const [fetchedLogs, sData, usersData] = await Promise.all([
      getDailyLogs(),
      fetchSystemSettings(),
      fetchUsers()
    ]);
    
    const uMap = {};
    if (usersData) {
      usersData.forEach(u => {
        uMap[u.id] = u.fullName || u.name || u.hoten || u.username || 'Unknown';
      });
    }
    setUsersMap(uMap);
    
    setAllLogs(fetchedLogs);
    setSettings(sData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const logs = React.useMemo(() => {
    if (!settings) return [];
    const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s1Weeks = parseInt(settings.semester1Weeks || 18);
    const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());

    return allLogs.filter(v => {
      let vDate;
      if (v.ngay) {
        vDate = parseISO(v.ngay);
      } else {
        return false;
      }

      let weekNum = 0;
      if (vDate >= s2Start) {
        const diffTime = vDate.getTime() - s2Start.getTime();
        const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
        weekNum = diffWeeks + 1 + s1Weeks;
      } else {
        const diffTime = vDate.getTime() - s1Start.getTime();
        const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
        weekNum = diffWeeks + 1;
      }

      // Time Filter
      if (timeFilterType === 'day') {
        if (v.ngay !== timeValueDay) return false;
      } else if (timeFilterType === 'week') {
        if (weekNum.toString() !== timeValueWeek) return false;
      } else if (timeFilterType === 'month') {
        if (format(vDate, 'yyyy-MM') !== timeValueMonth) return false;
      }

      // Session Filter
      if (sessionFilter !== 'all') {
        if (v.buoi !== sessionFilter) return false;
      }

      return true;
    });
  }, [allLogs, settings, timeFilterType, timeValueDay, timeValueWeek, timeValueMonth, sessionFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa ghi nhận này?')) return;
    await deleteDailyLog(id);
    fetchData();
  };

  const weekOptions = settings ? Array.from({ length: parseInt(settings.semester1Weeks || 18) + parseInt(settings.semester2Weeks || 17) }, (_, i) => ({
    value: (i + 1).toString(),
    label: `Tuần ${i + 1}`
  })) : [];

  return (
    <div className="search-page pb-20">
      <Header title="Danh sách ghi nhận" />
      
      <div className="search-content">
        <Card className="filter-card">
          <CardBody>
            <div className="filter-grid">
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Thời gian</label>
                <div className="flex-row gap-2">
                  <Select 
                    value={timeFilterType} 
                    onChange={e => setTimeFilterType(e.target.value)}
                    options={[
                      {value: 'all', label: 'Tất cả'},
                      {value: 'day', label: 'Theo ngày'},
                      {value: 'week', label: 'Theo tuần'},
                      {value: 'month', label: 'Theo tháng'}
                    ]}
                  />
                  {timeFilterType === 'day' && (
                    <DayPicker 
                      value={timeValueDay} 
                      onChange={val => setTimeValueDay(val)}
                    />
                  )}
                  {timeFilterType === 'week' && <Select value={timeValueWeek} onChange={e => setTimeValueWeek(e.target.value)} options={weekOptions} style={{ maxWidth: '100%', flex: 1 }} />}
                  {timeFilterType === 'month' && (
                    <MonthPicker 
                      value={timeValueMonth} 
                      onChange={val => setTimeValueMonth(val)}
                    />
                  )}
                </div>
              </div>

              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Buổi học</label>
                <Select 
                  value={sessionFilter}
                  onChange={e => setSessionFilter(e.target.value)}
                  options={[
                    {value: 'all', label: 'Tất cả buổi'},
                    {value: 'Sáng', label: 'Buổi sáng'},
                    {value: 'Chiều', label: 'Buổi chiều'}
                  ]}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="export-actions flex-between mt-3 mb-3">
          <span className="text-muted text-sm font-semibold">Tìm thấy {logs.length} kết quả</span>
        </div>

        <div className="search-results-grid">
          {loading ? (
            <p className="text-center text-muted mt-4 w-full">Đang tải...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted mt-4 w-full py-4">Không có dữ liệu ghi nhận</p>
          ) : (
            logs.map(log => (
              <Card key={log.id} className="violation-card-modern">
                <CardBody>
                  <div className="flex-between mb-2 align-start">
                    <div className="student-name-modern" style={{ display: 'flex', alignItems: 'center' }}>
                      <Calendar size={16} className="mr-2" style={{ marginRight: '6px' }} />
                      {log.ngay ? format(parseISO(log.ngay), 'dd/MM/yyyy') : ''}
                    </div>
                    <span className="class-badge-modern">{log.buoi}</span>
                  </div>
                  
                  <div className="violation-info-modern mt-3 mb-4" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: 'var(--text-color)' }}>
                    {log.noidung}
                  </div>
                  
                  {log.images && log.images.length > 0 && (
                    <div className="mt-3 mb-2">
                      <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Hình ảnh đính kèm:</p>
                      <div className="flex-row gap-2 flex-wrap">
                        {log.images.map((url, index) => (
                           <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <ExternalLink size={14} style={{ marginRight: '6px' }} /> Xem ảnh {index + 1}
                           </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="violation-footer-modern mt-4 pt-3" style={{ borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="text-sm text-muted" style={{ display: 'flex', alignItems: 'center' }}>
                      <User size={14} style={{ marginRight: '6px' }} /> 
                      <span>
                        Ghi nhận bởi: <strong style={{ color: 'var(--text-color)', marginLeft: '2px' }}>
                          {(log.createdById && usersMap[log.createdById]) || (log.createdBy !== 'Unknown' ? log.createdBy : 'Người dùng')}
                        </strong>
                        {log.createdAt && <span style={{ marginLeft: '4px' }}>lúc {format(log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt.seconds * 1000), 'HH:mm dd/MM/yyyy')}</span>}
                      </span>
                    </div>
                    {(isAdmin || isGiamthi) && (
                      <Button variant="secondary" size="sm" onClick={() => handleDelete(log.id)} style={{ padding: '4px 8px', color: '#ef4444' }}>
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
