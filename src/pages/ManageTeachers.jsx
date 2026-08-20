import React, { useState, useRef } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { addTeacher, addMultipleTeachers } from '../lib/firebase';
import { Download, FileUp, GraduationCap, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import './ManageStudents.css';

const DEPARTMENTS = {
  'Tổ Toán': ['Toán'],
  'Tổ Văn': ['Văn'],
  'Tổ Tự nhiên': ['KHTN'],
  'Tổ Xã hội': ['Sử - Địa', 'GDCD'],
  'Tổ VTM': ['Mỹ thuật', 'Nhạc', 'Thể dục'],
  'Tổ Tin học - Công nghệ': ['Tin học', 'Công nghệ'],
  'Tổ Tiếng anh': ['Tiếng Anh']
};

export function ManageTeachers() {
  const [activeTab, setActiveTab] = useState('manual');
  
  // Manual
  const [magv, setMagv] = useState('');
  const [hoten, setHoten] = useState('');
  const [toChuyenMon, setToChuyenMon] = useState('');
  const [boMon, setBoMon] = useState('');
  
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Excel
  const [dragActive, setDragActive] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelError, setExcelError] = useState('');
  const [excelSuccess, setExcelSuccess] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDepartmentChange = (e) => {
    const selectedDept = e.target.value;
    setToChuyenMon(selectedDept);
    
    if (selectedDept && DEPARTMENTS[selectedDept]?.length === 1) {
      setBoMon(DEPARTMENTS[selectedDept][0]);
    } else {
      setBoMon('');
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setManualError('');
    setManualSuccess(false);

    if (!magv.trim() || !hoten.trim() || !toChuyenMon || !boMon) {
      setManualError('Vui lòng điền đầy đủ tất cả các trường bắt buộc (*).');
      return;
    }
    
    setIsSubmitting(true);
    const teacherData = {
      magv: magv.trim().toUpperCase(),
      hoten: hoten.trim(),
      tochuyenmon: toChuyenMon,
      bomon: boMon,
      createdAt: new Date().toISOString()
    };

    const res = await addTeacher(teacherData);
    if (res.success) {
      setManualSuccess(true);
      setMagv('');
      setHoten('');
      setToChuyenMon('');
      setBoMon('');
      setTimeout(() => setManualSuccess(false), 3000);
    } else {
      setManualError('Lỗi khi lưu thông tin giáo viên: ' + (res.error || 'Unknown error'));
    }
    setIsSubmitting(false);
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Mã GV (*)', 'Họ và tên (*)', 'Tổ chuyên môn (*)', 'Bộ môn giảng dạy (*)'],
      ['GV01', 'Nguyễn Văn A', 'Tổ Toán', 'Toán'],
      ['GV02', 'Trần Thị B', 'Tổ Xã hội', 'Sử - Địa']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DS_GiaoVien");
    XLSX.writeFile(wb, "Template_NhapGiaoVien.xlsx");
  };

  const processExcel = (file) => {
    setExcelError('');
    setExcelSuccess('');
    setIsUploading(true);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rawData.length < 2) {
          throw new Error("File Excel không có dữ liệu hợp lệ (cần ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu).");
        }

        const teachersToImport = [];
        let errorList = [];

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0 || !row[0]) continue; 

          const magvRaw = row[0] ? String(row[0]).trim().toUpperCase() : '';
          const hotenRaw = row[1] ? String(row[1]).trim() : '';
          const toChuyenMonRaw = row[2] ? String(row[2]).trim() : '';
          const boMonRaw = row[3] ? String(row[3]).trim() : '';

          if (!magvRaw || !hotenRaw || !toChuyenMonRaw || !boMonRaw) {
            errorList.push(`Dòng ${i + 1}: Thiếu thông tin bắt buộc.`);
            continue;
          }

          teachersToImport.push({
            magv: magvRaw,
            hoten: hotenRaw,
            tochuyenmon: toChuyenMonRaw,
            bomon: boMonRaw,
            createdAt: new Date().toISOString()
          });
        }

        if (errorList.length > 0) {
          setExcelError(`Lỗi ở một số dòng:\n` + errorList.slice(0,5).join('\n') + (errorList.length > 5 ? '\n...' : ''));
          setIsUploading(false);
          return;
        }

        if (teachersToImport.length === 0) {
          setExcelError("Không tìm thấy giáo viên nào hợp lệ để nhập.");
          setIsUploading(false);
          return;
        }

        const res = await addMultipleTeachers(teachersToImport);
        if (res.success) {
          setExcelSuccess(`Đã nhập thành công ${teachersToImport.length} giáo viên.`);
          setExcelFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          setExcelError("Lỗi hệ thống khi lưu: " + (res.error || ''));
        }
      } catch (err) {
        console.error(err);
        setExcelError("Không thể đọc file Excel. Định dạng không hợp lệ.");
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      setExcelError("Lỗi khi đọc file.");
      setIsUploading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setExcelFile(file);
      processExcel(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setExcelFile(file);
      processExcel(file);
    }
  };

  return (
    <>
      <Header title="Nhập giáo viên" />
      <div className="add-student-container">
        <div className="add-student-header">
          <GraduationCap size={28} style={{ color: '#ec4899' }} />
          <h2 className="add-student-title">Nhập Thông Tin Giáo Viên</h2>
        </div>

        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            Nhập Thủ Công
          </button>
          <button 
            className={`tab-btn ${activeTab === 'excel' ? 'active' : ''}`}
            onClick={() => setActiveTab('excel')}
          >
            Nhập Từ Excel
          </button>
        </div>

        <Card className="add-student-card">
          <CardBody>
            {activeTab === 'manual' && (
              <form onSubmit={handleManualSubmit} className="manual-form">
                {manualError && <div className="alert-error mb-4">{manualError}</div>}
                {manualSuccess && <div className="alert-success mb-4"><CheckCircle2 size={16}/> Đã lưu thông tin giáo viên thành công!</div>}
                
                <div className="form-grid">
                  <Input 
                    label="MÃ GIÁO VIÊN *"
                    placeholder="Ví dụ: GV01" 
                    value={magv}
                    onChange={(e) => setMagv(e.target.value)}
                  />
                  <Input 
                    label="HỌ VÀ TÊN *"
                    placeholder="Ví dụ: Nguyễn Văn A" 
                    value={hoten}
                    onChange={(e) => setHoten(e.target.value)}
                  />
                  
                  <Select
                    label="TỔ CHUYÊN MÔN *"
                    value={toChuyenMon}
                    onChange={handleDepartmentChange}
                    options={[
                      { value: '', label: '-- Chọn tổ chuyên môn --' },
                      ...Object.keys(DEPARTMENTS).map(d => ({ value: d, label: d }))
                    ]}
                  />

                  <Select
                    label="BỘ MÔN GIẢNG DẠY *"
                    value={boMon}
                    onChange={(e) => setBoMon(e.target.value)}
                    options={[
                      { value: '', label: toChuyenMon ? '-- Chọn bộ môn --' : '-- Chọn tổ chuyên môn trước --' },
                      ...(toChuyenMon && DEPARTMENTS[toChuyenMon] ? DEPARTMENTS[toChuyenMon].map(b => ({ value: b, label: b })) : [])
                    ]}
                    disabled={!toChuyenMon}
                  />
                </div>

                <Button type="submit" className="submit-btn" disabled={isSubmitting || manualSuccess}>
                  Lưu Thông Tin Giáo Viên
                </Button>
              </form>
            )}

            {activeTab === 'excel' && (
              <div className="excel-import-container">
                <div className="step-container">
                  <div className="step-info">
                    <h4>Bước 1: Tải File Mẫu</h4>
                    <p>Sử dụng file Excel mẫu để đảm bảo dữ liệu được nhập đúng định dạng.</p>
                  </div>
                  <Button variant="outline" onClick={handleDownloadTemplate} className="download-btn">
                    <Download size={16} /> Tải Mẫu .xlsx
                  </Button>
                </div>

                <div className="step-container" style={{ border: 'none', padding: 0, marginTop: '24px', display: 'block' }}>
                  <h4 style={{ marginBottom: '12px' }}>Bước 2: Tải Lên File Excel</h4>
                  <div 
                    className={`drop-zone ${dragActive ? 'active' : ''}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept=".xlsx, .xls" 
                      style={{ display: 'none' }} 
                    />
                    <FileUp size={40} className="drop-icon" />
                    <h4>Kéo thả file hoặc nhấn để chọn</h4>
                    <p>Hỗ trợ định dạng .xlsx, .xls</p>
                  </div>

                  {excelError && <div className="alert-error mt-4" style={{ whiteSpace: 'pre-wrap' }}>{excelError}</div>}
                  {excelSuccess && <div className="alert-success mt-4"><CheckCircle2 size={16}/> {excelSuccess}</div>}
                  {isUploading && <p className="text-center mt-3 text-primary">Đang xử lý dữ liệu...</p>}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
