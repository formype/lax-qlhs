import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CloudDownload, Save, RefreshCw, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSystemConfig, updateSystemConfig } from '../lib/firebase';
import { APP_VERSION } from '../config';

export function ManageUpdates() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    latestVersion: '',
    downloadLink: ''
  });

  useEffect(() => {
    if (user?.role !== 'vip-admin') {
      alert('Bạn không có quyền truy cập trang này.');
      navigate('/');
      return;
    }
    loadConfig();
  }, [user, navigate]);

  const loadConfig = async () => {
    setLoading(true);
    const config = await getSystemConfig();
    setFormData({
      latestVersion: config.latestVersion || APP_VERSION,
      downloadLink: config.downloadLink || ''
    });
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formData.latestVersion || !formData.downloadLink) {
      alert("Vui lòng nhập đầy đủ Phiên bản mới nhất và Đường dẫn tải xuống.");
      return;
    }

    setSaving(true);
    const res = await updateSystemConfig(formData);
    setSaving(false);

    if (res.success) {
      alert("Cập nhật thông tin phiên bản thành công!");
    } else {
      alert("Lưu thất bại: " + res.error);
    }
  };

  return (
    <>
      <Header title="Quản lý cập nhật" />
      <div className="main-content" style={{ padding: '16px', paddingBottom: '100px' }}>
        <p className="text-muted" style={{ marginTop: '-12px', marginBottom: '24px' }}>Phát hành phiên bản mới cho ứng dụng</p>
        
        {loading ? (
          <p className="text-center text-muted">Đang tải cấu hình...</p>
        ) : (
          <Card>
            <CardBody>
              <div className="flex-row gap-3 mb-4" style={{ alignItems: 'flex-start' }}>
                <CloudDownload size={24} className="text-primary mt-1" />
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-color)' }}>Thông tin phiên bản</h3>
                  <p className="text-muted text-sm mt-1 mb-0">Cập nhật version và link tải xuống</p>
                </div>
              </div>

              <div className="flex-row gap-4 mb-4 flex-wrap">
                <div className="form-group flex-1" style={{ minWidth: '200px' }}>
                  <label className="input-label" style={{ fontWeight: 600 }}>Phiên bản hiện tại (Local)</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={APP_VERSION}
                    disabled
                    style={{ background: 'var(--bg-app)', color: 'var(--text-muted)' }}
                  />
                </div>
                
                <div className="form-group flex-1" style={{ minWidth: '200px' }}>
                  <label className="input-label" style={{ fontWeight: 600 }}>Phiên bản mới nhất (Server)</label>
                  <div className="input-with-icon" style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                      <RefreshCw size={16} />
                    </div>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={formData.latestVersion}
                      onChange={e => setFormData({...formData, latestVersion: e.target.value})}
                      placeholder="Ví dụ: 1.0.1"
                      style={{ paddingLeft: '36px' }}
                    />
                  </div>
                  <p className="text-xs text-muted mt-2">Nhập số phiên bản mới để kích hoạt yêu cầu cập nhật cho người dùng cũ.</p>
                </div>
              </div>

              <div className="form-group mb-4">
                <label className="input-label" style={{ fontWeight: 600 }}>Đường dẫn tải xuống (Link Download)</label>
                <div className="input-with-icon" style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <LinkIcon size={16} />
                  </div>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={formData.downloadLink}
                    onChange={e => setFormData({...formData, downloadLink: e.target.value})}
                    placeholder="https://..."
                    style={{ paddingLeft: '36px' }}
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} fullWidth>
                <Save size={18} className="mr-2" />
                {saving ? "Đang lưu..." : "Lưu thông tin cập nhật"}
              </Button>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
