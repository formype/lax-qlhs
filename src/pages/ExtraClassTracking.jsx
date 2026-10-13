import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardBody } from '../components/ui/Card';
import { Select, Input } from '../components/ui/Input';
import { DayPicker, MonthPicker } from '../components/ui/DatePicker';
import { Button } from '../components/ui/Button';
import { 
  getExtraClassAttendanceHistory, 
  fetchExtraClasses,
  fetchAllExtraClassStudents, 
  fetchClasses, 
  fetchSystemSettings 
} from '../lib/firebase';
import { parseISO, format, parse, getMonth } from 'date-fns';
import { FileText, Download, XCircle, CheckCircle, Sparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import './Search.css';
import './AttendanceSearch.css';
import './ExtraClassTracking.css';

export function ExtraClassTracking() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Role permissions check: admin, vip-admin, giamthi
  const isAuthorized = user?.role?.includes('admin') || 
                       user?.role?.includes('vip-admin') || 
                       user?.role?.includes('giamthi');

  const [rawAttendance, setRawAttendance] = useState([]);
  const [extraClasses, setExtraClasses] = useState([]);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Filter 1: Thời gian
  const [timeFilterType, setTimeFilterType] = useState('week'); // all, day, week, month, semester
  const [timeValueDay, setTimeValueDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeValueWeek, setTimeValueWeek] = useState('1');
  const [timeValueMonth, setTimeValueMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [timeValueSemester, setTimeValueSemester] = useState('1');

  // Filter 2: Đối tượng (HS / Khối / Lớp)
  const [targetFilterType, setTargetFilterType] = useState('all'); // all, grade, class, student_id
  const [targetValueGrade, setTargetValueGrade] = useState('');
  const [targetValueClass, setTargetValueClass] = useState('');
  const [targetValueStudentId, setTargetValueStudentId] = useState('');

  // Filter 3: Trạng thái (Mặc định: 'absent')
  // Yêu cầu: "1. Tùy chọn trạng thái chỉ hiển thị Có mặt hoặc vắng mặt. Mặc định hiển thị tùy chọn 'Vắng mặt'."
  const [statusFilter, setStatusFilter] = useState('absent'); // absent, present, all

  // Filter 4: Môn học (thay thế Buổi học)
  // Yêu cầu: "2. Thay thế tùy chọn 'Buổi học' thành Môn học (Có tùy chọn 'Tất cả môn')"
  const [subjectFilter, setSubjectFilter] = useState('all'); // all or extraClassId

  useEffect(() => {
    if (!isAuthorized) {
      alert('Bạn không có quyền truy cập vào chức năng này!');
      navigate('/', { replace: true });
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [history, extraClassesData, studentsData, regularClassesData, sData] = await Promise.all([
          getExtraClassAttendanceHistory(90),
          fetchExtraClasses(),
          fetchAllExtraClassStudents(),
          fetchClasses(),
          fetchSystemSettings()
        ]);

        setRawAttendance(history);
        setExtraClasses(extraClassesData);
        setEnrolledStudents(studentsData);
        setClasses(regularClassesData);
        setSettings(sData);

        // Tính tuần hiện tại theo niên khóa
        if (sData) {
          const today = new Date();
          const s1Start = parse(sData.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
          const s2Start = parse(sData.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
          const s1Weeks = sData.semester1Weeks || 18;
          let currentWeek = 1;
          if (today >= s2Start) {
            const diffTime = today.getTime() - s2Start.getTime();
            currentWeek = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000)) + 1 + s1Weeks;
          } else if (today >= s1Start) {
            const diffTime = today.getTime() - s1Start.getTime();
            currentWeek = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000)) + 1;
          } else {
            currentWeek = 1;
          }
          setTimeValueWeek(currentWeek.toString());
        }
      } catch (err) {
        console.error("Lỗi khi tải dữ liệu theo dõi ngoại khóa:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAuthorized, navigate]);

  // Options khối lớp chính khóa
  const gradeOptions = useMemo(() => {
    const grades = [...new Set(classes.map(c => c.khoi).filter(Boolean))];
    return grades.sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, ''))).map(g => ({ 
      value: g, 
      label: String(g).includes('Khối') ? g : `Khối ${g}` 
    }));
  }, [classes]);

  // Options lớp chính khóa
  const regularClassOptions = useMemo(() => {
    let filtered = classes;
    if (targetFilterType === 'grade' && targetValueGrade) {
      filtered = classes.filter(c => c.khoi === targetValueGrade);
    }
    return filtered.map(c => ({ value: c.tenlop, label: c.tenlop }));
  }, [classes, targetFilterType, targetValueGrade]);

  // Options tuần học
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

  // Options môn ngoại khóa (thay cho buổi học)
  const subjectOptions = useMemo(() => {
    return [
      { value: 'all', label: 'Tất cả môn' },
      ...extraClasses.map(c => ({
        value: c.id,
        label: c.tenlopngoaikhoa || c.name
      }))
    ];
  }, [extraClasses]);

  // Flattened attendance records
  const flatData = useMemo(() => {
    const studentsMap = new Map();
    enrolledStudents.forEach(st => {
      studentsMap.set(st.id, st);
      if (st.mahs) {
        studentsMap.set(st.mahs.trim().toUpperCase(), st);
      }
    });

    const extraClassMap = new Map();
    extraClasses.forEach(cls => {
      extraClassMap.set(cls.id, cls.tenlopngoaikhoa || cls.name);
    });

    const list = [];
    rawAttendance.forEach(att => {
      if (!att.records) return;
      const extraClassTitle = att.extraClassName || extraClassMap.get(att.extraClassId) || 'Môn ngoại khóa';

      Object.keys(att.records).forEach(stId => {
        const status = att.records[stId]; // 'present' | 'absent'
        const student = studentsMap.get(stId);

        list.push({
          id: `${att.id || att.extraClassId}_${stId}`,
          date: att.date,
          extraClassId: att.extraClassId,
          extraClassName: extraClassTitle,
          studentId: stId,
          mahs: student?.mahs || '',
          hoten: student?.hoten || '---',
          className: student?.tenlop || student?.lop || '',
          status: status,
          createdBy: att.createdBy || 'Hệ thống',
          updatedAt: att.updatedAt
        });
      });
    });

    return list;
  }, [rawAttendance, enrolledStudents, extraClasses]);

  // Filter logic
  const filteredData = useMemo(() => {
    if (!settings) return [];

    return flatData.filter(v => {
      // 1. Lọc theo trạng thái
      if (statusFilter !== 'all') {
        if (v.status !== statusFilter) return false;
      }

      // 2. Lọc theo Môn học
      if (subjectFilter !== 'all') {
        if (v.extraClassId !== subjectFilter) return false;
      }

      // 3. Lọc theo Thời gian
      if (timeFilterType === 'day') {
        if (v.date !== timeValueDay) return false;
      } else if (timeFilterType === 'week') {
        if (!v.date) return false;
        const vDate = parseISO(v.date);
        const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
        const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
        const s1Weeks = settings.semester1Weeks || 18;
        
        const weekNum = parseInt(timeValueWeek, 10);
        let start, end;
        if (weekNum <= s1Weeks) {
          start = new Date(s1Start);
          start.setDate(start.getDate() + (weekNum - 1) * 7);
        } else {
          start = new Date(s2Start);
          start.setDate(start.getDate() + (weekNum - 1 - s1Weeks) * 7);
        }
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        start.setHours(0, 0, 0, 0);

        if (vDate < start || vDate > end) return false;
      } else if (timeFilterType === 'month') {
        if (!v.date || !v.date.startsWith(timeValueMonth)) return false;
      } else if (timeFilterType === 'semester') {
        if (!v.date) return false;
        const vDate = parseISO(v.date);
        const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
        const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
        if (timeValueSemester === '1') {
          if (vDate < s1Start || vDate >= s2Start) return false;
        } else {
          if (vDate < s2Start) return false;
        }
      }

      // 4. Lọc theo Đối tượng (Khối / Lớp / Mã tên HS)
      if (targetFilterType === 'grade' && targetValueGrade) {
        if (v.className && !v.className.startsWith(targetValueGrade)) {
          return false;
        }
      } else if (targetFilterType === 'class' && targetValueClass) {
        if (v.className !== targetValueClass) return false;
      } else if (targetFilterType === 'student_id' && targetValueStudentId.trim()) {
        const query = targetValueStudentId.trim().toLowerCase();
        const matchName = (v.hoten || '').toLowerCase().includes(query);
        const matchId = (v.mahs || '').toLowerCase().includes(query);
        if (!matchName && !matchId) return false;
      }

      return true;
    });
  }, [
    flatData, 
    settings, 
    statusFilter, 
    subjectFilter, 
    timeFilterType, 
    timeValueDay, 
    timeValueWeek, 
    timeValueMonth, 
    timeValueSemester, 
    targetFilterType, 
    targetValueGrade, 
    targetValueClass, 
    targetValueStudentId
  ]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    statusFilter, 
    subjectFilter, 
    timeFilterType, 
    timeValueDay, 
    timeValueWeek, 
    timeValueMonth, 
    timeValueSemester, 
    targetFilterType, 
    targetValueGrade, 
    targetValueClass, 
    targetValueStudentId
  ]);

  // Paginated Data
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  // Xuất file Excel
  const handleExportExcel = async () => {
    if (filteredData.length === 0) {
      alert('Không có dữ liệu để xuất file Excel!');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('TheoDoiNgoaiKhoa', {
      views: [{ showGridLines: true }]
    });

    worksheet.columns = [
      { key: 'stt', width: 8 },
      { key: 'hoten', width: 28 },
      { key: 'mahs', width: 14 },
      { key: 'lop', width: 12 },
      { key: 'mon', width: 24 },
      { key: 'ngay', width: 15 },
      { key: 'trangthai', width: 16 }
    ];

    // Header Trường & Tiêu ngữ
    worksheet.mergeCells('A1:C1');
    const cellA1 = worksheet.getCell('A1');
    cellA1.value = "TRƯỜNG THCS LÊ ANH XUÂN";
    cellA1.font = { name: 'Times New Roman', size: 12, bold: true };
    cellA1.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('D1:G1');
    const cellD1 = worksheet.getCell('D1');
    cellD1.value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
    cellD1.font = { name: 'Times New Roman', size: 12, bold: true };
    cellD1.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('D2:G2');
    const cellD2 = worksheet.getCell('D2');
    cellD2.value = "Độc lập - Tự do - Hạnh phúc";
    cellD2.font = { name: 'Times New Roman', size: 13, bold: true, underline: true };
    cellD2.alignment = { horizontal: 'center', vertical: 'middle' };

    // Tiêu đề báo cáo
    worksheet.mergeCells('A4:G4');
    const cellA4 = worksheet.getCell('A4');
    cellA4.value = "BÁO CÁO THEO DÕI HỌC SINH HỌC NGOẠI KHÓA";
    cellA4.font = { name: 'Times New Roman', size: 15, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    // Tiêu đề bảng
    const headers = ["STT", "Họ và tên", "Mã HS", "Lớp", "Môn ngoại khóa", "Ngày", "Trạng thái"];
    const headerRow = worksheet.getRow(6);
    headerRow.values = headers;
    headerRow.font = { name: 'Times New Roman', size: 12, bold: true };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    headers.forEach((_, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
    });

    // Dữ liệu dòng
    filteredData.forEach((v, idx) => {
      const statusStr = v.status === 'present' ? 'Có mặt' : 'Vắng mặt';
      const rowData = [
        idx + 1,
        v.hoten || '',
        v.mahs || '',
        v.className || '',
        v.extraClassName || '',
        v.date ? format(parseISO(v.date), 'dd/MM/yyyy') : '',
        statusStr
      ];
      const row = worksheet.addRow(rowData);
      row.font = { name: 'Times New Roman', size: 12 };

      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if (colNumber === 1 || colNumber === 3 || colNumber === 4 || colNumber === 6 || colNumber === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { vertical: 'middle' };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `TheoDoiNgoaiKhoa_${format(new Date(), 'ddMMyyyy')}.xlsx`);
  };

  // Xuất file PDF
  const handleExportPDF = () => {
    if (filteredData.length === 0) {
      alert('Không có dữ liệu để xuất file PDF!');
      return;
    }

    const doc = new jsPDF('p', 'pt', 'a4');
    doc.setFontSize(14);
    doc.text("BÁO CÁO THEO DÕI HỌC SINH HỌC NGOẠI KHÓA", doc.internal.pageSize.getWidth() / 2, 40, { align: 'center' });

    const tableHeaders = [["STT", "Họ và tên", "Mã HS", "Lớp", "Môn ngoại khóa", "Ngày", "Trạng thái"]];
    const tableData = filteredData.map((v, idx) => [
      idx + 1,
      v.hoten || '',
      v.mahs || '',
      v.className || '',
      v.extraClassName || '',
      v.date ? format(parseISO(v.date), 'dd/MM/yyyy') : '',
      v.status === 'present' ? 'Có mặt' : 'Vắng mặt'
    ]);

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: 65,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' }
    });

    doc.save(`TheoDoiNgoaiKhoa_${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  return (
    <>
      <Header title="Theo dõi ngoại khóa" />
      <div className="search-content extra-tracking-content">
        <Card className="filter-card">
          <CardBody>
            <div className="filter-grid extra-tracking-filter-grid">
              
              {/* Filter 1: Thời gian */}
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Thời gian</label>
                <div className="flex-row gap-2">
                  <Select 
                    value={timeFilterType} 
                    onChange={e => setTimeFilterType(e.target.value)}
                    options={[
                      { value: 'all', label: 'Tất cả' },
                      { value: 'day', label: 'Theo ngày' },
                      { value: 'week', label: 'Theo tuần' },
                      { value: 'month', label: 'Theo tháng' },
                      { value: 'semester', label: 'Theo học kỳ' }
                    ]}
                  />
                  {timeFilterType === 'day' && (
                    <DayPicker 
                      value={timeValueDay} 
                      onChange={val => setTimeValueDay(val)}
                    />
                  )}
                  {timeFilterType === 'week' && (
                    <Select 
                      value={timeValueWeek} 
                      onChange={e => setTimeValueWeek(e.target.value)} 
                      options={weekOptions} 
                      style={{ maxWidth: '100%', flex: 1 }} 
                    />
                  )}
                  {timeFilterType === 'month' && (
                    <MonthPicker 
                      value={timeValueMonth} 
                      onChange={val => setTimeValueMonth(val)}
                    />
                  )}
                  {timeFilterType === 'semester' && (
                    <Select 
                      value={timeValueSemester} 
                      onChange={e => setTimeValueSemester(e.target.value)} 
                      options={[
                        { value: '1', label: 'Học kỳ 1' }, 
                        { value: '2', label: 'Học kỳ 2' }
                      ]} 
                    />
                  )}
                </div>
              </div>

              {/* Filter 2: Đối tượng (HS / Khối / Lớp) */}
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Đối tượng</label>
                <div className="flex-row gap-2">
                  <Select 
                    value={targetFilterType} 
                    onChange={e => {
                      setTargetFilterType(e.target.value);
                      setTargetValueGrade(''); 
                      setTargetValueClass(''); 
                      setTargetValueStudentId('');
                    }}
                    options={[
                      { value: 'all', label: 'Tất cả HS' },
                      { value: 'grade', label: 'Theo Khối' },
                      { value: 'class', label: 'Theo Lớp' },
                      { value: 'student_id', label: 'Mã / Tên HS' }
                    ]}
                  />
                  {targetFilterType === 'grade' && (
                    <Select 
                      value={targetValueGrade} 
                      onChange={e => setTargetValueGrade(e.target.value)} 
                      options={[{ value: '', label: 'Chọn khối' }, ...gradeOptions]} 
                    />
                  )}
                  {targetFilterType === 'class' && (
                    <Select 
                      value={targetValueClass} 
                      onChange={e => setTargetValueClass(e.target.value)} 
                      options={[{ value: '', label: 'Chọn lớp' }, ...regularClassOptions]} 
                    />
                  )}
                  {targetFilterType === 'student_id' && (
                    <Input 
                      placeholder="Nhập mã hoặc tên HS..." 
                      value={targetValueStudentId} 
                      onChange={e => setTargetValueStudentId(e.target.value)} 
                      style={{ marginBottom: 0 }} 
                    />
                  )}
                </div>
              </div>

              {/* Filter 3: Trạng thái (Yêu cầu 1: Chỉ Có mặt hoặc Vắng mặt. Mặc định: Vắng mặt) */}
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Trạng thái</label>
                <Select 
                  value={statusFilter} 
                  onChange={e => setStatusFilter(e.target.value)}
                  options={[
                    { value: 'absent', label: 'Vắng mặt' },
                    { value: 'present', label: 'Có mặt' },
                    { value: 'all', label: 'Tất cả trạng thái' }
                  ]}
                  style={{ minWidth: '150px' }}
                />
              </div>

              {/* Filter 4: Môn học (Yêu cầu 2: Thay thế Buổi học thành Môn học, có tùy chọn Tất cả môn) */}
              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Môn học</label>
                <Select 
                  value={subjectFilter} 
                  onChange={e => setSubjectFilter(e.target.value)}
                  options={subjectOptions}
                  style={{ minWidth: '160px' }}
                />
              </div>

            </div>
          </CardBody>
        </Card>

        {/* Thanh kết quả và Nút xuất Excel / PDF */}
        <div className="export-actions flex-between mt-3 mb-3">
          <span className="text-muted text-sm font-semibold">
            Tìm thấy <strong>{filteredData.length}</strong> kết quả
            {statusFilter === 'absent' && ' (học sinh vắng mặt)'}
          </span>
          <div className="flex-row gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportPDF}>
              <FileText size={15} /> Xuất PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportExcel}>
              <Download size={15} /> Xuất Excel
            </Button>
          </div>
        </div>

        {/* Bảng kết quả theo dõi ngoại khóa */}
        <div className="attendance-table-container">
          {loading ? (
            <p className="text-center text-muted mt-4 w-full py-8">Đang tải dữ liệu theo dõi ngoại khóa...</p>
          ) : filteredData.length === 0 ? (
            <div className="text-center text-muted mt-4 w-full py-12 flex flex-col items-center gap-2">
              <Sparkles size={36} color="#8b5cf6" style={{ opacity: 0.6 }} />
              <p className="font-semibold text-base">Không có dữ liệu ngoại khóa phù hợp</p>
              <p className="text-xs">Thử thay đổi bộ lọc ngày, môn học hoặc trạng thái ở trên.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="modern-table extra-tracking-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Lớp</th>
                    <th>Môn ngoại khóa</th>
                    <th>Thời gian</th>
                    <th style={{ textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((v) => (
                    <tr key={v.id}>
                      <td className="font-semibold text-dark">
                        <div>{v.hoten}</div>
                        <div className="text-xs text-muted font-mono">{v.mahs}</div>
                      </td>
                      <td>
                        <span className="class-badge-modern table-badge">
                          {v.className || '---'}
                        </span>
                      </td>
                      <td>
                        <span className="subject-badge-modern table-badge">
                          {v.extraClassName}
                        </span>
                      </td>
                      <td>
                        <span className="font-medium whitespace-nowrap">
                          {v.date ? format(parseISO(v.date), 'dd/MM/yyyy') : ''}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {v.status === 'present' ? (
                          <span className="badge badge-success flex items-center justify-center gap-1" style={{ display: 'inline-flex' }}>
                            <CheckCircle size={13} /> Có mặt
                          </span>
                        ) : (
                          <span className="badge badge-danger flex items-center justify-center gap-1" style={{ display: 'inline-flex' }}>
                            <XCircle size={13} /> Vắng mặt
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Phân trang */}
          {totalPages > 1 && (
            <div className="pagination flex-center gap-2 mt-4">
              <Button 
                variant="secondary" 
                size="sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                Trang trước
              </Button>
              <span className="text-sm font-semibold text-muted px-2">
                Trang {currentPage} / {totalPages}
              </span>
              <Button 
                variant="secondary" 
                size="sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                Trang sau
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
