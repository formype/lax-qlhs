import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { getDailyLogs, deleteDailyLog, fetchSystemSettings } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO, parse } from 'date-fns';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { DayPicker, MonthPicker } from '../components/ui/DatePicker';
import { ExternalLink, Trash2, Calendar, Clock, User } from 'lucide-react';
import './Search.css'; // Re-use search css

export function DailyLogList() {
  const [allLogs, setAllLogs] = useState([]);
  const [settings, setSettings] = useState(null);
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
    const [fetchedLogs, sData] = await Promise.all([
      getDailyLogs(),
      fetchSystemSettings()
    ]);
    setAllLogs(fetchedLogs);
    setSettings(sData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const logs = React.useMemo(() => {
    if (!settings) return [];
    const s1Start = parse(settings.semester1_start, 'yyyy-MM-dd', new Date());
    const s1Weeks = parseInt(settings.semester1_weeks);
    const s2Start = parse(settings.semester2_start, 'yyyy-MM-dd', new Date());

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

  const weekOptions = settings ? Array.from({ length: parseInt(settings.semester1_weeks) + parseInt(settings.semester2_weeks) }, (_, i) => ({
    value: (i + 1).toString(),
    label: `Tuần ${i + 1}`
  })) : [];

  return (
    <div className="search-page pb-20">
      <Header title="Danh sách ghi nhận" />
      
      <div className="search-filters">
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

      <div className="search-results">
        {loading ? (
          <div className="text-center py-8 text-muted">Đang tải...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted">Không có dữ liệu ghi nhận</div>
        ) : (
          <div className="results-list">
            {logs.map(log => (
              <div key={log.id} className="result-card p-4 bg-white rounded shadow-sm mb-4" style={{ border: '1px solid var(--border-color)' }}>
                <div className="flex-row justify-between items-start mb-2" style={{ display: 'flex' }}>
                  <div className="font-semibold text-lg text-primary" style={{ display: 'flex', alignItems: 'center' }}>
                    <Calendar size={16} className="mr-1" style={{ marginRight: '4px' }} />
                    {log.ngay ? format(parseISO(log.ngay), 'dd/MM/yyyy') : ''} 
                    <span className="text-muted text-sm ml-2 font-normal" style={{ marginLeft: '12px', display: 'flex', alignItems: 'center' }}>
                      <Clock size={14} className="mr-1" style={{ marginRight: '4px' }} />{log.buoi}
                    </span>
                  </div>
                  {(isAdmin || isGiamthi) && (
                    <button className="btn btn-icon text-danger" onClick={() => handleDelete(log.id)} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={16} color="#ef4444" />
                    </button>
                  )}
                </div>
                
                <div className="mb-3 text-dark mt-3" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                  {log.noidung}
                </div>
                
                {log.images && log.images.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold mb-2">Hình ảnh đính kèm:</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {log.images.map((url, index) => (
                         <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <ExternalLink size={14} style={{ marginRight: '4px' }} /> Xem ảnh {index + 1}
                         </a>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="mt-4 pt-3 text-sm text-muted" style={{ borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center' }}>
                  <User size={14} style={{ marginRight: '4px' }} /> Ghi nhận bởi: <strong style={{ marginLeft: '4px' }}>{log.createdBy}</strong>
                  {log.createdAt && <span style={{ marginLeft: '4px' }}>lúc {format(log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt.seconds * 1000), 'HH:mm dd/MM/yyyy')}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
