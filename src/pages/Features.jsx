import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { School, UserRoundPlus, CalendarCheck, FileWarning, UsersRound, ClipboardList, CheckSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Features.css';

const FEATURE_SECTIONS = [
  {
    title: 'Nhập thông tin',
    icon: '📝',
    items: [
      {
        label: 'Nhập thông tin lớp',
        icon: School,
        color: '#0ea5e9',
        bg: 'rgba(14, 165, 233, 0.08)',
        border: 'rgba(14, 165, 233, 0.2)',
        shadow: 'rgba(14, 165, 233, 0.15)',
        path: '/classes'
      },
      {
        label: 'Nhập thông tin học sinh',
        icon: UserRoundPlus,
        color: '#8b5cf6',
        bg: 'rgba(139, 92, 246, 0.08)',
        border: 'rgba(139, 92, 246, 0.2)',
        shadow: 'rgba(139, 92, 246, 0.15)',
        path: '/students'
      },

      {
        label: 'Nhập thông tin vi phạm',
        icon: FileWarning,
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.08)',
        border: 'rgba(245, 158, 11, 0.2)',
        shadow: 'rgba(245, 158, 11, 0.15)',
        path: '/add'
      },
      {
        label: 'Điểm danh',
        icon: CheckSquare,
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.08)',
        border: 'rgba(16, 185, 129, 0.2)',
        shadow: 'rgba(16, 185, 129, 0.15)',
        path: '/attendance'
      },
    ]
  },
  {
    title: 'Quản lý',
    icon: '📋',
    items: [
      {
        label: 'Danh sách học sinh',
        icon: UsersRound,
        color: '#6366f1',
        bg: 'rgba(99, 102, 241, 0.08)',
        border: 'rgba(99, 102, 241, 0.2)',
        shadow: 'rgba(99, 102, 241, 0.15)',
        path: '/student-list'
      },
      {
        label: 'Chuyên cần',
        icon: CalendarCheck,
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.08)',
        border: 'rgba(16, 185, 129, 0.2)',
        shadow: 'rgba(16, 185, 129, 0.15)',
        path: '/attendance-search'
      },
      {
        label: 'Danh sách vi phạm',
        icon: ClipboardList,
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.08)',
        border: 'rgba(239, 68, 68, 0.2)',
        shadow: 'rgba(239, 68, 68, 0.15)',
        path: '/search'
      },
    ]
  }
];

export function Features() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <>
      <Header title="Tính năng" />
      <div className="features-content">
        {FEATURE_SECTIONS.map((section) => {
          if (section.title === 'Nhập thông tin' && user?.role === 'giaovien') {
            return null;
          }
          return (
            <div key={section.title} className="feature-section">
              <div className="feature-section-header">
                <span className="feature-section-icon">{section.icon}</span>
                <h3 className="feature-section-title">{section.title}</h3>
              </div>
              <div className="feature-grid">
              {section.items.map((item) => {
                if (user?.role === 'giaovien' && (
                  item.path === '/add' || 
                  item.path === '/attendance' || 
                  item.path === '/classes' || 
                  item.path === '/students'
                )) {
                  return null;
                }
                if (user?.role === 'giamthi' && (
                  item.path === '/classes' || 
                  item.path === '/students'
                )) {
                  return null;
                }
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className="feature-card"
                    onClick={() => navigate(item.path)}
                  >
                    <div
                      className="feature-icon-wrapper"
                      style={{ 
                        backgroundColor: item.bg,
                        borderColor: item.border,
                        boxShadow: `0 6px 16px -4px ${item.shadow}`
                      }}
                    >
                      <Icon size={26} color={item.color} strokeWidth={1.7} />
                    </div>
                    <span className="feature-card-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </>
  );
}
