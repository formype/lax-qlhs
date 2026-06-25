import React from 'react';
import './Button.css';

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  fullWidth = false,
  ...props 
}) {
  const baseClass = 'btn';
  const variantClass = `btn-${variant}`;
  const sizeClass = `btn-${size}`;
  const widthClass = fullWidth ? 'btn-full' : '';

  return (
    <button 
      className={`${baseClass} ${variantClass} ${sizeClass} ${widthClass} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
}
