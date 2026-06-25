import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardBody } from '../components/ui/Card';
import { Select, Input } from '../components/ui/Input';
import { DayPicker, MonthPicker } from '../components/ui/DatePicker';
import { Button } from '../components/ui/Button';
import { getAttendanceHistory, fetchStudents, fetchClasses, fetchSystemSettings, updateAttendanceStudent } from '../lib/firebase';
import { parseISO, format, addDays, parse, getMonth } from 'date-fns';
import { FileText, Download, XCircle, CheckCircle, Eye, Camera, Upload, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import './Search.css'; // Reuse core search UI styles
import './AttendanceSearch.css';

export function AttendanceSearch() {
  const [attendanceData, setAttendanceData] = useState([]);
  const [classes, setClasses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [proofImage, setProofImage] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { user } = useAuth();

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
  
  const [statusFilter, setStatusFilter] = useState('absent'); // all, present, absent

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [history, studentsData, classesData, sData] = await Promise.all([
        getAttendanceHistory(),
        fetchStudents(),
        fetchClasses(),
        fetchSystemSettings()
      ]);
      
      const flatData = [];
      history.forEach(att => {
        if (!att.records) return;
        Object.keys(att.records).forEach(studentId => {
          const status = att.records[studentId];
          const student = studentsData.find(s => s.id === studentId);
          if (student) {
            flatData.push({
              id: `${att.id}_${studentId}`,
              date: att.date,
              className: att.className,
              studentId: studentId,
              mahs: student.mahs || '',
              hoten: student.hoten || '',
              khoi: student.khoi || '',
              status: status,
              proofImage: att.proofs ? att.proofs[studentId] : null,
              createdBy: att.createdBy || 'Hệ thống',
              updatedAt: att.updatedAt
            });
          }
        });
      });

      setAttendanceData(flatData);
      setClasses(classesData);
      setSettings(sData);
      setLoading(false);
    };
    loadData();
  }, []);

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
    
    const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
    const s1Weeks = settings.semester1Weeks || 18;

    return attendanceData.filter(v => {
      if (!v.date) return false;
      const vDate = parse(v.date, 'yyyy-MM-dd', new Date());

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

      // Time Filter
      if (timeFilterType === 'day') {
        if (v.date !== timeValueDay) return false;
      } else if (timeFilterType === 'week') {
        if (weekNum.toString() !== timeValueWeek) return false;
      } else if (timeFilterType === 'month') {
        if (format(vDate, 'yyyy-MM') !== timeValueMonth) return false;
      } else if (timeFilterType === 'semester') {
        if (timeValueSemester === '1' && (weekNum < 1 || weekNum > s1Weeks)) return false;
        if (timeValueSemester === '2' && weekNum <= s1Weeks) return false;
      }

      // Target Filter
      if (targetFilterType === 'grade') {
        if (targetValueGrade && v.khoi !== targetValueGrade && !v.className?.startsWith(targetValueGrade)) return false;
      } else if (targetFilterType === 'class') {
        if (targetValueClass && v.className !== targetValueClass) return false;
      } else if (targetFilterType === 'student_id') {
        if (targetValueStudentId && !(v.mahs || '').toLowerCase().includes(targetValueStudentId.toLowerCase())) return false;
      }

      // Status Filter
      if (statusFilter === 'absent') {
        if (!v.status.startsWith('absent')) return false;
      } else if (statusFilter !== 'all' && v.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [attendanceData, settings, timeFilterType, timeValueDay, timeValueWeek, timeValueMonth, timeValueSemester, targetFilterType, targetValueGrade, targetValueClass, targetValueStudentId, statusFilter]);

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

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    let date;
    if (ts.toDate) date = ts.toDate();
    else if (ts.seconds) date = new Date(ts.seconds * 1000);
    else date = new Date(ts);
    return format(date, 'HH:mm dd/MM/yyyy');
  };

  const handleOpenDetail = (record) => {
    setSelectedRecord(record);
    setProofImage(record.proofImage || '');
    setIsModalOpen(true);
  };

  const handleCloseDetail = () => {
    setIsModalOpen(false);
    setSelectedRecord(null);
    setProofImage('');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setProofImage(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateStatus = async () => {
    if (!selectedRecord) return;
    setIsUpdating(true);
    const result = await updateAttendanceStudent(selectedRecord.date, selectedRecord.className, selectedRecord.studentId, 'absent_p', proofImage);
    setIsUpdating(false);
    if (result.success) {
      setAttendanceData(prev => prev.map(item => {
        if (item.id === selectedRecord.id) {
          return { ...item, status: 'absent_p', proofImage: proofImage };
        }
        return item;
      }));
      handleCloseDetail();
    } else {
      alert("Cập nhật thất bại: " + result.error);
    }
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
    doc.text("DANH SÁCH THEO DÕI TÌNH HÌNH CHUYÊN CẦN CỦA HỌC SINH", pageWidth / 2, 35, { align: 'center' });

    const tableColumn = ["STT", "Họ tên", "Lớp", "Ngày", "Trạng thái", "Ghi chú"];
    const tableRows = filteredData.map((v, index) => {
      let statusStr = 'Có mặt';
      let reasonStr = '';
      if (v.status === 'absent_p') { statusStr = 'Vắng'; reasonStr = 'Có phép (P)'; }
      else if (v.status === 'absent_kp') { statusStr = 'Vắng'; reasonStr = 'Không phép (KP)'; }

      return [
        index + 1,
        v.hoten || '',
        v.className || '',
        v.date ? format(parseISO(v.date), 'dd/MM/yyyy') : '',
        statusStr,
        reasonStr
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
      styles: { font: 'Tinos', fontSize: 13, lineWidth: 0.1, lineColor: [0, 0, 0] },
      headStyles: { font: 'Tinos', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] },
      columnStyles: {
        5: { cellWidth: 80 }
      }
    });

    doc.save(`BaoCaoChuyenCan_${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  const exportExcel = async () => {
    if (filteredData.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BaoCaoChuyenCan');

    worksheet.pageSetup.orientation = 'landscape';
    worksheet.pageSetup.paperSize = 9; // A4

    worksheet.columns = [
      { width: 10 }, // A: STT
      { width: 30 }, // B: Họ tên
      { width: 15 }, // C: Lớp
      { width: 20 }, // D: Ngày
      { width: 20 }, // E: Trạng thái
      { width: 30 }  // F: Ghi chú
    ];

    // Row 1 & 2: Header Left
    worksheet.mergeCells('A1:C2');
    const cellA1 = worksheet.getCell('A1');
    cellA1.value = "ỦY BAN NHÂN DÂN PHƯỜNG MINH PHỤNG\nTRƯỜNG THCS LÊ ANH XUÂN";
    cellA1.font = { name: 'Times New Roman', size: 13, bold: true };
    cellA1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Row 1 & 2: Header Right
    worksheet.mergeCells('D1:F2');
    const cellD1 = worksheet.getCell('D1');
    cellD1.value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc";
    cellD1.font = { name: 'Times New Roman', size: 13, bold: true };
    cellD1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Row 4: Title
    worksheet.mergeCells('A4:F4');
    const cellA4 = worksheet.getCell('A4');
    cellA4.value = "DANH SÁCH THEO DÕI TÌNH HÌNH CHUYÊN CẦN CỦA HỌC SINH";
    cellA4.font = { name: 'Times New Roman', size: 16, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 6: Headers
    const headers = ["STT", "Họ tên", "Lớp", "Ngày", "Trạng thái", "Ghi chú"];
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
    filteredData.forEach((v, index) => {
      let statusStr = 'Có mặt';
      let reasonStr = '';
      if (v.status === 'absent_p') { statusStr = 'Vắng'; reasonStr = 'Có phép (P)'; }
      else if (v.status === 'absent_kp') { statusStr = 'Vắng'; reasonStr = 'Không phép (KP)'; }

      const rowData = [
        index + 1,
        v.hoten || '',
        v.className || '',
        v.date ? format(parseISO(v.date), 'dd/MM/yyyy') : '',
        statusStr,
        reasonStr
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
        if (colNumber === 6) {
          cell.alignment = { vertical: 'middle', wrapText: true };
        } else {
          cell.alignment = { vertical: 'middle' };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `BaoCaoChuyenCan_${format(new Date(), 'ddMMyyyy')}.xlsx`);
  };

  return (
    <>
      <Header title="Tra cứu Chuyên cần" />
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

              {/* Filter 3: Trạng thái */}
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Trạng thái</label>
                <Select 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)}
                  options={[
                    {value: 'all', label: 'Tất cả trạng thái'},
                    {value: 'absent', label: 'Vắng mặt (P và KP)'},
                    {value: 'absent_kp', label: 'Vắng không phép'},
                    {value: 'absent_p', label: 'Vắng có phép'},
                    {value: 'present', label: 'Có mặt'}
                  ]}
                  style={{ minWidth: '150px' }}
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

        <div className="attendance-table-container">
          {loading ? (
            <p className="text-center text-muted mt-4 w-full py-8">Đang tải dữ liệu...</p>
          ) : filteredData.length === 0 ? (
            <p className="text-center text-muted mt-4 w-full py-8">Không có dữ liệu chuyên cần phù hợp</p>
          ) : (
            <div className="table-responsive">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Lớp</th>
                    <th>Ngày</th>
                    <th>Trạng thái</th>
                    <th>Phép</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((v) => (
                    <tr key={v.id}>
                      <td className="font-semibold text-dark">{v.hoten}</td>
                      <td><span className="class-badge-modern table-badge">{v.className}</span></td>
                      <td className="font-medium">{v.date ? format(parseISO(v.date), 'dd/MM/yyyy') : ''}</td>
                      <td>
                        {v.status.startsWith('absent') ? (
                          <span className="attendance-status-label absent inline-flex">
                            <XCircle size={14} className="mr-1" /> Vắng mặt
                          </span>
                        ) : (
                          <span className="attendance-status-label inline-flex" style={{ color: '#10b981' }}>
                            <CheckCircle size={14} className="mr-1" /> Có mặt
                          </span>
                        )}
                      </td>
                      <td className="font-medium">
                        {v.status === 'absent_p' && <span style={{ color: '#3b82f6' }}>Có phép (P)</span>}
                        {v.status === 'absent_kp' && <span style={{ color: '#ef4444' }}>Không phép (KP)</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          className="action-btn view-btn mx-auto" 
                          onClick={() => handleOpenDetail(v)}
                          style={{
                            background: 'rgba(99, 102, 241, 0.1)',
                            color: 'var(--primary-color)',
                            border: 'none',
                            padding: '6px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && selectedRecord && (
        <div className="modal-overlay" onClick={handleCloseDetail}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Chi tiết chuyên cần</h3>
              <button className="close-btn" onClick={handleCloseDetail}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="text-muted">Học sinh:</span>
                  <span className="font-semibold">{selectedRecord.hoten} (#{selectedRecord.mahs})</span>
                </div>
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="text-muted">Lớp:</span>
                  <span className="font-semibold">{selectedRecord.className}</span>
                </div>
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="text-muted">Ngày:</span>
                  <span className="font-semibold">{selectedRecord.date ? format(parseISO(selectedRecord.date), 'dd/MM/yyyy') : ''}</span>
                </div>
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="text-muted">Trạng thái:</span>
                  <span className="font-semibold" style={{ color: selectedRecord.status === 'present' ? '#10b981' : (selectedRecord.status === 'absent_p' ? '#3b82f6' : '#ef4444') }}>
                    {selectedRecord.status === 'present' ? 'Có mặt' : (selectedRecord.status === 'absent_p' ? 'Vắng có phép' : 'Vắng không phép')}
                  </span>
                </div>
                <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="text-muted">Ghi nhận bởi:</span>
                  <span className="font-medium text-dark">{selectedRecord.createdBy || 'Hệ thống'}</span>
                </div>
                {selectedRecord.updatedAt && (
                  <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                    <span className="text-muted">Cập nhật lúc:</span>
                    <span className="font-medium text-dark">{formatTimestamp(selectedRecord.updatedAt)}</span>
                  </div>
                )}

                {selectedRecord.status === 'absent_kp' && user?.role !== 'giaovien' && (
                  <div className="upload-proof-section mt-4 p-4 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.05)', border: '1px dashed #ef4444' }}>
                    <p className="text-sm text-center mb-3 text-dark">Học sinh đang vắng không phép. Bạn có thể bổ sung đơn xin phép và đổi trạng thái thành có phép.</p>
                    
                    <div className="flex-row gap-2 justify-center mb-3">
                      <label className="btn btn-secondary btn-sm flex-center cursor-pointer" style={{ backgroundColor: 'white' }}>
                        <Camera size={16} className="mr-1" /> Chụp ảnh
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImageUpload} />
                      </label>
                      <label className="btn btn-secondary btn-sm flex-center cursor-pointer" style={{ backgroundColor: 'white' }}>
                        <Upload size={16} className="mr-1" /> Tải ảnh lên
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                      </label>
                    </div>

                    {proofImage && (
                      <div className="image-preview mt-3 text-center">
                        <p className="text-xs text-muted mb-2">Ảnh minh chứng:</p>
                        <img src={proofImage} alt="Minh chứng" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                      </div>
                    )}
                  </div>
                )}

                {(selectedRecord.status === 'absent_p' || selectedRecord.status === 'present') && proofImage && (
                  <div className="upload-proof-section mt-4">
                    <p className="text-sm font-semibold mb-2">Hình ảnh minh chứng:</p>
                    <div className="image-preview text-center">
                      <img src={proofImage} alt="Minh chứng" style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={handleCloseDetail}>Đóng</Button>
              {selectedRecord.status === 'absent_kp' && user?.role !== 'giaovien' && (
                <Button variant="primary" onClick={handleUpdateStatus} disabled={isUpdating}>
                  {isUpdating ? 'Đang cập nhật...' : 'Duyệt phép & Lưu'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
