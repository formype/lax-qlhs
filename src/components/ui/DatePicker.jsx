import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { Input } from './Input';

export function MonthPicker({ value, onChange, placeholder = "MM/YYYY", style = {} }) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 2) {
        setText(`${parts[1]}/${parts[0]}`);
      }
    } else {
      setText('');
    }
  }, [value]);

  const handleChange = (e) => {
    let val = e.target.value;
    val = val.replace(/[^0-9/]/g, '');
    
    if (val.length === 2 && !val.includes('/') && text.length < val.length) {
      val = val + '/';
    }
    
    if (val.length > 7) val = val.substring(0, 7);
    
    setText(val);
    
    if (val.length === 7) {
      const [m, y] = val.split('/');
      if (m && y && m.length === 2 && y.length === 4) {
        onChange(`${y}-${m}`);
      }
    }
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, ...style }}>
      <Input 
        value={text} 
        onChange={handleChange} 
        placeholder={placeholder}
        style={{ marginBottom: 0, paddingRight: '40px', width: '100%' }}
      />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Calendar size={18} className="text-muted" />
        <input 
          type="month"
          value={value}
          onChange={e => {
            if (e.target.value) {
                onChange(e.target.value);
            }
          }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}

export function DayPicker({ value, onChange, placeholder = "DD/MM/YYYY", style = {} }) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        setText(`${parts[2]}/${parts[1]}/${parts[0]}`);
      }
    } else {
      setText('');
    }
  }, [value]);

  const handleChange = (e) => {
    let val = e.target.value;
    val = val.replace(/[^0-9/]/g, '');
    
    if (val.length === 2 && !val.includes('/') && text.length < val.length) {
      val = val + '/';
    } else if (val.length === 5 && val.split('/').length === 2 && text.length < val.length) {
      val = val + '/';
    }

    if (val.length > 10) val = val.substring(0, 10);
    
    setText(val);
    
    if (val.length === 10) {
      const parts = val.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        if (d.length === 2 && m.length === 2 && y.length === 4) {
          onChange(`${y}-${m}-${d}`);
        }
      }
    }
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, ...style }}>
      <Input 
        value={text} 
        onChange={handleChange} 
        placeholder={placeholder}
        style={{ marginBottom: 0, paddingRight: '40px', width: '100%' }}
      />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Calendar size={18} className="text-muted" />
        <input 
          type="date"
          value={value}
          onChange={e => {
            if (e.target.value) {
                onChange(e.target.value);
            }
          }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
