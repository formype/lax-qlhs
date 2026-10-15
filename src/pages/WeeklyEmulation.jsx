import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { 
  Trophy, 
  Upload, 
  FileSpreadsheet, 
  Save, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  X, 
  Download, 
  Calendar,
  Clock,
  User,
  Eye,
  Award,
  BookOpen,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { format, parse, parseISO } from 'date-fns';
import { 
  fetchClasses, 
  fetchSystemSettings, 
  fetchClassSanitationByWeek, 
  fetchAllViolations,
  saveWeeklyEmulation,
  fetchWeeklyEmulation
} from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import './WeeklyEmulation.css';

// 16 quy định trừ điểm kỷ luật chuẩn theo yêu cầu
const STANDARD_PENALTIES = [
  { match: ['đi trễ', 'di tre'], penalty: 1 },
  { match: ['sai đồng phục', 'sai dong phuc'], penalty: 1 },
  { match: ['vi phạm nội quy lớp học', 'vi pham noi quy lop hoc'], penalty: 1 },
  { match: ['vô lễ với giáo viên', 'vo le voi giao vien', 'vô lễ'], penalty: 5 },
  { match: ['đánh nhau', 'danh nhau'], penalty: 10 },
  { match: ['mang/sử dụng điện thoại', 'sử dụng điện thoại', 'mang điện thoại', 'su dung dien thoai', 'mang dien thoai'], penalty: 2 },
  { match: ['mang giày sai quy định', 'mang giay sai quy dinh'], penalty: 1 },
  { match: ['phá hoại tài sản nhà trường', 'pha hoai tai san nha truong', 'phá hoại tài sản'], penalty: 3 },
  { match: ['để móng tay dài', 'de mong tay dai'], penalty: 1 },
  { match: ['vi phạm nội quy', 'vi pham noi quy'], penalty: 1 },
  { match: ['tác phong trang phục không đảm bảo', 'tac phong trang phuc khong dam bao'], penalty: 1 },
  { match: ['ở trên lớp hoặc hành lang vào giờ ra chơi', 'o tren lop hoac hanh lang vao gio ra choi'], penalty: 1 },
  { match: ['mất trật tự xếp hàng', 'mat trat tu xep hang'], penalty: 1 },
  { match: ['mâu thuẫn dẫn đến sự việc phức tạp', 'mau thuan dan den su viec phuc tap'], penalty: 5 },
  { match: ['nói bậy trong giờ học', 'noi bay trong gio hoc', 'nói bậy'], penalty: 2 },
  { match: ['trốn tiết học', 'tron tiet hoc', 'trốn tiết'], penalty: 2 }
];

export function WeeklyEmulation() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  // States
  const [classes, setClasses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [allViolations, setAllViolations] = useState([]);
  const [sanitationDeductions, setSanitationDeductions] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Week & Grade Filter
  const [selectedWeek, setSelectedWeek] = useState('1');
  const [selectedGrade, setSelectedGrade] = useState('all'); // 'all', '6', '7', '8', '9'

  // Excel Learning Data: { [className]: { className, diemHocTap, diemKyLuat, diemVeSinh, totalHocTap } }
  const [excelData, setExcelData] = useState({});
  const [excelFileName, setExcelFileName] = useState('');

  // Custom penalties for unlisted violations: { [violationId]: number }
  const [customPenalties, setCustomPenalties] = useState({});

  // Detail Modal
  const [detailClass, setDetailClass] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Initial Load: classes, system settings, all violations
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [cData, sData, vData] = await Promise.all([
          fetchClasses(),
          fetchSystemSettings(),
          fetchAllViolations()
        ]);

        setClasses(cData || []);
        setSettings(sData);
        setAllViolations(vData || []);

        if (sData) {
          const today = new Date();
          const s1Start = parse(sData.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
          const s2Start = parse(sData.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
          const s1Weeks = sData.semester1Weeks || 18;
          let currWeek = 1;
          if (today >= s2Start) {
            const diffTime = today.getTime() - s2Start.getTime();
            currWeek = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000)) + 1 + s1Weeks;
          } else if (today >= s1Start) {
            const diffTime = today.getTime() - s1Start.getTime();
            currWeek = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000)) + 1;
          }
          if (currWeek < 1) currWeek = 1;
          setSelectedWeek(String(currWeek));
        }
      } catch (err) {
        console.error("Lỗi khởi tạo tính thi đua tuần:", err);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  // 2. Fetch sanitation data and saved emulation when selectedWeek changes
  useEffect(() => {
    const loadWeekData = async () => {
      if (!selectedWeek) return;
      setLoadingWeekData(true);
      try {
        const [sanitation, savedEmulation] = await Promise.all([
          fetchClassSanitationByWeek(selectedWeek),
          fetchWeeklyEmulation(selectedWeek)
        ]);

        setSanitationDeductions(sanitation || []);

        if (savedEmulation && savedEmulation.data) {
          setExcelData(savedEmulation.data.excelData || {});
          setExcelFileName(savedEmulation.data.excelFileName || 'Dữ liệu đã lưu trước đó');
          setCustomPenalties(savedEmulation.data.customPenalties || {});
        } else {
          // If no saved emulation for this week, clear previous week's excel draft
          setExcelData({});
          setExcelFileName('');
          setCustomPenalties({});
        }
      } catch (err) {
        console.error("Lỗi tải dữ liệu tuần:", err);
      } finally {
        setLoadingWeekData(false);
      }
    };
    loadWeekData();
  }, [selectedWeek]);

  // Week Options list
  const weekOptions = useMemo(() => {
    if (!settings) {
      return Array.from({ length: 35 }, (_, i) => ({
        value: String(i + 1),
        label: `Tuần ${i + 1}`
      }));
    }
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
      return { value: String(i + 1), label };
    });
  }, [settings]);

  const selectedWeekLabel = useMemo(() => {
    const found = weekOptions.find(w => w.value === selectedWeek);
    return found ? found.label : `Tuần ${selectedWeek}`;
  }, [weekOptions, selectedWeek]);

  // Filter violations for currently selected week
  const weekViolations = useMemo(() => {
    if (!settings || !selectedWeek) return [];
    const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
    const s1Weeks = settings.semester1Weeks || 18;

    return allViolations.filter(v => {
      if (!v.ngayvipham) return false;
      try {
        const vDate = parse(v.ngayvipham, 'yyyy-MM-dd', new Date());
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
        return String(weekNum) === String(selectedWeek);
      } catch {
        return false;
      }
    });
  }, [allViolations, settings, selectedWeek]);

  // Check penalty rule for a single violation
  const getViolationPenaltyInfo = (v) => {
    const typeText = (v.loaivipham || '').trim().toLowerCase();
    
    // Check in standard rules
    for (const rule of STANDARD_PENALTIES) {
      if (rule.match.some(m => typeText === m || typeText.includes(m))) {
        return { isStandard: true, penalty: rule.penalty, ruleName: rule.match[0] };
      }
    }

    // Unlisted or 'Khác'
    const custom = customPenalties[v.id];
    if (custom !== undefined && custom !== '') {
      return { isStandard: false, penalty: parseFloat(custom) || 0, isCustomEntered: true };
    }

    if (v.diemtru && parseFloat(v.diemtru) > 0) {
      return { isStandard: false, penalty: parseFloat(v.diemtru), isCustomEntered: false };
    }

    return { isStandard: false, penalty: 0, needsInput: true };
  };

  // Find all unlisted violations that require confirmation/input
  const unlistedViolations = useMemo(() => {
    return weekViolations.filter(v => {
      const info = getViolationPenaltyInfo(v);
      return !info.isStandard;
    });
  }, [weekViolations, customPenalties]);

  // Parse Excel file helper
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets[0];

      let colClassName = -1;
      let colHocTap = -1;
      let colKyLuat = -1;
      let colVeSinh = -1;

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const text = (cell.text || '').toLowerCase().trim();
        if (text.includes('lớp') || text.includes('tên lớp')) colClassName = colNumber;
        else if (text.includes('học tập')) colHocTap = colNumber;
        else if (text.includes('kỷ luật')) colKyLuat = colNumber;
        else if (text.includes('vệ sinh')) colVeSinh = colNumber;
      });

      if (colClassName === -1 || colHocTap === -1 || colKyLuat === -1 || colVeSinh === -1) {
        alert("File Excel thiếu một trong các cột: 'Tên lớp', 'Điểm học tập', 'Điểm kỷ luật', 'Điểm vệ sinh'. Vui lòng kiểm tra lại file!");
        return;
      }

      const parsed = {};
      for (let r = 2; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const clsName = String(row.getCell(colClassName).value || '').trim();
        if (!clsName) continue;

        const ht = parseFloat(row.getCell(colHocTap).value) || 0;
        const kl = parseFloat(row.getCell(colKyLuat).value) || 0;
        const vs = parseFloat(row.getCell(colVeSinh).value) || 0;
        const total = Math.round((ht + kl + vs) * 100) / 100;

        parsed[clsName] = {
          className: clsName,
          diemHocTap: ht,
          diemKyLuat: kl,
          diemVeSinh: vs,
          totalHocTap: total
        };
      }

      const count = Object.keys(parsed).length;
      if (count === 0) {
        alert("Không tìm thấy dữ liệu lớp nào trong file Excel!");
        return;
      }

      setExcelData(parsed);
      setExcelFileName(file.name);
      showToast(`Đã nạp dữ liệu học tập thành công cho ${count} lớp từ file ${file.name}!`);
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi khi đọc file Excel: " + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Quick load sample template from public/thiduatuan.xlsx
  const handleLoadSampleExcel = async () => {
    try {
      const res = await fetch('/thiduatuan.xlsx');
      if (!res.ok) throw new Error("Không thể tải file mẫu");
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets[0];

      let colClassName = -1;
      let colHocTap = -1;
      let colKyLuat = -1;
      let colVeSinh = -1;

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const text = (cell.text || '').toLowerCase().trim();
        if (text.includes('lớp') || text.includes('tên lớp')) colClassName = colNumber;
        else if (text.includes('học tập')) colHocTap = colNumber;
        else if (text.includes('kỷ luật')) colKyLuat = colNumber;
        else if (text.includes('vệ sinh')) colVeSinh = colNumber;
      });

      const parsed = {};
      for (let r = 2; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const clsName = String(row.getCell(colClassName).value || '').trim();
        if (!clsName) continue;

        const ht = parseFloat(row.getCell(colHocTap).value) || 0;
        const kl = parseFloat(row.getCell(colKyLuat).value) || 0;
        const vs = parseFloat(row.getCell(colVeSinh).value) || 0;
        const total = Math.round((ht + kl + vs) * 100) / 100;

        parsed[clsName] = {
          className: clsName,
          diemHocTap: ht,
          diemKyLuat: kl,
          diemVeSinh: vs,
          totalHocTap: total
        };
      }

      setExcelData(parsed);
      setExcelFileName('thiduatuan.xlsx (Mẫu)');
      showToast(`Đã nạp ${Object.keys(parsed).length} lớp từ file mẫu thiduatuan.xlsx!`);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi nạp file mẫu: " + err.message);
    }
  };

  // Download template
  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/thiduatuan.xlsx';
    link.download = 'thiduatuan.xlsx';
    link.click();
  };

  // Handle custom penalty input change
  const handleCustomPenaltyChange = (violationId, val) => {
    setCustomPenalties(prev => ({
      ...prev,
      [violationId]: val
    }));
  };

  // Extract clean grade number: '6', '7', '8', '9'
  const getCleanGrade = (c) => {
    if (c.khoi) {
      const match = String(c.khoi).match(/\d+/);
      if (match) return match[0];
    }
    if (c.tenlop) {
      const match = String(c.tenlop).match(/^(\d+)/);
      if (match) return match[1];
    }
    return 'Khác';
  };

  // Compute Full Emulation Results for all classes
  const emulationResults = useMemo(() => {
    // 1. Calculate raw scores for all classes
    const list = classes.map(c => {
      const clsName = c.tenlop;
      const grade = getCleanGrade(c);

      // 1. Học tập (từ Excel)
      const excelItem = excelData[clsName];
      const hocTapScore = excelItem ? excelItem.totalHocTap : 0;
      const hasExcel = !!excelItem;

      // 2. Kỷ luật (50đ - các lỗi vi phạm trong tuần)
      const classViolations = weekViolations.filter(v => v.tenlop === clsName);
      let totalDisciplineDeduction = 0;
      const violationDetails = classViolations.map(v => {
        const pInfo = getViolationPenaltyInfo(v);
        totalDisciplineDeduction += pInfo.penalty;
        return {
          id: v.id,
          mahs: v.mahs,
          hoten: v.hoten,
          loaivipham: v.loaivipham,
          noidung: v.noidung,
          ngayvipham: v.ngayvipham,
          penalty: pInfo.penalty,
          isStandard: pInfo.isStandard
        };
      });
      const kyLuatScore = Math.round((50 - totalDisciplineDeduction) * 100) / 100;

      // 3. Vệ sinh (20đ - các lần chấm vệ sinh bị trừ trong tuần)
      const classSanitation = sanitationDeductions.filter(d => d.className === clsName);
      const totalSanitationDeduction = classSanitation.reduce((sum, d) => sum + (parseFloat(d.pointsDeducted) || 0), 0);
      const veSinhScore = Math.max(0, 20 - totalSanitationDeduction);

      // 4. Tổng điểm thi đua
      const totalScore = Math.round((hocTapScore + kyLuatScore + veSinhScore) * 100) / 100;

      return {
        id: c.id || clsName,
        className: clsName,
        grade,
        homeroomTeacherName: c.homeroomTeacherName || '',
        hasExcel,
        excelDetails: excelItem || null,
        hocTapScore,
        kyLuatScore,
        totalDisciplineDeduction,
        violationDetails,
        veSinhScore,
        totalSanitationDeduction,
        sanitationDetails: classSanitation,
        totalScore,
        rank: 1 // will be computed per grade
      };
    });

    // 2. Group by Grade and compute ranking within each grade
    const grades = ['6', '7', '8', '9'];
    grades.forEach(g => {
      const inGrade = list.filter(item => item.grade === g);
      // Sort descending by totalScore
      inGrade.sort((a, b) => b.totalScore - a.totalScore);

      let currentRank = 1;
      inGrade.forEach((item, index) => {
        if (index > 0 && item.totalScore < inGrade[index - 1].totalScore) {
          currentRank = index + 1;
        }
        item.rank = currentRank;
      });
    });

    return list;
  }, [classes, excelData, weekViolations, customPenalties, sanitationDeductions]);

  // Filtered by selected grade tab
  const filteredResults = useMemo(() => {
    if (selectedGrade === 'all') {
      // Sort by grade then by rank
      return [...emulationResults].sort((a, b) => {
        if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
        return a.rank - b.rank;
      });
    }
    return emulationResults
      .filter(item => item.grade === selectedGrade)
      .sort((a, b) => a.rank - b.rank);
  }, [emulationResults, selectedGrade]);

  // Save weekly emulation calculation to Firebase
  const handleSaveCalculation = async () => {
    setSaving(true);
    try {
      const payload = {
        excelData,
        excelFileName,
        customPenalties,
        savedAt: new Date().toISOString()
      };

      const res = await saveWeeklyEmulation(selectedWeek, payload, user);
      if (res.success) {
        showToast("Đã lưu kết quả tính thi đua tuần thành công!");
      } else {
        alert("Lỗi khi lưu kết quả thi đua: " + res.error);
      }
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Export results to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`ThiDua_Tuan_${selectedWeek}`);

    worksheet.columns = [
      { width: 8 },  // Hạng
      { width: 14 }, // Khối
      { width: 14 }, // Lớp
      { width: 25 }, // GVCN
      { width: 18 }, // Điểm Học tập
      { width: 18 }, // Điểm Kỷ luật
      { width: 18 }, // Điểm Vệ sinh
      { width: 22 }  // Tổng điểm thi đua
    ];

    // Header 1: School Name & Country
    worksheet.mergeCells('A1:D1');
    const cellA1 = worksheet.getCell('A1');
    cellA1.value = "TRƯỜNG THCS LÊ ANH XUÂN";
    cellA1.font = { name: 'Times New Roman', size: 12, bold: true };
    cellA1.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('E1:H1');
    const cellE1 = worksheet.getCell('E1');
    cellE1.value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
    cellE1.font = { name: 'Times New Roman', size: 12, bold: true };
    cellE1.alignment = { horizontal: 'center', vertical: 'middle' };

    // Header 2: Sub-motto
    worksheet.mergeCells('A2:D2');
    const cellA2 = worksheet.getCell('A2');
    cellA2.value = "LIÊN ĐỘI - BAN THI ĐUA";
    cellA2.font = { name: 'Times New Roman', size: 11, italic: true };
    cellA2.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('E2:H2');
    const cellE2 = worksheet.getCell('E2');
    cellE2.value = "Độc lập - Tự do - Hạnh phúc";
    cellE2.font = { name: 'Times New Roman', size: 11, bold: true, underline: true };
    cellE2.alignment = { horizontal: 'center', vertical: 'middle' };

    // Title
    worksheet.mergeCells('A4:H4');
    const cellA4 = worksheet.getCell('A4');
    cellA4.value = `BẢNG XẾP HẠNG THI ĐUA CÁC LỚP THEO KHỐI - ${selectedWeekLabel.toUpperCase()}`;
    cellA4.font = { name: 'Times New Roman', size: 14, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    // Subtitle formula explanation
    worksheet.mergeCells('A5:H5');
    const cellA5 = worksheet.getCell('A5');
    cellA5.value = `Công thức: Điểm thi đua = Học tập (SĐB) + Kỷ luật (50đ - Vi phạm) + Vệ sinh (20đ - Chấm tuần)`;
    cellA5.font = { name: 'Times New Roman', size: 11, italic: true };
    cellA5.alignment = { horizontal: 'center', vertical: 'middle' };

    // Table Header
    const headers = [
      "Hạng", 
      "Khối", 
      "Lớp", 
      "Giáo viên chủ nhiệm", 
      "Điểm Học tập", 
      "Điểm Kỷ luật", 
      "Điểm Vệ sinh", 
      "Tổng điểm thi đua"
    ];
    const headerRow = worksheet.getRow(7);
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
        fgColor: { argb: 'FFE2E8F0' }
      };
    });

    // Rows grouped by Grade
    const grades = ['6', '7', '8', '9'];
    grades.forEach(g => {
      const inGrade = emulationResults.filter(item => item.grade === g).sort((a, b) => a.rank - b.rank);
      if (inGrade.length === 0) return;

      inGrade.forEach(item => {
        const row = worksheet.addRow([
          `Hạng ${item.rank}`,
          `Khối ${item.grade}`,
          item.className,
          item.homeroomTeacherName || '',
          item.hocTapScore.toFixed(2),
          item.kyLuatScore.toFixed(2),
          item.veSinhScore.toFixed(2),
          item.totalScore.toFixed(2)
        ]);

        row.font = { name: 'Times New Roman', size: 12 };
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          if ([1, 2, 3, 5, 6, 7, 8].includes(colNumber)) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { vertical: 'middle' };
          }
          if (colNumber === 8) {
            cell.font = { name: 'Times New Roman', size: 12, bold: true };
          }
        });
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `BangXepHang_ThiDua_Tuan_${selectedWeek}.xlsx`);
  };

  const getRankBadgeContent = (rank) => {
    if (rank === 1) return <span className="rank-badge rank-1" title="Hạng 1">🏆</span>;
    if (rank === 2) return <span className="rank-badge rank-2" title="Hạng 2">🥈</span>;
    if (rank === 3) return <span className="rank-badge rank-3" title="Hạng 3">🥉</span>;
    return <span className="rank-badge rank-other">{rank}</span>;
  };

  return (
    <div className="weekly-emulation-page">
      <Header title="Tính thi đua tuần" />

      {/* Floating Feedback Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#0f172a',
          color: '#fff',
          padding: '10px 18px',
          borderRadius: '10px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          fontSize: '0.88rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle size={16} color="#10b981" /> {toastMessage}
        </div>
      )}

      <div className="weekly-emulation-content">
        {/* STEP 1: FILTERS & UPLOAD EXCEL */}
        <Card>
          <CardBody>
            <div className="emulation-filters mb-3">
              <div>
                <label className="text-xs font-semibold text-muted mb-1 block">
                  <Calendar size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                  Tuần thi đua
                </label>
                <Select
                  value={selectedWeek}
                  onChange={e => setSelectedWeek(e.target.value)}
                  options={weekOptions}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                <Button 
                  variant="primary" 
                  onClick={handleSaveCalculation}
                  disabled={saving || loadingWeek}
                >
                  <Save size={15} style={{ marginRight: '6px' }} />
                  {saving ? 'Đang lưu...' : 'Lưu kết quả thi đua'}
                </Button>

                <Button 
                  variant="secondary" 
                  onClick={handleExportExcel}
                  disabled={classes.length === 0}
                >
                  <FileSpreadsheet size={15} style={{ marginRight: '6px' }} />
                  Xuất Excel
                </Button>
              </div>
            </div>

            {/* Excel Upload Area */}
            <div className="emulation-upload-box">
              <div className="flex-between align-center flex-wrap gap-2">
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                    1. Nạp điểm Học tập (File thiduatuan.xlsx)
                  </h4>
                  <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>
                    Điểm học tập của lớp = Điểm HT + Điểm KL + Điểm VS trong file sổ đầu bài.
                  </p>
                </div>

                <div className="flex-row gap-2 flex-wrap">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx, .xls"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={14} style={{ marginRight: '4px' }} /> Chọn file Excel
                  </Button>

                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={handleLoadSampleExcel}
                    title="Nạp ngay dữ liệu từ file thiduatuan.xlsx có sẵn"
                  >
                    <BookOpen size={14} style={{ marginRight: '4px' }} /> Nạp thiduatuan.xlsx mẫu
                  </Button>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleDownloadTemplate}
                    title="Tải file mẫu thiduatuan.xlsx về máy"
                  >
                    <Download size={14} style={{ marginRight: '4px' }} /> Tải mẫu
                  </Button>
                </div>
              </div>

              {/* Status Banner */}
              {Object.keys(excelData).length > 0 ? (
                <div className="excel-status-banner success">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={16} />
                    <strong>Đã nạp dữ liệu:</strong> {excelFileName} ({Object.keys(excelData).length} lớp có điểm học tập)
                  </span>
                  <span className="text-xs">
                    (Ví dụ lớp 6/1: {excelData['6/1']?.totalHocTap?.toFixed(2) || '29.50'}đ)
                  </span>
                </div>
              ) : (
                <div className="excel-status-banner warning">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} />
                    <strong>Chưa có dữ liệu học tập:</strong> Vui lòng chọn file Excel hoặc bấm "Nạp thiduatuan.xlsx mẫu".
                  </span>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* STEP 2: UNLISTED VIOLATIONS RESOLUTION (IF ANY) */}
        {unlistedViolations.length > 0 && (
          <div className="unlisted-violations-box">
            <div className="unlisted-violations-title">
              <ShieldAlert size={18} />
              <span>Phát hiện {unlistedViolations.length} vi phạm phát sinh chưa có mức trừ điểm cố định:</span>
            </div>
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              Hệ thống đã nhận diện các vi phạm dưới đây không nằm trong 16 quy định trừ điểm mặc định (hoặc lỗi "Khác"). Vui lòng xác nhận số điểm trừ tương ứng:
            </p>

            <table className="unlisted-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Lớp</th>
                  <th>Học sinh</th>
                  <th>Ngày vi phạm</th>
                  <th>Lỗi vi phạm & Nội dung</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>Số điểm trừ</th>
                </tr>
              </thead>
              <tbody>
                {unlistedViolations.map(v => {
                  const currentPenalty = customPenalties[v.id] !== undefined ? customPenalties[v.id] : (v.diemtru || 1);
                  return (
                    <tr key={v.id}>
                      <td><strong>{v.tenlop}</strong></td>
                      <td>{v.hoten} {v.mahs ? `(${v.mahs})` : ''}</td>
                      <td>{v.ngayvipham ? format(parseISO(v.ngayvipham), 'dd/MM/yyyy') : '-'}</td>
                      <td>
                        <strong className="text-danger">{v.loaivipham || 'Khác'}</strong>
                        {v.noidung && <span className="text-muted"> — {v.noidung}</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <input 
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            className="sanitation-note-input"
                            style={{ width: '65px', textAlign: 'center', padding: '4px 6px' }}
                            value={currentPenalty}
                            onChange={e => handleCustomPenaltyChange(v.id, e.target.value)}
                          />
                          <span className="text-xs font-semibold text-danger">điểm</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* STEP 3: GRADE TABS & EMULATION RANKING TABLE */}
        <div className="flex-between align-center flex-wrap gap-2">
          <div className="emulation-grade-tabs">
            <button
              className={`grade-tab-btn ${selectedGrade === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedGrade('all')}
            >
              Tất cả các khối ({emulationResults.length})
            </button>
            {['6', '7', '8', '9'].map(g => {
              const count = emulationResults.filter(item => item.grade === g).length;
              return (
                <button
                  key={g}
                  className={`grade-tab-btn ${selectedGrade === g ? 'active' : ''}`}
                  onClick={() => setSelectedGrade(g)}
                >
                  Khối {g} ({count})
                </button>
              );
            })}
          </div>

          <div className="text-xs text-muted">
            * Xếp hạng theo từng khối • Cao điểm nhất đạt Hạng 1
          </div>
        </div>

        {/* RANKING TABLE */}
        <Card>
          <CardBody>
            <div className="flex-between align-center mb-3">
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Bảng xếp hạng thi đua {selectedGrade === 'all' ? 'toàn trường' : `Khối ${selectedGrade}`} ({selectedWeekLabel})
              </h4>
            </div>

            {loading || loadingWeek ? (
              <p className="text-center text-muted py-8">Đang tải và tính toán điểm thi đua...</p>
            ) : filteredResults.length === 0 ? (
              <p className="text-center text-muted py-8">Không tìm thấy dữ liệu lớp học phù hợp.</p>
            ) : (
              <div className="emulation-table-wrapper">
                <table className="emulation-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px', textAlign: 'center' }}>Hạng</th>
                      <th style={{ width: '90px' }}>Lớp</th>
                      <th>Giáo viên chủ nhiệm</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Học tập (SĐB)</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Kỷ luật (50đ)</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Vệ sinh (20đ)</th>
                      <th style={{ textAlign: 'center', width: '140px' }}>Tổng điểm thi đua</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map(item => (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center' }}>
                          {getRankBadgeContent(item.rank)}
                        </td>
                        <td>
                          <strong>{item.className}</strong>
                          <div className="text-xs text-muted">Khối {item.grade}</div>
                        </td>
                        <td>{item.homeroomTeacherName || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 600 }}>
                            {item.hasExcel ? item.hocTapScore.toFixed(2) : <span className="text-muted">Chưa nạp</span>}
                          </span>
                          {item.excelDetails && (
                            <div className="text-xs text-muted">
                              ({item.excelDetails.diemHocTap}+{item.excelDetails.diemKyLuat}+{item.excelDetails.diemVeSinh})
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, color: item.kyLuatScore < 50 ? '#dc2626' : '#10b981' }}>
                            {item.kyLuatScore.toFixed(2)}
                          </span>
                          {item.totalDisciplineDeduction > 0 && (
                            <div className="text-xs text-danger">
                              (-{item.totalDisciplineDeduction}đ vi phạm)
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, color: item.veSinhScore < 20 ? '#dc2626' : '#10b981' }}>
                            {item.veSinhScore.toFixed(2)}
                          </span>
                          {item.totalSanitationDeduction > 0 && (
                            <div className="text-xs text-danger">
                              (-{item.totalSanitationDeduction}đ trừ)
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="total-score-pill">
                            {item.totalScore.toFixed(2)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setDetailClass(item)}
                            title="Xem chi tiết các khoản điểm của lớp"
                          >
                            <Eye size={14} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* DETAIL MODAL */}
      {detailClass && (
        <div className="emulation-modal-overlay" onClick={() => setDetailClass(null)}>
          <div className="emulation-modal" onClick={e => e.stopPropagation()}>
            <div className="emulation-modal-header">
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                Chi tiết thi đua lớp {detailClass.className} ({selectedWeekLabel})
              </h3>
              <button 
                type="button" 
                onClick={() => setDetailClass(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="emulation-modal-body">
              {/* Tổng quan điểm số */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                textAlign: 'center',
                padding: '10px',
                background: 'rgba(14, 165, 233, 0.08)',
                borderRadius: '10px'
              }}>
                <div>
                  <div className="text-xs text-muted font-semibold">Học tập</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0284c7' }}>
                    {detailClass.hocTapScore.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold">Kỷ luật</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>
                    {detailClass.kyLuatScore.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold">Vệ sinh</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#8b5cf6' }}>
                    {detailClass.veSinhScore.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted font-semibold">Tổng điểm</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>
                    {detailClass.totalScore.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* 1. Chi tiết học tập */}
              <div className="emulation-detail-section">
                <div className="emulation-detail-title">
                  <BookOpen size={16} className="text-primary" />
                  <span>1. Điểm học tập (Sổ đầu bài từ file Excel):</span>
                </div>
                {detailClass.excelDetails ? (
                  <div className="text-xs" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>• Điểm học tập: <strong>{detailClass.excelDetails.diemHocTap}</strong></div>
                    <div>• Điểm kỷ luật: <strong>{detailClass.excelDetails.diemKyLuat}</strong></div>
                    <div>• Điểm vệ sinh (sổ đầu bài): <strong>{detailClass.excelDetails.diemVeSinh}</strong></div>
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '4px', fontWeight: 700 }}>
                      ➔ Tổng điểm học tập: {detailClass.hocTapScore.toFixed(2)} điểm
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted" style={{ margin: 0 }}>
                    Chưa nạp dữ liệu Excel cho lớp này (Điểm tính: 0).
                  </p>
                )}
              </div>

              {/* 2. Chi tiết kỷ luật */}
              <div className="emulation-detail-section">
                <div className="emulation-detail-title">
                  <ShieldAlert size={16} className="text-danger" />
                  <span>2. Điểm kỷ luật (50 điểm ban đầu - vi phạm học sinh):</span>
                </div>
                {detailClass.violationDetails.length === 0 ? (
                  <p className="text-xs text-success font-semibold" style={{ margin: 0 }}>
                    ✓ Lớp không có học sinh nào bị ghi nhận vi phạm trong tuần này (Đạt trọn vẹn 50 điểm).
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div className="text-xs font-semibold text-danger">
                      Bị trừ {detailClass.totalDisciplineDeduction} điểm từ {detailClass.violationDetails.length} lượt vi phạm:
                    </div>
                    {detailClass.violationDetails.map((v, idx) => (
                      <div key={v.id || idx} style={{
                        fontSize: '0.8rem',
                        padding: '6px 8px',
                        background: 'var(--card-bg, #fff)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)'
                      }}>
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>-{v.penalty}đ</span>
                        {' '}• <strong>{v.hoten}</strong> ({v.mahs || 'HS'}):
                        {' '}<span style={{ color: '#b91c1c' }}>{v.loaivipham}</span>
                        {v.noidung && <span className="text-muted"> ({v.noidung})</span>}
                        {v.ngayvipham && (
                          <span className="text-muted" style={{ marginLeft: '4px', fontSize: '0.75rem' }}>
                            [{format(parseISO(v.ngayvipham), 'dd/MM')}]
                          </span>
                        )}
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                      ➔ Điểm kỷ luật còn lại: 50 - {detailClass.totalDisciplineDeduction} = {detailClass.kyLuatScore.toFixed(2)} điểm
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Chi tiết vệ sinh */}
              <div className="emulation-detail-section">
                <div className="emulation-detail-title">
                  <Sparkles size={16} style={{ color: '#8b5cf6' }} />
                  <span>3. Điểm vệ sinh (20 điểm ban đầu - Chấm vệ sinh tuần):</span>
                </div>
                {detailClass.sanitationDetails.length === 0 ? (
                  <p className="text-xs text-success font-semibold" style={{ margin: 0 }}>
                    ✓ Lớp không bị trừ điểm vệ sinh nào trong tuần (Đạt trọn vẹn 20 điểm).
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div className="text-xs font-semibold text-danger">
                      Bị trừ {detailClass.totalSanitationDeduction} điểm qua {detailClass.sanitationDetails.length} lần chấm:
                    </div>
                    {detailClass.sanitationDetails.map((d, idx) => (
                      <div key={d.id || idx} style={{
                        fontSize: '0.8rem',
                        padding: '6px 8px',
                        background: 'var(--card-bg, #fff)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)'
                      }}>
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>-{d.pointsDeducted}đ</span>
                        {' '}• {d.gradedBy || 'Giám thị'}:
                        {' '}<span>{d.violations?.join(', ')}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '4px', fontSize: '0.8rem', fontWeight: 700 }}>
                      ➔ Điểm vệ sinh còn lại: {detailClass.veSinhScore.toFixed(2)} điểm
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
