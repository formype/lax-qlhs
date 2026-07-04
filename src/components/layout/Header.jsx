import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listenToNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationModal } from '../ui/NotificationModal';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import './Header.css';

export function Header({ title }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Unread count
  const unreadCount = notifications.filter(n => !n.readBy?.includes(user?.id)).length;

  useEffect(() => {
    // Request permission for local notifications if on native platform
    const requestPermissions = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const permStatus = await LocalNotifications.checkPermissions();
          if (permStatus.display !== 'granted') {
            await LocalNotifications.requestPermissions();
          }
        } catch (e) {
          console.error("Local notification error", e);
        }
      }
    };
    requestPermissions();

    if (!user || !user.role) return;
    
    const isAdmin = user.role.includes('admin') || user.role.includes('vip-admin');
    const isTeacher = user.role.includes('giaovien') && user.teacherClass?.name;
    
    if (!isAdmin && !isTeacher) return;

    // Track the initial load to prevent spamming notifications for old messages
    let initialLoad = true;
    let initialLoadTime = Date.now();
    
    const userClass = user.teacherClass?.name || null;

    const unsubscribe = listenToNotifications(user.role, userClass, (newNotifs) => {
      setNotifications(newNotifs);

      // Only show push notifications for messages that arrive AFTER initial load
      if (!initialLoad) {
        newNotifs.forEach(notif => {
          if (notif.createdAt > initialLoadTime && !notif.readBy?.includes(user.id)) {
            // Trigger native notification
            if (Capacitor.isNativePlatform()) {
              LocalNotifications.schedule({
                notifications: [
                  {
                    title: "Có thông báo mới",
                    body: notif.message,
                    id: new Date().getTime(),
                    schedule: { at: new Date(Date.now() + 100) },
                    sound: null,
                    attachments: null,
                    actionTypeId: "",
                    extra: null
                  }
                ]
              });
            } else {
              // Browser fallback toast could go here if we had a toast system
              // For now, in-app Bell icon is enough
            }
          }
        });
      }
      initialLoad = false;
    });

    return () => unsubscribe();
  }, [user]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    setShowDropdown(!showDropdown);
  };

  const handleMarkAsRead = async (notifId, e) => {
    e.stopPropagation();
    await markNotificationAsRead(notifId, user.id);
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsAsRead(user.id);
  };

  const handleNotificationClick = async (notif) => {
    // 1. Mark as read
    if (!notif.readBy?.includes(user.id)) {
      await markNotificationAsRead(notif.id, user.id);
    }
    // 2. Close dropdown
    setShowDropdown(false);
    // 3. Show details modal if data exists
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

  return (
    <header className="app-header glass">
      <div className="header-title">{title}</div>
      
      {user && (user.role.includes('admin') || user.role.includes('vip-admin') || (user.role.includes('giaovien') && user.teacherClass?.name)) && (
        <div className="notification-wrapper" ref={dropdownRef}>
          <button className="icon-btn notification-btn" onClick={handleToggle}>
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
          
          {showDropdown && (
            <div className="notification-dropdown">
              <div className="notification-header">
                <h3>Thông báo</h3>
                {unreadCount > 0 && (
                  <span className="text-xs text-primary">{unreadCount} chưa đọc</span>
                )}
              </div>
              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="notification-empty">Không có thông báo nào.</div>
                ) : (
                  notifications.map(notif => {
                    const isRead = notif.readBy?.includes(user.id);
                    return (
                      <div 
                        key={notif.id} 
                        className={`notification-item ${isRead ? 'read' : 'unread'} cursor-pointer`}
                        onClick={() => handleNotificationClick(notif)}
                      >
                        <div className="notification-content">
                          <p>{notif.message}</p>
                          <span className="notification-time">
                            <Clock size={12} className="mr-1" />
                            {formatTime(notif.createdAt)}
                          </span>
                        </div>
                        {!isRead && (
                          <button 
                            className="mark-read-btn" 
                            title="Đánh dấu đã đọc"
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                          >
                            <Check size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="notification-footer" style={{ flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                {unreadCount > 0 && (
                  <button className="mark-all-btn" onClick={handleMarkAllAsRead}>
                    <Check size={16} className="mr-1" /> Đánh dấu đã đọc toàn bộ
                  </button>
                )}
                <button 
                  className="mark-all-btn" 
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => { setShowDropdown(false); navigate('/notifications'); }}
                >
                  Xem tất cả thông báo
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      <NotificationModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        notification={selectedNotification}
      />
    </header>
  );
}
