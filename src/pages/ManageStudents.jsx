import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { fetchClasses, addStudent, addMultipleStudents } from '../lib/firebase';
import { Download, FileUp, UserPlus, CheckCircle2 } from 'lucide-react';
import { DayPicker } from '../components/ui/DatePicker';
import * as XLSX from 'xlsx';
import './ManageStudents.css';

export function ManageStudents() {
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' | 'excel'
  const [classes, setClasses] = useState([]);
  
  // Manual Form State
  const [newMahs, setNewMahs] = useState('');
  const [newHoten, setNewHoten] = useState('');
  const [newNgaysinh, setNewNgaysinh] = useState('');
  const [newGioitinh, setNewGioitinh] = useState('');
  const [newKhoi, setNewKhoi] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newDiachi, setNewDiachi] = useState('');
  const [newLienhe, setNewLienhe] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState(false);

  // Excel State
  const [dragActive, setDragActive] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelError, setExcelError] = useState('');
  const [excelSuccess, setExcelSuccess] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      const clData = await fetchClasses();
      setClasses(clData);
    };
    loadData();
  }, []);

  // Filter classes based on selected Khoi
  const filteredClasses = newKhoi 
    ? classes.filter(c => String(c.khoi) === String(newKhoi))
    : [];

  const uniqueKhoi = [...new Set(classes.map(c => c.khoi))].sort();

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!newMahs || !newHoten || !newKhoi || !newClass) {
      setManualError('Vui lòng điền các trường bắt buộc (*)');
      return;
    }
    setManualError('');
    setManualSuccess(false);

    const res = await addStudent({ 
      mahs: newMahs.toUpperCase().trim(), 
      hoten: newHoten.trim(), 
      ngaysinh: newNgaysinh,
      gioitinh: newGioitinh,
      khoi: newKhoi,
      tenlop: newClass,
      diachi: newDiachi,
      lienhe: newLienhe
    });

    if (res.success) {
      setManualSuccess(true);
      setNewMahs('');
      setNewHoten('');
      setNewNgaysinh('');
      setNewGioitinh('');
      setNewKhoi('');
      setNewClass('');
      setNewDiachi('');
      setNewLienhe('');
      setTimeout(() => setManualSuccess(false), 3000);
    } else {
      setManualError('Lỗi khi thêm học sinh: ' + (res.error?.message || res.error));
    }
  };

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/Mau_Danh_Sach_Hoc_Sinh.xlsx';
    link.download = 'Mau_Danh_Sach_Hoc_Sinh.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processExcel = (file) => {
    setExcelError('');
    setExcelSuccess('');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays to handle column indexes safely
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rawData.length <= 1) {
          setExcelError('File Excel không có dữ liệu (chỉ có tiêu đề hoặc rỗng).');
          return;
        }

        const studentsToImport = [];
        // Skip header row (index 0)
        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0) continue; // Skip empty rows

          const mahs = row[0] ? String(row[0]).trim() : '';
          const hoten = row[1] ? String(row[1]).trim() : '';
          const khoi = row[2] ? String(row[2]).trim() : '';
          const tenlop = row[3] ? String(row[3]).trim() : '';
          const ngaysinh = row[4] ? String(row[4]).trim() : '';
          const gioitinh = row[5] ? String(row[5]).trim() : '';
          const diachi = row[6] ? String(row[6]).trim() : '';
          const lienhe = row[7] ? String(row[7]).trim() : '';

          if (!mahs || !hoten || !tenlop) {
            // Ignore incomplete rows
            continue;
          }

          studentsToImport.push({
            mahs: mahs.toUpperCase(),
            hoten,
            ngaysinh,
            gioitinh,
            khoi,
            tenlop,
            diachi,
            lienhe
          });
        }

        if (studentsToImport.length === 0) {
          setExcelError('Không tìm thấy học sinh nào hợp lệ (cần ít nhất Mã HS, Họ tên, Lớp).');
          return;
        }

        setIsUploading(true);
        const res = await addMultipleStudents(studentsToImport);
        setIsUploading(false);

        if (res.success) {
          setExcelSuccess(`Đã thêm thành công ${studentsToImport.length} học sinh!`);
          setExcelFile(null);
        } else {
          setExcelError('Lỗi khi lưu dữ liệu lên hệ thống.');
        }

      } catch (err) {
        setIsUploading(false);
        setExcelError('Không thể đọc file Excel. Định dạng không hợp lệ.');
      }
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
      <Header title="Nhập học sinh" />
      <div className="add-student-container">
        <div className="add-student-header">
          <UserPlus size={28} className="text-primary" />
          <h2 className="add-student-title">Nhập Thông Tin Học Sinh</h2>
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
                {manualSuccess && <div className="alert-success mb-4"><CheckCircle2 size={16}/> Đã lưu thông tin học sinh thành công!</div>}
                
                <div className="form-grid">
                  <Input 
                    label="MÃ HỌC SINH *"
                    placeholder="Ví dụ: HS6101" 
                    value={newMahs}
                    onChange={(e) => setNewMahs(e.target.value)}
                  />
                  <Input 
                    label="HỌ VÀ TÊN *"
                    placeholder="Ví dụ: Nguyễn Văn A" 
                    value={newHoten}
                    onChange={(e) => setNewHoten(e.target.value)}
                  />
                  
                  <div className="input-group">
                    <label className="input-label">NGÀY SINH</label>
                    <DayPicker 
                      value={newNgaysinh}
                      onChange={setNewNgaysinh}
                    />
                  </div>

                  <Select
                    label="GIỚI TÍNH"
                    value={newGioitinh}
                    onChange={(e) => setNewGioitinh(e.target.value)}
                    options={[
                      { value: '', label: '-- Chọn giới tính --' },
                      { value: 'Nam', label: 'Nam' },
                      { value: 'Nữ', label: 'Nữ' }
                    ]}
                  />

                  <Select
                    label="KHỐI *"
                    value={newKhoi}
                    onChange={(e) => {
                      setNewKhoi(e.target.value);
                      setNewClass(''); // reset class when khoi changes
                    }}
                    options={[
                      { value: '', label: '-- Chọn khối --' },
                      ...uniqueKhoi.sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, ''))).map(k => ({ value: k, label: String(k).includes('Khối') ? k : `Khối ${k}` }))
                    ]}
                  />

                  <Select
                    label="LỚP *"
                    value={newClass}
                    onChange={(e) => setNewClass(e.target.value)}
                    options={[
                      { value: '', label: newKhoi ? '-- Chọn lớp --' : '-- Vui lòng chọn khối trước --' },
                      ...filteredClasses.map(c => ({ value: c.tenlop, label: c.tenlop }))
                    ]}
                    disabled={!newKhoi}
                  />
                </div>

                <div className="input-group full-width mt-3">
                  <label className="input-label">ĐỊA CHỈ</label>
                  <textarea 
                    className="input-field textarea-field" 
                    rows="3" 
                    value={newDiachi}
                    onChange={(e) => setNewDiachi(e.target.value)}
                  ></textarea>
                </div>

                <div className="input-group full-width mt-3 mb-4">
                  <label className="input-label">LIÊN HỆ PHỤ HUYNH</label>
                  <Input 
                    placeholder="Số điện thoại hoặc email" 
                    value={newLienhe}
                    onChange={(e) => setNewLienhe(e.target.value)}
                    hideLabel
                  />
                </div>

                <Button type="submit" className="submit-btn" disabled={manualSuccess}>
                  Lưu Thông Tin Học Sinh
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

                  {excelError && <div className="alert-error mt-4">{excelError}</div>}
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
