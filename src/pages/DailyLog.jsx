import React, { useState, useRef, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { addDailyLog, getStudentByCode, createNotification } from '../lib/firebase';
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

  const [studentWarning, setStudentWarning] = useState('');
  const [searchingStudent, setSearchingStudent] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const [evidenceList, setEvidenceList] = useState([]); 

  const [formData, setFormData] = useState({
    mahs: '',
    hoten: '',
    tenlop: '',
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

  const handleMahsChange = async (e) => {
    const code = e.target.value.toUpperCase();
    setFormData(prev => ({ ...prev, mahs: code, hoten: '', tenlop: '' }));
    setStudentWarning('');
    
    if (code.length >= 4) {
      setSearchingStudent(true);
      try {
        const student = await getStudentByCode(code);
        if (student) {
          setFormData(prev => ({
            ...prev,
            hoten: student.hoten,
            tenlop: student.tenlop
          }));
        } else {
          setStudentWarning('Không tìm thấy học sinh với mã này');
        }
      } catch (err) {
        console.error("Error finding student:", err);
      } finally {
        setSearchingStudent(false);
      }
    }
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
    if (!formData.mahs || !formData.hoten || !formData.tenlop || !formData.noidung) {
      alert('Vui lòng điền đầy đủ các thông tin bắt buộc (Mã HS, Nội dung)');
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
          message: `Sự việc liên quan đến HS ${formData.hoten} (${formData.tenlop}) đã được ghi nhận.`,
          type: 'daily_log',
          relatedId: res.id,
          targetRoles: ['admin', 'vip-admin', 'giamthi'],
          targetClasses: [formData.tenlop],
          createdBy: user?.displayName || user?.email || 'Unknown',
        });

        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setFormData({
            mahs: '',
            hoten: '',
            tenlop: '',
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
      <div className="add-violation-content">
        <div className="main-form">
          <Card>
            <CardBody>
              <form onSubmit={handleSubmit} className="form-grid">
                
                <div className="form-group row-span-2">
                  <label>Mã học sinh <span className="required">*</span></label>
                  <Input 
                    type="text" 
                    name="mahs"
                    placeholder="Nhập mã HS..." 
                    value={formData.mahs}
                    onChange={handleMahsChange}
                    required
                  />
                  {searchingStudent && <p className="help-text">Đang tìm kiếm...</p>}
                  {studentWarning && <p className="error-text">{studentWarning}</p>}
                </div>

                <div className="form-group">
                  <label>Họ và tên</label>
                  <Input 
                    type="text" 
                    value={formData.hoten}
                    disabled
                    className="disabled-input"
                  />
                </div>

                <div className="form-group">
                  <label>Lớp</label>
                  <Input 
                    type="text" 
                    value={formData.tenlop}
                    disabled
                    className="disabled-input"
                  />
                </div>

                <div className="form-group">
                  <label>Ngày ghi nhận <span className="required">*</span></label>
                  <Input 
                    type="date" 
                    name="ngay"
                    value={formData.ngay}
                    disabled
                    className="disabled-input"
                  />
                </div>

                <div className="form-group">
                  <label>Buổi <span className="required">*</span></label>
                  <Select 
                    name="buoi"
                    value={formData.buoi}
                    disabled
                    className="disabled-input"
                    options={[
                      {value: 'Sáng', label: 'Sáng'},
                      {value: 'Chiều', label: 'Chiều'}
                    ]}
                  />
                </div>

                <div className="form-group full-width">
                  <label>Nội dung sự việc <span className="required">*</span></label>
                  <textarea 
                    name="noidung"
                    className="input textarea"
                    placeholder="Mô tả chi tiết sự việc..."
                    value={formData.noidung}
                    onChange={handleChange}
                    rows={4}
                    required
                  />
                </div>
                
                <div className="form-group full-width">
                  <label>Minh chứng (Hình ảnh)</label>
                  <div className="upload-options">
                    <button type="button" className="btn btn-secondary flex-center" onClick={() => cameraInputRef.current?.click()}>
                      <Camera size={18} className="mr-2" /> Chụp ảnh
                    </button>
                    <button type="button" className="btn btn-secondary flex-center" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={18} className="mr-2" /> Tải ảnh lên
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

                <div className="form-actions full-width" style={{ marginTop: '16px' }}>
                  <Button type="button" variant="secondary" onClick={() => navigate('/dashboard')}>
                    Hủy bỏ
                  </Button>
                  <Button type="submit" variant="primary" isLoading={loading} disabled={success}>
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
      </div>
    </>
  );
}
