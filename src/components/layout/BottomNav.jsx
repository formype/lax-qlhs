import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, LayoutGrid, PlusCircle, Search, Settings } from 'lucide-react';
import './BottomNav.css';

export function BottomNav() {
  const navItems = [
    { path: '/', label: 'Tổng quan', icon: Home },
    { path: '/features', label: 'Tính năng', icon: LayoutGrid },
    { path: '/settings', label: 'Cài đặt', icon: Settings }
  ];

  return (
    <div className="bottom-nav glass">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink 
            key={item.path} 
            to={item.path} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={22} className="nav-icon" />
            <span className="nav-label">{item.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}
