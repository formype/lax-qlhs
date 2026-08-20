import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { getDailyLogs, deleteDailyLog } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { Button } from '../components/ui/Button';
import { ExternalLink, Trash2, Calendar, Clock, User } from 'lucide-react';
import './Search.css'; // Re-use search css

export function DailyLogList() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('today'); // all, today, month
  const { user } = useAuth();
  
  const isAdmin = user?.role?.includes('admin') || user?.role?.includes('vip-admin');
  const isGiamthi = user?.role?.includes('giamthi');

  const fetchLogs = async () => {
    setLoading(true);
    const d = new Date();
    const allLogs = await getDailyLogs();
    
    let filtered = allLogs;
    if (timeFilter === 'today') {
       const today = format(d, 'yyyy-MM-dd');
       filtered = allLogs.filter(l => l.ngay === today);
    } else if (timeFilter === 'month') {
       const month = format(d, 'yyyy-MM');
       filtered = allLogs.filter(l => l.ngay?.startsWith(month));
    }
    
    setLogs(filtered);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [timeFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa ghi nhận này?')) return;
    await deleteDailyLog(id);
    fetchLogs();
  };

  return (
    <div className="search-page pb-20">
      <Header title="Danh sách ghi nhận" />
      
      <div className="search-filters">
        <div className="filter-group">
          <label className="filter-label">Thời gian</label>
          <select 
            className="filter-select" 
            value={timeFilter} 
            onChange={e => setTimeFilter(e.target.value)}
          >
            <option value="today">Hôm nay</option>
            <option value="month">Tháng này</option>
            <option value="all">Tất cả</option>
          </select>
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
