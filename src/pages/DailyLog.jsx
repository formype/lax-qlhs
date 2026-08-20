import React, { useState, useRef, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { addDailyLog, createNotification } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Upload, Camera, FileText, Trash2, ExternalLink } from 'lucide-react';
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

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > MAX_FILE_SIZE) {
        const sizeMB = (files[i].size / (1024 * 1024)).toFixed(1);
        alert(`Tệp "${files[i].name}" quá lớn (${sizeMB}MB). Vui lòng chọn tệp nhỏ hơn 5MB.`);
        e.target.value = '';
        return;
      }
    }

    setUploading(true);
    const newEvidences = [];
    const totalFiles = files.length;
    const appsScriptUrl = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbwsJP68m0xVqnKZVjw-U8_EL_EQPZLfhrZxV4M-xicykesYD25wN1PcihVVLclxwtNLHw/exec";

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      const localUrl = URL.createObjectURL(file);
      const fileType = file.type || '';
      let finalDriveUrl = '';
      
      if (appsScriptUrl && appsScriptUrl.trim()) {
        try {
          const base64Promise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (fileType.startsWith('image/')) {
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const MAX_WIDTH = 1200;
                  const MAX_HEIGHT = 1200;
                  let width = img.width;
                  let height = img.height;
                  
                  if (width > height) {
                    if (width > MAX_WIDTH) {
                      height *= MAX_WIDTH / width;
                      width = MAX_WIDTH;
                    }
                  } else {
                    if (height > MAX_HEIGHT) {
                      width *= MAX_HEIGHT / height;
                      height = MAX_HEIGHT;
                    }
                  }
                  
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(img, 0, 0, width, height);
                  
                  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                  resolve(dataUrl.split(',')[1]);
                };
                img.onerror = () => resolve(event.target.result.split(',')[1]);
                img.src = event.target.result;
              } else {
                resolve(event.target.result.split(',')[1]);
              }
            };
            reader.onerror = () => reject(new Error("Lỗi đọc file"));
            reader.readAsDataURL(file);
          });
          
          const base64Data = await base64Promise;

          const response = await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
              filename: file.name || `Upload_${Date.now()}`,
              mimeType: fileType,
              base64: base64Data,
              folderId: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || '1Et-Jz9EiFoFpGHp139dmf504ZDFe9yhD'
            })
          });
          
          const responseText = await response.text();
          let result;
          try {
            result = JSON.parse(responseText);
          } catch (jsonError) {
            throw new Error("Apps Script returned invalid HTML/text.");
          }

          if (result.result === 'success' || result.success === true || result.url) {
            finalDriveUrl = result.url;
          } else {
            throw new Error(result.error || 'Lỗi không xác định từ Apps Script');
          }
        } catch (error) {
          alert("Không thể upload minh chứng lên Google Drive. Lỗi: " + error.message);
          setUploading(false);
          if (e.target.value) e.target.value = '';
          return;
        }
      } else {
        alert("Chưa cấu hình URL của Google Apps Script trong .env.local!");
        setUploading(false);
        if (e.target.value) e.target.value = '';
        return;
      }
      
      newEvidences.push({
        name: file.name || `Tài_liệu_${Date.now()}`,
        driveUrl: finalDriveUrl,
        localUrl,
        type: fileType
      });
    }

    setEvidenceList(prev => [...prev, ...newEvidences]);
    setUploading(false);
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
      const images = evidenceList.map(e => e.driveUrl);
      const logData = {
        ...formData,
        images,
        createdBy: user?.fullName || user?.name || user?.hoten || user?.displayName || user?.username || 'Unknown',
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
          createdBy: user?.fullName || user?.name || user?.hoten || user?.displayName || user?.username || 'Unknown',
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
                  
                  <input type="file" accept="image/*" capture="environment" style={{display: 'none'}} ref={cameraInputRef} onChange={handleFileUpload} />
                  <input type="file" accept="image/*" style={{display: 'none'}} ref={fileInputRef} onChange={handleFileUpload} />
                </div>
                
                {uploading && <div className="mt-2 text-sm text-muted">Đang xử lý ảnh...</div>}
                
                {evidenceList.length > 0 && (
                  <div className="evidence-list-container">
                    {evidenceList.map((item, index) => {
                      const isImage = item.type.startsWith('image/');
                      return (
                        <div key={index} className="evidence-item-card">
                          <div className="evidence-preview-wrapper" onClick={() => window.open(item.localUrl, '_blank')}>
                            {isImage ? (
                              <img src={item.localUrl} alt="Evidence preview" className="evidence-preview-thumb" />
                            ) : (
                              <FileText size={22} color="var(--primary-color)" />
                            )}
                          </div>
                          <div className="evidence-details">
                            <span className="evidence-name">{item.name}</span>
                            <a 
                              href={item.driveUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="drive-link"
                            >
                              <ExternalLink size={12} style={{ marginRight: '4px' }} />
                              Xem minh chứng
                            </a>
                          </div>
                          <button
                            type="button"
                            className="delete-evidence-btn"
                            onClick={() => {
                              setEvidenceList(prev => prev.filter((_, i) => i !== index));
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="form-actions full-width" style={{ marginTop: '16px' }}>
                <Button type="submit" variant="primary" isLoading={loading} disabled={success} fullWidth>
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
