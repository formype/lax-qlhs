import React, { useState, useRef, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { addDailyLog, createNotification } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Upload, Camera, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './AddViolation.css';

export function DailyLog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const getLocalISODate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getCurrentSession = () => {
    const hours = new Date().getHours();
    return hours < 12 ? 'Sáng' : 'Chiều';
  };

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  
  const [uploading, setUploading] = useState(false);
  const [evidenceList, setEvidenceList] = useState([]); 

  const [formData, setFormData] = useState({
    noidung: '',
    ngay: getLocalISODate(),
    buoi: getCurrentSession()
  });
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user?.role?.includes('giaovien') && !user?.role?.includes('giamthi') && !user?.role?.includes('admin') && !user?.role?.includes('vip-admin')) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        setEvidenceList(prev => [...prev, {
          name: file.name,
          localUrl: dataUrl,
          type: 'image'
        }]);
        setUploading(false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    if (e.target.value) e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.noidung) {
      alert('Vui lòng điền đầy đủ các thông tin bắt buộc (Nội dung)');
      return;
    }
    setLoading(true);
    
    try {
      const images = evidenceList.map(e => e.localUrl);
      const logData = {
        ...formData,
        images,
        createdBy: user?.displayName || user?.email || 'Unknown',
        createdById: user?.id || null
      };
      
      const res = await addDailyLog(logData);
      
      if (res.success) {
        await createNotification({
          title: 'Ghi nhận sự việc mới',
          message: "Sự việc mới đã được ghi nhận trong ngày.",
          type: 'daily_log',
          relatedId: res.id,
          targetRoles: ['admin', 'vip-admin', 'giamthi'],
          createdBy: user?.displayName || user?.email || 'Unknown',
        });

        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setFormData({
            noidung: '',
            ngay: getLocalISODate(),
            buoi: getCurrentSession()
          });
          setEvidenceList([]);
        }, 2500);
      } else {
        alert("Lỗi: " + res.error);
      }
    } catch (error) {
      console.error(error);
      alert("Đã xảy ra lỗi hệ thống.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header title="Ghi nhận trong ngày" />
      <div className="form-content">
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="violation-form">
              
              <div className="input-group full-width blurred-group">
                <label className="input-label required-label">Ngày ghi nhận</label>
                <input 
                  type="date" 
                  name="ngay"
                  className="input-field disabled-field"
                  value={formData.ngay}
                  disabled
                />
              </div>

              <div className="input-group full-width blurred-group">
                <label className="input-label required-label">Buổi</label>
                <input 
                  type="text" 
                  name="buoi"
                  className="input-field disabled-field"
                  value={formData.buoi}
                  disabled
                />
              </div>

              <div className="input-group full-width">
                <label className="input-label required-label">Nội dung sự việc</label>
                <textarea 
                  name="noidung"
                  className="input-field textarea-field"
                  placeholder="Mô tả chi tiết sự việc..."
                  value={formData.noidung}
                  onChange={handleChange}
                  rows={4}
                  required
                />
              </div>
              
              <div className="input-group full-width">
                <label className="input-label">Minh chứng (Hình ảnh)</label>
                <div className="upload-actions-grid">
                  <button type="button" className="upload-btn camera-upload" onClick={() => cameraInputRef.current?.click()}>
                    <Camera size={18} /> Chụp ảnh
                  </button>
                  <button type="button" className="upload-btn primary-upload" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={18} /> Tải ảnh lên
                  </button>
                  
                  <input type="file" accept="image/*" capture="environment" style={{display: 'none'}} ref={cameraInputRef} onChange={handleImageUpload} />
                  <input type="file" accept="image/*" style={{display: 'none'}} ref={fileInputRef} onChange={handleImageUpload} />
                </div>
                
                {uploading && <div className="mt-2 text-sm text-muted">Đang xử lý ảnh...</div>}
                
                {evidenceList.length > 0 && (
                  <div className="evidence-preview-container">
                    {evidenceList.map((item, index) => (
                      <div key={index} className="evidence-preview-item">
                        <img src={item.localUrl} alt={item.name} />
                        <button type="button" className="remove-evidence-btn" onClick={() => {
                          setEvidenceList(prev => prev.filter((_, i) => i !== index));
                        }}>
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-actions full-width" style={{ marginTop: '16px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
                <Button type="button" variant="secondary" onClick={() => navigate('/dashboard')} style={{ flex: 1 }}>
                  Hủy bỏ
                </Button>
                <Button type="submit" variant="primary" isLoading={loading} disabled={success} style={{ flex: 1 }}>
                  {success ? (
                    <span className="flex-center"><CheckCircle size={18} className="mr-2"/> Đã ghi nhận</span>
                  ) : (
                    <span className="flex-center"><FileText size={18} className="mr-2"/> Lưu ghi nhận</span>
                  )}
                </Button>
              </div>

            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
