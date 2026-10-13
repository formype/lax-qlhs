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
  fetchSystemSettings,
  sortExtraClassStudents
} from '../lib/firebase';
import { parseISO, format, parse, getMonth } from 'date-fns';
import { 
  FileText, 
  Download, 
  XCircle, 
  CheckCircle, 
  Sparkles, 
  LayoutGrid, 
  List, 
  FileSpreadsheet, 
  Search, 
  Calendar,
  X
} from 'lucide-react';
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

  // Chế độ xem: 'matrix' (Bảng ma trận tuần) | 'list' (Danh sách chi tiết)
  const [viewMode, setViewMode] = useState('matrix');

  const [rawAttendance, setRawAttendance] = useState([]);
  const [extraClasses, setExtraClasses] = useState([]);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- STATE DÀNH CHO BẢNG MA TRẬN THEO TUẦN (GIỐNG HÌNH ẢNH) ---
  const [matrixClassId, setMatrixClassId] = useState('');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixWeekMode, setMatrixWeekMode] = useState('term'); // 'term' (12-14 tuần) | 'recorded' (chỉ ngày đã điểm danh)

  // --- STATE DÀNH CHO DANH SÁCH CHI TIẾT ---
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
  const [statusFilter, setStatusFilter] = useState('absent'); // absent, present, all

  // Filter 4: Môn học (thay thế Buổi học)
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
          getExtraClassAttendanceHistory(120),
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

        if (extraClassesData.length > 0) {
          setMatrixClassId(extraClassesData[0].id);
        }

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

  // =========================================================================
  // XỬ LÝ DỮ LIỆU BẢNG MA TRẬN THEO TUẦN (WEEKLY ATTENDANCE MATRIX)
  // =========================================================================
  const selectedMatrixClass = useMemo(() => {
    return extraClasses.find(c => c.id === matrixClassId) || extraClasses[0] || null;
  }, [extraClasses, matrixClassId]);

  // Danh sách học sinh của môn đang chọn trong ma trận (sắp xếp theo lớp nhỏ đến lớn, rồi mahs)
  const matrixStudents = useMemo(() => {
    if (!selectedMatrixClass) return [];
    const list = enrolledStudents.filter(s => s.extraClassId === selectedMatrixClass.id);
    const sorted = sortExtraClassStudents(list);

    if (!matrixSearch.trim()) return sorted;
    const q = matrixSearch.trim().toLowerCase();
    return sorted.filter(s => 
      (s.hoten || '').toLowerCase().includes(q) ||
      (s.mahs || '').toLowerCase().includes(q) ||
      (s.tenlop || s.lop || '').toLowerCase().includes(q)
    );
  }, [enrolledStudents, selectedMatrixClass, matrixSearch]);

  // Danh sách các ngày/tuần hiển thị trên cột của ma trận
  const matrixDateColumns = useMemo(() => {
    if (!selectedMatrixClass) return [];

    // Các ngày đã thực tế điểm danh của môn này
    const recordedDates = Array.from(new Set(
      rawAttendance
        .filter(a => a.extraClassId === selectedMatrixClass.id && a.date)
        .map(a => a.date)
    )).sort();

    if (matrixWeekMode === 'recorded') {
      return recordedDates.length > 0 ? recordedDates : [format(new Date(), 'yyyy-MM-dd')];
    }

    // Chế độ 'term': Nếu có ngày đã điểm danh thì lấy ngày đầu tiên làm mốc tạo chuỗi 12-14 tuần (+7 ngày)
    // Nếu chưa có, lấy ngày khai giảng học kỳ từ settings hoặc hôm nay
    let baseDate;
    if (recordedDates.length > 0) {
      baseDate = parseISO(recordedDates[0]);
    } else if (settings?.semester1StartDate) {
      baseDate = parse(settings.semester1StartDate, 'yyyy-MM-dd', new Date());
    } else {
      baseDate = new Date();
    }

    const projected = [];
    const totalWeeks = 12; // 12 tuần như trong hình ảnh mẫu
    for (let i = 0; i < totalWeeks; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i * 7);
      projected.push(format(d, 'yyyy-MM-dd'));
    }

    // Gộp tất cả các ngày đã có điểm danh vào để đảm bảo không bị sót ngày nào
    const allUnique = Array.from(new Set([...projected, ...recordedDates])).sort();
    return allUnique;
  }, [rawAttendance, selectedMatrixClass, matrixWeekMode, settings]);

  // Map tra cứu nhanh điểm danh: key = `${extraClassId}_${date}` -> doc data
  const attendanceMap = useMemo(() => {
    const map = new Map();
    rawAttendance.forEach(att => {
      if (att.extraClassId && att.date) {
        map.set(`${att.extraClassId}_${att.date}`, att);
      }
    });
    return map;
  }, [rawAttendance]);

  // Tổng số lượt vắng của môn trong ma trận
  const matrixTotalAbsences = useMemo(() => {
    let count = 0;
    matrixStudents.forEach(st => {
      matrixDateColumns.forEach(d => {
        const att = attendanceMap.get(`${selectedMatrixClass?.id}_${d}`);
        if (att && att.records) {
          const stStatus = att.records[st.id] || (st.mahs && att.records[st.mahs]);
          if (stStatus === 'absent') count++;
        }
      });
    });
    return count;
  }, [matrixStudents, matrixDateColumns, attendanceMap, selectedMatrixClass]);

  // =========================================================================
  // XUẤT EXCEL BẢNG MA TRẬN TUẦN (GIỐNG 100% FILE EXCEL TRONG HÌNH)
  // =========================================================================
  const handleExportMatrixExcel = async () => {
    if (!selectedMatrixClass || matrixStudents.length === 0) {
      alert('Không có dữ liệu học sinh để xuất bảng ma trận!');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheetName = (selectedMatrixClass.tenlopngoaikhoa || selectedMatrixClass.name || 'MaTran').replace(/[:\\/?*\[\]]/g, '').slice(0, 30);
    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }]
    });

    const clsName = selectedMatrixClass.tenlopngoaikhoa || selectedMatrixClass.name || 'Ngoại khóa';

    // Cấu hình độ rộng các cột
    const dateColDefs = matrixDateColumns.map(() => ({ width: 11 }));
    worksheet.columns = [
      { key: 'stt', width: 7 },
      { key: 'hoten', width: 28 },
      { key: 'lop', width: 10 },
      ...dateColDefs,
      { key: 'tongvang', width: 13 }
    ];

    // Dòng 1-2: Quốc hiệu tiêu ngữ
    worksheet.mergeCells('A1:C1');
    const cellA1 = worksheet.getCell('A1');
    cellA1.value = "TRƯỜNG THCS LÊ ANH XUÂN";
    cellA1.font = { name: 'Times New Roman', size: 12, bold: true };
    cellA1.alignment = { horizontal: 'center', vertical: 'middle' };

    const endColLetter = worksheet.getColumn(3 + matrixDateColumns.length + 1).letter;
    worksheet.mergeCells(`D1:${endColLetter}1`);
    const cellD1 = worksheet.getCell('D1');
    cellD1.value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
    cellD1.font = { name: 'Times New Roman', size: 12, bold: true };
    cellD1.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells(`D2:${endColLetter}2`);
    const cellD2 = worksheet.getCell('D2');
    cellD2.value = "Độc lập - Tự do - Hạnh phúc";
    cellD2.font = { name: 'Times New Roman', size: 13, bold: true, underline: true };
    cellD2.alignment = { horizontal: 'center', vertical: 'middle' };

    // Dòng 4: Tiêu đề báo cáo
    worksheet.mergeCells(`A4:${endColLetter}4`);
    const cellA4 = worksheet.getCell('A4');
    cellA4.value = `BÁO CÁO THEO DÕI CHUYÊN CẦN NGOẠI KHÓA - MÔN ${clsName.toUpperCase()}`;
    cellA4.font = { name: 'Times New Roman', size: 15, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    // Dòng 6: Hàng tiêu đề 1 (Header Row 1)
    // Merge STT, HỌ TÊN HỌC SINH, LỚP qua 2 dòng (6 & 7)
    worksheet.mergeCells('A6:A7');
    const cellSTT = worksheet.getCell('A6');
    cellSTT.value = "STT";
    cellSTT.font = { name: 'Times New Roman', size: 11, bold: true };
    cellSTT.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('B6:B7');
    const cellHoten = worksheet.getCell('B6');
    cellHoten.value = "HỌ TÊN HỌC SINH";
    cellHoten.font = { name: 'Times New Roman', size: 11, bold: true };
    cellHoten.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('C6:C7');
    const cellLop = worksheet.getCell('C6');
    cellLop.value = "LỚP";
    cellLop.font = { name: 'Times New Roman', size: 11, bold: true };
    cellLop.alignment = { horizontal: 'center', vertical: 'middle' };

    // Merge "Tuần học" qua tất cả các cột ngày
    const firstDateColLetter = 'D';
    const lastDateColLetter = worksheet.getColumn(3 + matrixDateColumns.length).letter;
    worksheet.mergeCells(`${firstDateColLetter}6:${lastDateColLetter}6`);
    const cellTuanHoc = worksheet.getCell(`${firstDateColLetter}6`);
    cellTuanHoc.value = "Tuần học";
    cellTuanHoc.font = { name: 'Times New Roman', size: 11, bold: true };
    cellTuanHoc.alignment = { horizontal: 'center', vertical: 'middle' };

    // Cột Tổng vắng
    const totalAbsentColLetter = worksheet.getColumn(3 + matrixDateColumns.length + 1).letter;
    worksheet.mergeCells(`${totalAbsentColLetter}6:${totalAbsentColLetter}7`);
    const cellTongVang = worksheet.getCell(`${totalAbsentColLetter}6`);
    cellTongVang.value = "Tổng vắng";
    cellTongVang.font = { name: 'Times New Roman', size: 11, bold: true };
    cellTongVang.alignment = { horizontal: 'center', vertical: 'middle' };

    // Dòng 7: Hàng ngày tháng (Sub-header)
    const row7 = worksheet.getRow(7);
    matrixDateColumns.forEach((d, idx) => {
      const cell = row7.getCell(4 + idx);
      cell.value = format(parseISO(d), 'dd/MM/yy');
      cell.font = { name: 'Times New Roman', size: 10, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Style borders & fill cho Header (Rows 6 & 7)
    for (let r = 6; r <= 7; r++) {
      const row = worksheet.getRow(r);
      for (let c = 1; c <= 3 + matrixDateColumns.length + 1; c++) {
        const cell = row.getCell(c);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
    }

    // Dòng 8+: Dữ liệu học sinh
    matrixStudents.forEach((st, stIdx) => {
      let stAbsentCount = 0;
      const rowValues = [
        stIdx + 1,
        st.hoten || '',
        st.tenlop || st.lop || ''
      ];

      matrixDateColumns.forEach((d) => {
        const att = attendanceMap.get(`${selectedMatrixClass.id}_${d}`);
        let cellVal = '';
        if (att && att.records) {
          const stStatus = att.records[st.id] || (st.mahs && att.records[st.mahs]);
          if (stStatus === 'absent') {
            cellVal = 'v';
            stAbsentCount++;
          }
        }
        rowValues.push(cellVal);
      });

      rowValues.push(stAbsentCount > 0 ? stAbsentCount : '');

      const newRow = worksheet.addRow(rowValues);
      newRow.font = { name: 'Times New Roman', size: 11 };

      newRow.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };

        // Căn giữa STT, Lớp, Ngày, Tổng vắng
        if (colNumber === 1 || colNumber === 3 || colNumber >= 4) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { vertical: 'middle' };
        }

        // Nếu vắng mặt ('v'): Tô nền hồng nhạt, chữ đỏ in đậm giống ảnh mẫu
        if (cell.value === 'v') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFECDD3' } // Màu hồng nhạt
          };
          cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FFDC2626' } };
        }

        // Cột Tổng vắng có số
        if (colNumber === 3 + matrixDateColumns.length + 1 && typeof cell.value === 'number') {
          cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFDC2626' } };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = clsName.replace(/\s+/g, '_');
    saveAs(blob, `MaTran_ChuyenCan_${safeName}_${format(new Date(), 'ddMMyyyy')}.xlsx`);
  };

  // =========================================================================
  // XỬ LÝ DỮ LIỆU DANH SÁCH CHI TIẾT (LIST VIEW)
  // =========================================================================
  const gradeOptions = useMemo(() => {
    const grades = [...new Set(classes.map(c => c.khoi).filter(Boolean))];
    return grades.sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, ''))).map(g => ({ 
      value: g, 
      label: String(g).includes('Khối') ? g : `Khối ${g}` 
    }));
  }, [classes]);

  const regularClassOptions = useMemo(() => {
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

  const subjectOptions = useMemo(() => {
    return [
      { value: 'all', label: 'Tất cả môn' },
      ...extraClasses.map(c => ({
        value: c.id,
        label: c.tenlopngoaikhoa || c.name
      }))
    ];
  }, [extraClasses]);

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
        const status = att.records[stId];
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

  const filteredData = useMemo(() => {
    if (!settings) return [];

    return flatData.filter(v => {
      if (statusFilter !== 'all') {
        if (v.status !== statusFilter) return false;
      }
      if (subjectFilter !== 'all') {
        if (v.extraClassId !== subjectFilter) return false;
      }
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

      if (targetFilterType === 'grade' && targetValueGrade) {
        if (v.className && !v.className.startsWith(targetValueGrade)) return false;
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
    flatData, settings, statusFilter, subjectFilter, timeFilterType, 
    timeValueDay, timeValueWeek, timeValueMonth, timeValueSemester, 
    targetFilterType, targetValueGrade, targetValueClass, targetValueStudentId
  ]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  return (
    <>
      <Header title="Theo dõi ngoại khóa" />
      <div className="search-content extra-tracking-content">
        
        {/* Thanh chuyển đổi chế độ xem (Bảng ma trận tuần vs Danh sách chi tiết) */}
        <div className="view-mode-toggle-card">
          <div className="mode-pill-group">
            <button
              type="button"
              className={`mode-pill-btn ${viewMode === 'matrix' ? 'active' : ''}`}
              onClick={() => setViewMode('matrix')}
            >
              <LayoutGrid size={16} />
              <span>Bảng ma trận theo tuần</span>
            </button>
            <button
              type="button"
              className={`mode-pill-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={16} />
              <span>Danh sách chi tiết</span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* GIAO DIỆN 1: BẢNG MA TRẬN THEO TUẦN (GIỐNG HÌNH ẢNH CỦA NGƯỜI DÙNG) */}
        {/* ================================================================= */}
        {viewMode === 'matrix' ? (
          <div className="matrix-view-section">
            <Card className="filter-card">
              <CardBody>
                <div className="matrix-controls-row">
                  {/* Chọn môn ngoại khóa */}
                  <div className="matrix-select-col">
                    <label className="text-sm font-semibold mb-1 block">Chọn môn ngoại khóa</label>
                    <Select
                      value={matrixClassId}
                      onChange={(e) => setMatrixClassId(e.target.value)}
                      options={extraClasses.map(c => ({
                        value: c.id,
                        label: `Môn: ${c.tenlopngoaikhoa || c.name}`
                      }))}
                    />
                  </div>

                  {/* Tìm kiếm học sinh */}
                  <div className="matrix-search-col">
                    <label className="text-sm font-semibold mb-1 block">Tìm học sinh</label>
                    <div className="matrix-search-box">
                      <Search size={16} className="search-icon" />
                      <input
                        type="text"
                        placeholder="Tìm theo họ tên, lớp..."
                        value={matrixSearch}
                        onChange={(e) => setMatrixSearch(e.target.value)}
                        className="input-field"
                      />
                      {matrixSearch && (
                        <button type="button" className="clear-btn" onClick={() => setMatrixSearch('')}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tùy chọn phạm vi tuần */}
                  <div className="matrix-week-col">
                    <label className="text-sm font-semibold mb-1 block">Phạm vi cột tuần</label>
                    <Select
                      value={matrixWeekMode}
                      onChange={(e) => setMatrixWeekMode(e.target.value)}
                      options={[
                        { value: 'term', label: 'Cả học kỳ (12 tuần)' },
                        { value: 'recorded', label: 'Chỉ ngày đã điểm danh' }
                      ]}
                    />
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Thanh thống kê nhanh & Nút xuất Excel ma trận */}
            <div className="export-actions flex-between mt-3 mb-3">
              <div className="matrix-summary-chips">
                <span className="summary-badge-item">
                  Sĩ số: <strong>{matrixStudents.length}</strong> học sinh
                </span>
                <span className="summary-badge-item badge-absent">
                  Tổng lượt vắng: <strong>{matrixTotalAbsences}</strong>
                </span>
              </div>

              <div className="flex-row gap-2">
                <Button 
                  className="export-matrix-btn" 
                  onClick={handleExportMatrixExcel}
                  disabled={loading || matrixStudents.length === 0}
                >
                  <FileSpreadsheet size={16} />
                  <span>Xuất Excel theo mẫu tuần</span>
                </Button>
              </div>
            </div>

            {/* BẢNG MA TRẬN THEO TUẦN */}
            <div className="matrix-table-card">
              {loading ? (
                <p className="text-center text-muted py-8">Đang tải bảng ma trận...</p>
              ) : matrixStudents.length === 0 ? (
                <div className="text-center text-muted py-12 flex flex-col items-center gap-2">
                  <Sparkles size={36} color="#8b5cf6" style={{ opacity: 0.6 }} />
                  <p className="font-semibold text-base">Không có học sinh trong môn này</p>
                  <p className="text-xs">Vui lòng chọn môn khác hoặc thêm học sinh vào lớp ngoại khóa.</p>
                </div>
              ) : (
                <div className="matrix-table-container">
                  <table className="matrix-spreadsheet-table">
                    <thead>
                      {/* Dòng tiêu đề 1: STT, HỌ TÊN HỌC SINH, LỚP, [Tuần học], Tổng vắng */}
                      <tr>
                        <th rowSpan={2} className="matrix-th-stt">STT</th>
                        <th rowSpan={2} className="matrix-th-name">HỌ TÊN HỌC SINH</th>
                        <th rowSpan={2} className="matrix-th-class">LỚP</th>
                        <th colSpan={matrixDateColumns.length} className="matrix-th-tuan">
                          Tuần học
                        </th>
                        <th rowSpan={2} className="matrix-th-total">Tổng vắng</th>
                      </tr>
                      {/* Dòng tiêu đề 2: Các ngày trong tuần */}
                      <tr>
                        {matrixDateColumns.map((d) => (
                          <th key={d} className="matrix-th-date">
                            {format(parseISO(d), 'dd/MM/yy')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixStudents.map((st, idx) => {
                        let absentCount = 0;

                        return (
                          <tr key={st.id || `${st.mahs}_${idx}`}>
                            <td className="matrix-td-stt">{idx + 1}</td>
                            <td className="matrix-td-name">
                              <span className="student-name">{st.hoten}</span>
                            </td>
                            <td className="matrix-td-class">{st.tenlop || st.lop || '---'}</td>

                            {/* Các ô ngày theo tuần */}
                            {matrixDateColumns.map((d) => {
                              const att = attendanceMap.get(`${selectedMatrixClass.id}_${d}`);
                              let isAbsent = false;
                              if (att && att.records) {
                                const stStatus = att.records[st.id] || (st.mahs && att.records[st.mahs]);
                                if (stStatus === 'absent') {
                                  isAbsent = true;
                                  absentCount++;
                                }
                              }

                              return (
                                <td 
                                  key={d} 
                                  className={`matrix-td-cell ${isAbsent ? 'cell-absent' : 'cell-empty'}`}
                                  title={isAbsent ? `${st.hoten} vắng ngày ${format(parseISO(d), 'dd/MM/yyyy')}` : ''}
                                >
                                  {isAbsent ? 'v' : ''}
                                </td>
                              );
                            })}

                            <td className={`matrix-td-total ${absentCount > 0 ? 'has-absent' : ''}`}>
                              {absentCount > 0 ? absentCount : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================================================================= */
          /* GIAO DIỆN 2: DANH SÁCH CHI TIẾT (LIST VIEW)                       */
          /* ================================================================= */
          <div className="list-view-section">
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

                  {/* Filter 3: Trạng thái (Mặc định: Vắng mặt) */}
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

                  {/* Filter 4: Môn học (thay thế Buổi học) */}
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

            {/* Bảng kết quả danh sách chi tiết */}
            <div className="attendance-table-container mt-3">
              {loading ? (
                <p className="text-center text-muted mt-4 w-full py-8">Đang tải dữ liệu...</p>
              ) : filteredData.length === 0 ? (
                <p className="text-center text-muted mt-4 w-full py-8">Không có dữ liệu phù hợp</p>
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
        )}

      </div>
    </>
  );
}
