import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Select, Input } from '../components/ui/Input';
import { DayPicker, MonthPicker } from '../components/ui/DatePicker';
import { Button } from '../components/ui/Button';
import { getRecentViolations, fetchViolationTypes, fetchClasses, fetchSystemSettings, deleteViolation } from '../lib/firebase';
import { parseISO, format, startOfDay, endOfDay, isWithinInterval, parse, getMonth, getYear } from 'date-fns';
import { Search as SearchIcon, FileText, Download, ExternalLink, Eye, X, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import './Search.css';

export function Search() {
  const { user } = useAuth();
  const [violations, setViolations] = useState([]);
  const [classes, setClasses] = useState([]);
  const [violationTypes, setViolationTypes] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [timeFilterType, setTimeFilterType] = useState('all'); // all, day, week, month, semester
  const [timeValueDay, setTimeValueDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeValueWeek, setTimeValueWeek] = useState('1');
  const [timeValueMonth, setTimeValueMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [timeValueSemester, setTimeValueSemester] = useState('1');

  const dateInputRef = React.useRef(null);
  const monthInputRef = React.useRef(null);

  const [targetFilterType, setTargetFilterType] = useState('all'); // all, grade, class, student_id
  const [targetValueGrade, setTargetValueGrade] = useState('');
  const [targetValueClass, setTargetValueClass] = useState('');
  const [targetValueStudentId, setTargetValueStudentId] = useState('');

  const [typeFilter, setTypeFilter] = useState('all');

  const [selectedViolation, setSelectedViolation] = useState(null); // For modal

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [vData, cData, tData, sData] = await Promise.all([
        getRecentViolations(),
        fetchClasses(),
        fetchViolationTypes(),
        fetchSystemSettings()
      ]);
      setViolations(vData);
      setClasses(cData);
      setViolationTypes(tData);
      setSettings(sData);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa vi phạm này không? Dữ liệu không thể khôi phục.")) {
      const res = await deleteViolation(id);
      if (res.success) {
        setViolations(prev => prev.filter(v => v.id !== id));
        setSelectedViolation(null);
      } else {
        alert("Lỗi khi xóa: " + res.error);
      }
    }
  };

  const gradeOptions = useMemo(() => {
    const grades = [...new Set(classes.map(c => c.khoi).filter(Boolean))];
    return grades.sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, ''))).map(g => ({ value: g, label: String(g).includes('Khối') ? g : `Khối ${g}` }));
  }, [classes]);

  const classOptions = useMemo(() => {
    let filtered = classes;
    if (targetFilterType === 'grade' && targetValueGrade) {
      filtered = classes.filter(c => c.khoi === targetValueGrade);
    }
    return filtered.map(c => ({ value: c.tenlop, label: c.tenlop }));
  }, [classes, targetFilterType, targetValueGrade]);

  const weekOptions = useMemo(() => {
    if (!settings) return [];
    
    const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
    const s1Weeks = settings.semester1Weeks || 18;
    const s2Weeks = settings.semester2Weeks || 17;
    const totalWeeks = s1Weeks + s2Weeks;

    return Array.from({ length: totalWeeks }, (_, i) => {
      const isHK1 = i < s1Weeks;
      const hk = isHK1 ? 'HK1' : 'HK2';
      const weekIndexInHK = isHK1 ? i : i - s1Weeks;
      const baseDate = isHK1 ? s1Start : s2Start;
      
      // Calculate start and end date of the week (assuming school week is 6 days, Mon-Sat)
      const weekStart = new Date(baseDate);
      weekStart.setDate(weekStart.getDate() + (weekIndexInHK * 7));
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 5);
      
      const label = `Tuần ${i + 1} - ${hk} (${format(weekStart, 'dd/MM/yyyy')} - ${format(weekEnd, 'dd/MM/yyyy')})`;
      
      return { value: (i + 1).toString(), label };
    });
  }, [settings]);

  // Filtering Logic
  const filteredData = useMemo(() => {
    if (!settings) return [];
    
    // Parse dates once
    const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
    const s1Weeks = settings.semester1Weeks || 18;

    return violations.filter(v => {
      if (!v.ngayvipham) return false;
      const vDate = parse(v.ngayvipham, 'yyyy-MM-dd', new Date());

      // Calculate weekNum dynamically
      let weekNum = 0;
      if (vDate >= s2Start) {
        const diffTime = vDate.getTime() - s2Start.getTime();
        const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
        weekNum = diffWeeks + 1 + s1Weeks;
      } else {
        const diffTime = vDate.getTime() - s1Start.getTime();
        const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
        weekNum = diffWeeks + 1;
      }

      // 1. Time Filter
      if (timeFilterType === 'day') {
        if (v.ngayvipham !== timeValueDay) return false;
      } else if (timeFilterType === 'week') {
        if (weekNum.toString() !== timeValueWeek) return false;
      } else if (timeFilterType === 'month') {
        if (format(vDate, 'yyyy-MM') !== timeValueMonth) return false;
      } else if (timeFilterType === 'semester') {
        if (timeValueSemester === '1' && (weekNum < 1 || weekNum > s1Weeks)) return false;
        if (timeValueSemester === '2' && weekNum <= s1Weeks) return false;
      }

      // 2. Target Filter
      if (targetFilterType === 'grade') {
        if (targetValueGrade && v.khoi !== targetValueGrade && !v.tenlop?.startsWith(targetValueGrade)) return false;
      } else if (targetFilterType === 'class') {
        if (targetValueClass && v.tenlop !== targetValueClass) return false;
      } else if (targetFilterType === 'student_id') {
        if (targetValueStudentId && !(v.mahs || '').toLowerCase().includes(targetValueStudentId.toLowerCase())) return false;
      }

      // 3. Type Filter
      if (typeFilter !== 'all' && v.loaivipham !== typeFilter) return false;

      return true;
    });
  }, [violations, settings, timeFilterType, timeValueDay, timeValueWeek, timeValueMonth, timeValueSemester, targetFilterType, targetValueGrade, targetValueClass, targetValueStudentId, typeFilter]);

  const formatDateToVN = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  const formatMonthToVN = (monthStr) => {
    if (!monthStr) return '';
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const [year, month] = parts;
    return `Tháng ${month}/${year}`;
  };

  const exportPDF = async () => {
    if (filteredData.length === 0) return;

    const fetchFont = async (url) => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    };

    const regularBase64 = await fetchFont('/fonts/Tinos-Regular.ttf');
    const boldBase64 = await fetchFont('/fonts/Tinos-Bold.ttf');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    
    doc.addFileToVFS('Tinos-Regular.ttf', regularBase64);
    doc.addFont('Tinos-Regular.ttf', 'Tinos', 'normal');
    doc.addFileToVFS('Tinos-Bold.ttf', boldBase64);
    doc.addFont('Tinos-Bold.ttf', 'Tinos', 'bold');

    doc.setFont('Tinos', 'bold');
    doc.setFontSize(13);
    
    doc.text("ỦY BAN NHÂN DÂN PHƯỜNG MINH PHỤNG", 14, 15);
    doc.text("TRƯỜNG THCS LÊ ANH XUÂN", 14, 21);
    
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", pageWidth - 14, 15, { align: 'right' });
    doc.text("Độc lập - Tự do - Hạnh phúc", pageWidth - 14, 21, { align: 'right' });

    doc.setFontSize(16);
    doc.text("DANH SÁCH HỌC SINH VI PHẠM NỘI QUY", pageWidth / 2, 35, { align: 'center' });

    const tableColumn = ["Mã HS", "Họ tên", "Lớp", "Vi phạm", "Ngày vi phạm", "Trạng thái", "Nội dung vi phạm cụ thể"];
    const tableRows = filteredData.map(v => [
      v.mahs || '', v.hoten || '', v.tenlop || '', v.loaivipham || '',
      v.ngayvipham ? format(parseISO(v.ngayvipham), 'dd/MM/yyyy') : '', v.trangthai || '', v.noidung || ''
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
      styles: { font: 'Tinos', fontSize: 13, lineWidth: 0.1, lineColor: [0, 0, 0] },
      headStyles: { font: 'Tinos', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] },
      columnStyles: {
        6: { cellWidth: 80 } // wrap long text for 'Nội dung vi phạm cụ thể'
      }
    });

    doc.save(`BaoCaoViPham_${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  const exportExcel = async () => {
    if (filteredData.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DanhSachViPham');

    // Page setup for printing
    worksheet.pageSetup.orientation = 'landscape';
    worksheet.pageSetup.paperSize = 9; // A4

    worksheet.columns = [
      { width: 15 }, // A: Mã HS
      { width: 30 }, // B: Họ tên
      { width: 12 }, // C: Lớp
      { width: 25 }, // D: Vi phạm
      { width: 15 }, // E: Ngày vi phạm
      { width: 15 }, // F: Trạng thái
      { width: 50 }  // G: Nội dung vi phạm
    ];

    // Row 1 & 2: Header Left
    worksheet.mergeCells('A1:C2');
    const cellA1 = worksheet.getCell('A1');
    cellA1.value = "ỦY BAN NHÂN DÂN PHƯỜNG MINH PHỤNG\nTRƯỜNG THCS LÊ ANH XUÂN";
    cellA1.font = { name: 'Times New Roman', size: 13, bold: true };
    cellA1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Row 1 & 2: Header Right
    worksheet.mergeCells('D1:G2');
    const cellD1 = worksheet.getCell('D1');
    cellD1.value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc";
    cellD1.font = { name: 'Times New Roman', size: 13, bold: true };
    cellD1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Row 4: Title
    worksheet.mergeCells('A4:G4');
    const cellA4 = worksheet.getCell('A4');
    cellA4.value = "DANH SÁCH HỌC SINH VI PHẠM NỘI QUY";
    cellA4.font = { name: 'Times New Roman', size: 16, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 6: Headers
    const headers = ["Mã HS", "Họ tên", "Lớp", "Vi phạm", "Ngày vi phạm", "Trạng thái", "Nội dung vi phạm cụ thể"];
    const headerRow = worksheet.getRow(6);
    headerRow.values = headers;
    headerRow.font = { name: 'Times New Roman', size: 13, bold: true };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    headers.forEach((_, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Row 7+: Data
    filteredData.forEach((v) => {
      const rowData = [
        v.mahs || '',
        v.hoten || '',
        v.tenlop || '',
        v.loaivipham || '',
        v.ngayvipham ? format(parseISO(v.ngayvipham), 'dd/MM/yyyy') : '',
        v.trangthai || '',
        v.noidung || ''
      ];
      const row = worksheet.addRow(rowData);
      row.font = { name: 'Times New Roman', size: 13 };
      
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if (colNumber === 7) {
          cell.alignment = { vertical: 'middle', wrapText: true };
        } else {
          cell.alignment = { vertical: 'middle' };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `BaoCaoViPham_${format(new Date(), 'ddMMyyyy')}.xlsx`);
  };

  return (
    <>
      <Header title="Danh sách vi phạm" />
      <div className="search-content">
        <Card className="filter-card">
          <CardBody>
            <div className="filter-grid">
              
              {/* Filter 1: Thời gian */}
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Thời gian</label>
                <div className="flex-row gap-2">
                  <Select 
                    value={timeFilterType} 
                    onChange={e => setTimeFilterType(e.target.value)}
                    options={[
                      {value: 'all', label: 'Tất cả'},
                      {value: 'day', label: 'Theo ngày'},
                      {value: 'week', label: 'Theo tuần'},
                      {value: 'month', label: 'Theo tháng'},
                      {value: 'semester', label: 'Theo học kỳ'}
                    ]}
                  />
                  {timeFilterType === 'day' && (
                    <DayPicker 
                      value={timeValueDay} 
                      onChange={val => setTimeValueDay(val)}
                    />
                  )}
                  {timeFilterType === 'week' && <Select value={timeValueWeek} onChange={e => setTimeValueWeek(e.target.value)} options={weekOptions} style={{ maxWidth: '100%', flex: 1 }} />}
                  {timeFilterType === 'month' && (
                    <MonthPicker 
                      value={timeValueMonth} 
                      onChange={val => setTimeValueMonth(val)}
                    />
                  )}
                  {timeFilterType === 'semester' && (
                    <Select value={timeValueSemester} onChange={e => setTimeValueSemester(e.target.value)} options={[{value: '1', label: 'Học kỳ 1'}, {value: '2', label: 'Học kỳ 2'}]} />
                  )}
                </div>
              </div>

              {/* Filter 2: Đối tượng */}
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Đối tượng</label>
                <div className="flex-row gap-2">
                  <Select 
                    value={targetFilterType} 
                    onChange={e => {
                      setTargetFilterType(e.target.value);
                      setTargetValueGrade(''); setTargetValueClass(''); setTargetValueStudentId('');
                    }}
                    options={[
                      {value: 'all', label: 'Tất cả HS'},
                      {value: 'grade', label: 'Theo Khối'},
                      {value: 'class', label: 'Theo Lớp'},
                      {value: 'student_id', label: 'Mã HS'}
                    ]}
                  />
                  {targetFilterType === 'grade' && <Select value={targetValueGrade} onChange={e => setTargetValueGrade(e.target.value)} options={[{value: '', label: 'Chọn khối'}, ...gradeOptions]} />}
                  {targetFilterType === 'class' && <Select value={targetValueClass} onChange={e => setTargetValueClass(e.target.value)} options={[{value: '', label: 'Chọn lớp'}, ...classOptions]} />}
                  {targetFilterType === 'student_id' && <Input placeholder="Nhập mã HS..." value={targetValueStudentId} onChange={e => setTargetValueStudentId(e.target.value)} style={{marginBottom: 0}} />}
                </div>
              </div>

              {/* Filter 3: Lỗi vi phạm */}
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Lỗi vi phạm</label>
                <Select 
                  value={typeFilter} 
                  onChange={e => setTypeFilter(e.target.value)}
                  options={[{value: 'all', label: 'Tất cả lỗi'}, ...violationTypes]}
                />
              </div>

            </div>
          </CardBody>
        </Card>

        <div className="export-actions flex-between mt-3 mb-3">
          <span className="text-muted text-sm font-semibold">Tìm thấy {filteredData.length} kết quả</span>
          <div className="flex-row gap-2">
            <Button variant="secondary" size="sm" onClick={exportPDF}><FileText size={15} /> Xuất PDF</Button>
            <Button variant="secondary" size="sm" onClick={exportExcel}><Download size={15} /> Xuất Excel</Button>
          </div>
        </div>

        <div className="search-results-grid">
          {loading ? (
            <p className="text-center text-muted mt-4 w-full">Đang tải dữ liệu...</p>
          ) : filteredData.length === 0 ? (
            <p className="text-center text-muted mt-4 w-full py-4">Không có dữ liệu</p>
          ) : (
            filteredData.map((v) => (
              <Card key={v.id} className="violation-card-modern">
                <CardBody>
                  <div className="flex-between mb-2 align-start">
                    <div>
                      <div className="student-name-modern">{v.hoten}</div>
                      <div className="student-id-modern">#{v.mahs}</div>
                    </div>
                    <span className="class-badge-modern">{v.tenlop}</span>
                  </div>
                  
                  <div className="violation-info-modern">
                    <span className="violation-type-label">{v.loaivipham}</span>
                    <span className={`badge ${v.trangthai === 'Đã xử lý' ? 'badge-success' : 'badge-warning'}`}>
                      {v.trangthai}
                    </span>
                  </div>
                  
                  <div className="violation-footer-modern">
                    <span className="violation-date-modern">
                      {v.ngayvipham ? format(parseISO(v.ngayvipham), 'dd/MM/yyyy') : ''}
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => setSelectedViolation(v)} className="view-detail-btn">
                      <Eye size={14} style={{ marginRight: '6px' }} /> Chi tiết
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedViolation && (
        <div className="modal-overlay" onClick={() => setSelectedViolation(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Chi tiết vi phạm</h3>
              <div className="flex-row gap-2">
                {(user?.role === 'admin' || user?.role === 'vip-admin') && (
                  <button className="btn-icon-link text-danger" onClick={() => handleDelete(selectedViolation.id)} title="Xóa vi phạm">
                    <Trash2 size={20} />
                  </button>
                )}
                <button className="btn-icon-link" onClick={() => setSelectedViolation(null)}><X size={20} /></button>
              </div>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label">Học sinh:</span>
                <span className="detail-value font-semibold">{selectedViolation.hoten} ({selectedViolation.mahs})</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Lớp:</span>
                <span className="detail-value">{selectedViolation.tenlop}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Lỗi vi phạm:</span>
                <span className="detail-value text-danger font-semibold">{selectedViolation.loaivipham}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Ngày vi phạm:</span>
                <span className="detail-value">{selectedViolation.ngayvipham ? format(parseISO(selectedViolation.ngayvipham), 'dd/MM/yyyy') : ''}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Trạng thái:</span>
                <span className={`badge ${selectedViolation.trangthai === 'Đã xử lý' ? 'badge-success' : 'badge-warning'}`}>
                  {selectedViolation.trangthai}
                </span>
              </div>
              {selectedViolation.noidung && (
                <div className="detail-row" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
                  <span className="detail-label mb-1">Nội dung chi tiết:</span>
                  <div className="detail-text-box">{selectedViolation.noidung}</div>
                </div>
              )}
              {selectedViolation.minhchung && (
                <div className="detail-row" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
                  <span className="detail-label mb-1">Minh chứng:</span>
                  <div className="flex-row gap-2" style={{flexWrap: 'wrap'}}>
                    {selectedViolation.minhchung.split(',').map((url, idx) => {
                      const tUrl = url.trim();
                      if (!tUrl) return null;
                      return (
                        <a key={idx} href={tUrl} target="_blank" rel="noopener noreferrer" className="drive-link">
                          <ExternalLink size={14} style={{ marginRight: '4px' }} />
                          Xem file {idx + 1}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div className="modal-footer-info mt-4 pt-3 border-t">
                <div className="text-xs text-muted">
                  Tài khoản ghi nhận: <span className="font-semibold">{selectedViolation.createdBy || 'Hệ thống'}</span>
                </div>
                <div className="text-xs text-muted">
                  Thời gian ghi nhận: <span className="font-semibold">{selectedViolation.createdTimeFormatted || 'Không xác định'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
