import React from 'react';
import './Card.css';

export function Card({ children, className = '', onClick }) {
  return (
    <div className={`card ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`card-header ${className}`}>{children}</div>;
}

export function CardBody({ children, className = '' }) {
  return <div className={`card-body ${className}`}>{children}</div>;
}
