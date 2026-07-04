import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { useAuth } from '../contexts/AuthContext';
import { getNotificationsPaginated, markNotificationAsRead, markAllNotificationsAsRead } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Bell, Check, Clock, Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { NotificationModal } from '../components/ui/NotificationModal';

export function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchNotifications = async (isLoadMore = false) => {
    if (!user || !user.role) return;
    
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    const currentLastDoc = isLoadMore ? lastDoc : null;
    const userClass = user.teacherClass || null;
    const userName = user.fullName || user.username;
    const result = await getNotificationsPaginated(user.role, userClass, userName, currentLastDoc, 20);
    
    if (isLoadMore) {
      setNotifications(prev => [...prev, ...result.notifications]);
    } else {
      setNotifications(result.notifications);
    }
    
    setLastDoc(result.lastDoc);
    setHasMore(result.hasMore);
    
    if (isLoadMore) {
      setLoadingMore(false);
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  const handleMarkAsRead = async (notifId, e) => {
    if (e) e.stopPropagation();
    const success = await markNotificationAsRead(notifId, user.id);
    if (success) {
      setNotifications(prev => prev.map(n => {
        if (n.id === notifId) {
          return { ...n, readBy: [...(n.readBy || []), user.id] };
        }
        return n;
      }));
    }
  };

  const handleMarkAllAsRead = async () => {
    const success = await markAllNotificationsAsRead(user.id);
    if (success) {
      setNotifications(prev => prev.map(n => ({
        ...n,
        readBy: [...(n.readBy || []), user.id]
      })));
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.readBy?.includes(user.id)) {
      await handleMarkAsRead(notif.id);
    }
    if (notif.data && Object.keys(notif.data).length > 0) {
      setSelectedNotification(notif);
      setIsModalOpen(true);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    try {
      return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: vi });
    } catch {
      return '';
    }
  };

  const unreadCount = notifications.filter(n => !n.readBy?.includes(user?.id)).length;

  return (
    <div className="page-container">
      <Header title="Tất cả thông báo" />
      
      <main className="main-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => navigate(-1)} className="icon-btn" style={{ background: 'var(--card-bg)' }}>
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-bold m-0" style={{ color: 'var(--text-primary)' }}>Lịch sử thông báo</h2>
          </div>
          
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllAsRead}>
              <Check size={16} className="mr-2" /> Đánh dấu tất cả đã đọc
            </Button>
          )}
        </div>

        <Card>
          <CardBody>
            {loading ? (
              <div className="flex-center py-8">
                <Loader2 className="animate-spin text-primary" size={32} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <Bell size={48} className="mx-auto mb-3" style={{ opacity: 0.2 }} />
                <p>Bạn chưa có thông báo nào.</p>
              </div>
            ) : (
              <div className="notification-list-full">
                {notifications.map(notif => {
                  const isRead = notif.readBy?.includes(user?.id);
                  return (
                    <div 
                      key={notif.id} 
                      className={`notification-item ${isRead ? 'read' : 'unread'} cursor-pointer p-4 mb-2 rounded border`}
                      onClick={() => handleNotificationClick(notif)}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: isRead ? 'var(--card-bg)' : 'rgba(99, 102, 241, 0.05)',
                        borderColor: isRead ? 'var(--border-color)' : 'rgba(99, 102, 241, 0.2)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div className="notification-content">
                        <p style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                          {notif.message}
                        </p>
                        <span className="notification-time" style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <Clock size={14} className="mr-1" />
                          {formatTime(notif.createdAt)}
                        </span>
                      </div>
                      {!isRead && (
                        <button 
                          className="mark-read-btn" 
                          onClick={(e) => handleMarkAsRead(notif.id, e)}
                          title="Đánh dấu đã đọc"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--primary)',
                            padding: '8px',
                            cursor: 'pointer',
                            borderRadius: '50%'
                          }}
                        >
                          <Check size={20} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {hasMore && !loading && (
              <div className="text-center mt-6">
                <Button variant="secondary" onClick={() => fetchNotifications(true)} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                  {loadingMore ? 'Đang tải...' : 'Tải thêm thông báo cũ'}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </main>
      
      <NotificationModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        notification={selectedNotification}
      />
    </div>
  );
}
