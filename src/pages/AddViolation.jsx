import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { addViolation, getStudentByCode, fetchViolationTypes, addCustomViolationType } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Upload, Camera, FileText, Trash2, ExternalLink, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './AddViolation.css';

export function AddViolation() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [violationTypes, setViolationTypes] = useState([]);
  const [studentWarning, setStudentWarning] = useState('');
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [customViolation, setCustomViolation] = useState('');
  const [isCustomSelected, setIsCustomSelected] = useState(false);
  
  // Upload states
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [evidenceList, setEvidenceList] = useState([]); // Array of { name: string, driveUrl: string, localUrl: string, type: string }

  const [formData, setFormData] = useState({
    mahs: '',
    hoten: '',
    tenlop: '',
    loaivipham: '',
    noidung: '',
    ngayvipham: new Date().toISOString().slice(0, 10),
    trangthai: 'Đã xử lý', // Default to 'Đã xử lý'
  });
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const dateInputRef = useRef(null);

  // Load violation types on mount
  useEffect(() => {
    fetchViolationTypes().then(types => {
      setViolationTypes(types);
      if (types.length > 0) {
        setFormData(f => ({ ...f, loaivipham: types[0].value }));
      }
    });
  }, []);

  // Format date from yyyy-mm-dd to dd/mm/yyyy
  const formatDateToVN = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  // Handle Student ID Lookup
  const handleStudentIdChange = async (e) => {
    const mahsVal = e.target.value;
    setFormData(f => ({ ...f, mahs: mahsVal }));

    if (!mahsVal.trim()) {
      setStudentWarning('');
      setFormData(f => ({ ...f, hoten: '', tenlop: '' }));
      return;
    }

    setSearchingStudent(true);
    const result = await getStudentByCode(mahsVal);
    setSearchingStudent(false);

    if (result.success) {
      setStudentWarning('');
      setFormData(f => ({
        ...f,
        hoten: result.data.hoten,
        tenlop: result.data.tenlop
      }));
    } else {
      setStudentWarning('Không tồn tại học sinh có mã học sinh này');
      setFormData(f => ({ ...f, hoten: '', tenlop: '' }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(f => ({ ...f, [name]: value }));

    if (name === 'loaivipham') {
      setIsCustomSelected(value === 'Khác');
    }
  };

  // Google Drive Simulation & Real Upload
  const handleFileUpload = async (e, isCamera = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(10);

    const newEvidences = [];
    const totalFiles = files.length;
    const appsScriptUrl = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      const localUrl = URL.createObjectURL(file);
      const fileType = file.type || '';
      let finalDriveUrl = '';
      
      if (appsScriptUrl && appsScriptUrl.trim()) {
        try {
          // Convert file to Base64
          const reader = new FileReader();
          const base64Promise = new Promise((resolve) => {
            reader.onloadend = () => {
              // Strip the "data:*/*;base64," prefix to send pure base64 matching your script
              const pureBase64 = reader.result.split(',')[1];
              resolve(pureBase64);
            };
          });
          reader.readAsDataURL(file);
          const base64Data = await base64Promise;

          // Upload to personal Google Drive folder via Apps Script
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
              folderId: '1Et-Jz9EiFoFpGHp139dmf504ZDFe9yhD'
            })
          });
          
          const responseText = await response.text();
          let result;
          try {
            result = JSON.parse(responseText);
          } catch (jsonError) {
            console.error("Google Apps Script returned an invalid response (not JSON). Response text was:", responseText);
            throw new Error("Apps Script returned invalid HTML/text. Check script deployment permissions.");
          }

          if (result.result === 'success' || result.success === true || result.url) {
            finalDriveUrl = result.url;
          } else {
            console.error("Google Apps Script execution error:", result.error || result);
            throw new Error(result.error || 'Lỗi không xác định từ Apps Script');
          }
        } catch (error) {
          console.error("Upload Google Drive thất bại:", error);
          alert("Không thể upload minh chứng lên Google Drive. Vui lòng kiểm tra lại Google Apps Script (Lỗi: " + error.message + ").");
          setUploading(false);
          setUploadProgress(0);
          return; // Stop the upload process
        }
      } else {
        alert("Chưa cấu hình URL của Google Apps Script trong .env.local!");
        setUploading(false);
        setUploadProgress(0);
        return;
      }
      
      newEvidences.push({
        name: file.name || `Tài_liệu_${Date.now()}`,
        driveUrl: finalDriveUrl,
        localUrl,
        type: fileType
      });
    }

    setUploadProgress(100);
    setTimeout(() => {
      setEvidenceList(prev => [...prev, ...newEvidences]);
      setUploading(false);
      setUploadProgress(0);
    }, 300);
  };

  const removeEvidence = (indexToRemove) => {
    setEvidenceList(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const formatCurrentTime = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.mahs.trim()) {
      alert('Vui lòng nhập Mã học sinh.');
      return;
    }

    if (studentWarning || !formData.hoten) {
      alert('Học sinh không hợp lệ hoặc không tồn tại.');
      return;
    }

    if (isCustomSelected && !customViolation.trim()) {
      alert('Vui lòng nhập chi tiết lỗi vi phạm khác.');
      return;
    }

    setLoading(true);

    // If custom violation type was entered, save it to DB
    let finalViolationType = formData.loaivipham;
    if (isCustomSelected) {
      finalViolationType = customViolation.trim();
      await addCustomViolationType(finalViolationType);
    }

    // Prepare evidence links
    const minhchungUrls = evidenceList.map(item => item.driveUrl).join(', ');

    // Collect logged-in user details & formatted time
    const createdBy = user ? (user.fullName || user.username) : 'Người quản trị';
    const createdTimeFormatted = formatCurrentTime();

    const payload = {
      ...formData,
      loaivipham: finalViolationType,
      minhchung: minhchungUrls,
      createdBy,
      createdTimeFormatted
    };

    const result = await addViolation(payload);
    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/features');
      }, 1500);
    } else {
      alert("Có lỗi xảy ra khi lưu dữ liệu.");
    }
  };

  if (success) {
    return (
      <div className="success-screen">
        <CheckCircle size={64} color="var(--success)" className="success-icon" />
        <h2>Đã lưu thông tin vi phạm thành công!</h2>
        <p className="text-muted">Đang quay lại trang tính năng...</p>
      </div>
    );
  }

  return (
    <>
      <Header title="Nhập thông tin vi phạm" />
      <div className="form-content">
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="violation-form">

              {/* 1. Mã học sinh (Required) */}
              <div className="input-group full-width">
                <label className="input-label required-label">Mã học sinh</label>
                <input
                  type="text"
                  name="mahs"
                  className={`input-field ${studentWarning ? 'error-border' : ''}`}
                  placeholder="Nhập mã học sinh để tìm kiếm..."
                  value={formData.mahs}
                  onChange={handleStudentIdChange}
                  required
                />
                {searchingStudent && <span className="helper-text info-text">Đang tìm học sinh...</span>}
                {studentWarning && (
                  <span className="helper-text error-text">
                    <AlertCircle size={14} style={{ marginRight: '4px' }} />
                    {studentWarning}
                  </span>
                )}
              </div>

              {/* 2. Họ và tên (Disabled & Faded) */}
              <div className="input-group full-width blurred-group">
                <label className="input-label">Họ và tên</label>
                <input
                  type="text"
                  name="hoten"
                  className="input-field disabled-field"
                  value={formData.hoten}
                  placeholder="Tự động điền"
                  disabled
                />
              </div>

              {/* 3. Lớp (Disabled & Faded) */}
              <div className="input-group full-width blurred-group">
                <label className="input-label">Lớp</label>
                <input
                  type="text"
                  name="tenlop"
                  className="input-field disabled-field"
                  value={formData.tenlop}
                  placeholder="Tự động điền"
                  disabled
                />
              </div>

              {/* 4. Lỗi vi phạm (Required) */}
              <Select
                label="Lỗi vi phạm"
                name="loaivipham"
                options={violationTypes}
                value={formData.loaivipham}
                onChange={handleChange}
                required
              />

              {/* Lỗi vi phạm khác (Hiện khi chọn Khác) */}
              {isCustomSelected && (
                <div className="input-group full-width anim-fade-in">
                  <label className="input-label required-label">Chi tiết lỗi vi phạm khác</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Nhập chính xác lỗi vi phạm khác..."
                    value={customViolation}
                    onChange={(e) => setCustomViolation(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* 5. Nội dung vi phạm chi tiết (Optional) */}
              <div className="input-group full-width">
                <label className="input-label">Nội dung vi phạm chi tiết</label>
                <textarea
                  name="noidung"
                  className="input-field textarea-field"
                  placeholder="Nhập diễn giải chi tiết về sự việc..."
                  value={formData.noidung}
                  onChange={handleChange}
                  rows={3}
                />
              </div>

              {/* 6. Thời gian vi phạm (Editable, formatted strictly as dd/mm/yyyy) */}
              <div className="input-group full-width" style={{ position: 'relative' }}>
                <label className="input-label">Thời gian vi phạm</label>
                <input
                  type="text"
                  className="input-field"
                  value={formatDateToVN(formData.ngayvipham)}
                  onClick={() => dateInputRef.current?.showPicker()}
                  readOnly
                  style={{ cursor: 'pointer' }}
                />
                <input
                  type="date"
                  ref={dateInputRef}
                  name="ngayvipham"
                  value={formData.ngayvipham}
                  onChange={handleChange}
                  required
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: 0,
                    height: 0,
                    bottom: 0
                  }}
                />
              </div>

              {/* 7. Minh chứng vi phạm (Có thể chọn nhiều) */}
              <div className="input-group full-width">
                <label className="input-label">Minh chứng vi phạm (Có thể chọn nhiều)</label>
                
                <div className="upload-actions-grid">
                  <button
                    type="button"
                    className="upload-btn primary-upload"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={18} />
                    Upload minh chứng
                  </button>
                  <button
                    type="button"
                    className="upload-btn camera-upload"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera size={18} />
                    Chụp ảnh minh chứng
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileUpload(e, false)}
                  style={{ display: 'none' }}
                  accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
                  multiple
                />

                <input
                  type="file"
                  ref={cameraInputRef}
                  onChange={(e) => handleFileUpload(e, true)}
                  style={{ display: 'none' }}
                  accept="image/*"
                  capture="environment"
                />

                {/* Progress bar */}
                {uploading && (
                  <div className="upload-progress-container">
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                    <span className="upload-status-text">Đang tải lên Google Drive của bạn... ({uploadProgress}%)</span>
                  </div>
                )}

                {/* Evidence List with preview and drive link */}
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
                            onClick={() => removeEvidence(index)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 8. Tình trạng xử lý (Required) */}
              <Select
                label="Tình trạng xử lý"
                name="trangthai"
                options={[
                  { value: 'Chưa xử lý', label: 'Chưa xử lý' },
                  { value: 'Đang xử lý', label: 'Đang xử lý' },
                  { value: 'Đã xử lý', label: 'Đã xử lý' }
                ]}
                value={formData.trangthai}
                onChange={handleChange}
                required
              />

              <Button
                type="submit"
                fullWidth
                className="mt-4 submit-violation-btn"
                disabled={loading || uploading}
              >
                {loading ? 'Đang lưu...' : 'Lưu thông tin vi phạm'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
