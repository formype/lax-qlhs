import React from 'react';
import './Input.css';

export function Input({ label, error, className = '', fullWidth = true, ...props }) {
  return (
    <div className={`input-group ${fullWidth ? 'full-width' : ''} ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <input className={`input-field ${error ? 'input-error' : ''}`} {...props} />
      {error && <span className="input-error-text">{error}</span>}
    </div>
  );
}

export function Select({ label, error, options = [], className = '', fullWidth = true, ...props }) {
  return (
    <div className={`input-group ${fullWidth ? 'full-width' : ''} ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <select className={`input-field ${error ? 'input-error' : ''}`} {...props}>
        {options.map((opt, idx) => (
          <option key={idx} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <span className="input-error-text">{error}</span>}
    </div>
  );
}
