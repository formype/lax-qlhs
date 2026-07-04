import React from 'react';
import { X, User, Calendar, Info, Camera } from 'lucide-react';
import { Card, CardBody } from './Card';
import { Button } from './Button';

export function NotificationModal({ isOpen, onClose, notification }) {
  if (!isOpen || !notification) return null;

  const data = notification.data || {};
  const isAttendance = data.type === 'attendance_approval' || data.type === 'attendance_absence';
  const isViolation = data.type === 'violation';

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      if (ts.toDate) return ts.toDate().toLocaleString('vi-VN');
      if (ts.toMillis) return new Date(ts.toMillis()).toLocaleString('vi-VN');
      return new Date(ts).toLocaleString('vi-VN');
    } catch {
      return '';
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 className="text-xl font-bold">Chi tiết thông báo</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        
        <div className="modal-body">
          <Card>
            <CardBody>
              <div style={{ marginBottom: '16px' }}>
                <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{notification.message}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Lúc: {formatTimestamp(notification.createdAt)}
                </div>
              </div>

              {isAttendance && (
                <div className="detail-info">
                  <div className="info-row">
                    <span className="text-muted"><User size={16} className="inline mr-1"/> Học sinh:</span>
                    <span className="font-medium text-dark">{data.studentName} - Lớp {data.className}</span>
                  </div>
                  <div className="info-row">
                    <span className="text-muted"><Calendar size={16} className="inline mr-1"/> Buổi nghỉ:</span>
                    <span className="font-medium text-dark">{data.session} - {data.date}</span>
                  </div>
                  <div className="info-row">
                    <span className="text-muted"><Info size={16} className="inline mr-1"/> Trạng thái:</span>
                    <span className={`font-medium ${data.status === 'absent_p' ? 'text-success' : 'text-danger'}`}>
                      {data.status === 'absent_p' ? 'Có phép' : 'Không phép'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="text-muted"><User size={16} className="inline mr-1"/> Người cập nhật:</span>
                    <span className="font-medium text-dark">{data.updatedBy || 'Hệ thống'}</span>
                  </div>
                  
                  {data.proofImage && (
                    <div className="mt-4">
                      <p className="font-medium text-dark mb-2"><Camera size={16} className="inline mr-1"/> Ảnh minh chứng:</p>
                      <img 
                        src={data.proofImage} 
                        alt="Minh chứng" 
                        style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {isViolation && (
                <div className="detail-info">
                  <div className="info-row">
                    <span className="text-muted"><User size={16} className="inline mr-1"/> Học sinh:</span>
                    <span className="font-medium text-dark">{data.studentName} - Lớp {data.className}</span>
                  </div>
                  <div className="info-row">
                    <span className="text-muted"><Calendar size={16} className="inline mr-1"/> Ngày vi phạm:</span>
                    <span className="font-medium text-dark">{data.date}</span>
                  </div>
                  <div className="info-row">
                    <span className="text-muted"><Info size={16} className="inline mr-1"/> Vi phạm:</span>
                    <span className="font-medium text-danger">{data.violationName}</span>
                  </div>
                  <div className="info-row">
                    <span className="text-muted"><User size={16} className="inline mr-1"/> Người ghi nhận:</span>
                    <span className="font-medium text-dark">{data.createdBy || 'Hệ thống'}</span>
                  </div>
                </div>
              )}

            </CardBody>
          </Card>
        </div>
        
        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose} fullWidth>
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
