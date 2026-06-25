import React from 'react';
import { Bell } from 'lucide-react';
import './Header.css';

export function Header({ title }) {
  return (
    <header className="app-header glass">
      <div className="header-title">{title}</div>
      <button className="icon-btn">
        <Bell size={20} />
      </button>
    </header>
  );
}
