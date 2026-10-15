import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { 
  Sparkles, 
  Save, 
  Trash2, 
  ClipboardCheck, 
  Award, 
  Check, 
  X,
  FileSpreadsheet,
  AlertCircle,
  Calendar,
  Clock,
  User,
  History
} from 'lucide-react';
import { format, parse, parseISO } from 'date-fns';
import { 
  fetchClasses, 
  fetchSystemSettings, 
  fetchClassSanitationByWeek, 
  addClassSanitationDeduction, 
  deleteClassSanitationDeduction 
} from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import './ClassSanitation.css';

const COMMON_VIOLATIONS = [
  { id: 'don_ghe', label: 'Không dọn ghế sau giờ xếp hàng', penalty: 2 },
  { id: 'don_rac', label: 'Không dọn rác sau giờ xếp hàng', penalty: 2 },
  { id: 'do_an_uong', label: 'Mang đồ ăn, nước ngọt lên lớp', penalty: 3 },
  { id: 've_sinh_do', label: 'Vệ sinh lớp dơ', penalty: 2 },
  { id: 'xa_rac', label: 'Xả rác trên hành lang, lớp học', penalty: 2 },
  { id: 'tat_dien', label: 'Quên tắt đèn/quạt', penalty: 2 },
  { id: 'hanh_lang_do', label: 'Hành lang lớp dơ', penalty: 1 }
];

export function ClassSanitation() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingWeekData, setLoadingWeekData] = useState(false);
  const [savingClass, setSavingClass] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Filters & Tabs
  const [selectedWeek, setSelectedWeek] = useState('1');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('grading'); // 'grading' | 'summary'

  // Deductions for currently selected week: array of { id, week, className, pointsDeducted, violations, note, gradedBy, gradedById, date, createdAt }
  const [deductions, setDeductions] = useState([]);

  // Draft state per class for adding new deduction: { [className]: { selectedViolations: [], note: '' } }
  const [draftForms, setDraftForms] = useState({});

  // Notification / toast feedback
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 1. Initial Load: classes and settings
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [classesData, sData] = await Promise.all([
          fetchClasses(),
          fetchSystemSettings()
        ]);
        setClasses(classesData || []);
        setSettings(sData);

        // Calculate current week
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
        console.error("Lỗi khởi tạo trang chấm vệ sinh:", err);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  // 2. Fetch deductions whenever selectedWeek changes
  useEffect(() => {
    const loadWeekDeductions = async () => {
      if (!selectedWeek) return;
      setLoadingWeekData(true);
      try {
        const data = await fetchClassSanitationByWeek(selectedWeek);
        setDeductions(data || []);
      } catch (err) {
        console.error("Lỗi khi tải dữ liệu chấm vệ sinh theo tuần:", err);
      } finally {
        setLoadingWeekData(false);
      }
    };
    loadWeekDeductions();
  }, [selectedWeek]);

  // Generate week options for dropdown
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

  // Selected week label for titles
  const selectedWeekLabel = useMemo(() => {
    const found = weekOptions.find(w => w.value === selectedWeek);
    return found ? found.label : `Tuần ${selectedWeek}`;
  }, [weekOptions, selectedWeek]);

  // Filtered classes by grade
  const filteredClasses = useMemo(() => {
    return classes.filter(c => {
      if (gradeFilter === 'all') return true;
      return c.khoi === gradeFilter || c.tenlop?.startsWith(gradeFilter);
    });
  }, [classes, gradeFilter]);

  // Group deductions by class: { [className]: [ deduction1, deduction2, ... ] }
  const deductionsByClass = useMemo(() => {
    const map = {};
    deductions.forEach(d => {
      if (!map[d.className]) map[d.className] = [];
      map[d.className].push(d);
    });
    // Sort each class's deductions newest first
    Object.keys(map).forEach(cls => {
      map[cls].sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    });
    return map;
  }, [deductions]);

  // Helper to compute class score in selected week: max(0, 20 - totalDeducted)
  const getClassScoreInfo = (className) => {
    const list = deductionsByClass[className] || [];
    const totalDeducted = list.reduce((sum, d) => sum + (parseFloat(d.pointsDeducted) || 0), 0);
    const score = Math.max(0, 20 - totalDeducted);
    return {
      score,
      totalDeducted,
      deductionsCount: list.length,
      list
    };
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = filteredClasses.length;
    let fullScore = 0;
    let penalized = 0;
    let totalScore = 0;

    filteredClasses.forEach(c => {
      const { score } = getClassScoreInfo(c.tenlop);
      totalScore += score;
      if (score === 20) fullScore++;
      else penalized++;
    });

    const avg = total > 0 ? (totalScore / total).toFixed(1) : '20.0';
    return { total, fullScore, penalized, avg };
  }, [filteredClasses, deductionsByClass]);

  // Toggle violation selection for a class
  const handleToggleViolation = (className, violation) => {
    setDraftForms(prev => {
      const current = prev[className] || { selectedViolations: [], note: '' };
      const exists = current.selectedViolations.includes(violation.label);
      const nextViolations = exists 
        ? current.selectedViolations.filter(v => v !== violation.label)
        : [...current.selectedViolations, violation.label];
      
      return {
        ...prev,
        [className]: {
          ...current,
          selectedViolations: nextViolations
        }
      };
    });
  };

  // Change draft note for a class
  const handleNoteChange = (className, note) => {
    setDraftForms(prev => ({
      ...prev,
      [className]: {
        ...(prev[className] || { selectedViolations: [] }),
        note
      }
    }));
  };

  // Change custom violation text and penalty
  const handleCustomViolationChange = (className, field, value) => {
    setDraftForms(prev => ({
      ...prev,
      [className]: {
        ...(prev[className] || { selectedViolations: [] }),
        [field]: value
      }
    }));
  };

  // Format deduction timestamp for audit
  const formatDeductionTime = (d) => {
    if (d.createdAt) {
      if (typeof d.createdAt.toDate === 'function') {
        return format(d.createdAt.toDate(), 'HH:mm dd/MM/yyyy');
      }
      if (d.createdAt.seconds) {
        return format(new Date(d.createdAt.seconds * 1000), 'HH:mm dd/MM/yyyy');
      }
    }
    if (d.date) {
      try {
        return format(parseISO(d.date), 'dd/MM/yyyy');
      } catch {
        return d.date;
      }
    }
    return 'Vừa xong';
  };

  // Save deduction for a single class
  const handleSaveClass = async (className) => {
    const draft = draftForms[className] || { selectedViolations: [], otherViolation: '', otherPenalty: '', note: '' };
    const selectedViolations = [...(draft.selectedViolations || [])];

    const standardPenalty = selectedViolations.reduce((sum, vLabel) => {
      const v = COMMON_VIOLATIONS.find(item => item.label === vLabel);
      return sum + (v ? v.penalty : 0);
    }, 0);

    const customText = (draft.otherViolation || '').trim();
    const customPenalty = parseFloat(draft.otherPenalty) || 0;

    if (customText && customPenalty > 0) {
      selectedViolations.push(`${customText} (-${customPenalty}đ)`);
    } else if (customText && customPenalty <= 0) {
      alert(`Vui lòng nhập số điểm trừ cho lỗi phát sinh "${customText}".`);
      return;
    } else if (!customText && customPenalty > 0) {
      alert(`Vui lòng nhập tên lỗi vi phạm phát sinh tương ứng với ${customPenalty} điểm trừ.`);
      return;
    }

    const totalPointsToDeduct = standardPenalty + (customText ? customPenalty : 0);

    if (totalPointsToDeduct <= 0 || selectedViolations.length === 0) {
      alert(`Vui lòng chọn ít nhất 1 lỗi vi phạm hoặc nhập lỗi phát sinh khác cùng số điểm trừ để trừ điểm lớp ${className}.`);
      return;
    }

    setSavingClass(className);
    try {
      const deductionData = {
        week: selectedWeek,
        className: className,
        pointsDeducted: totalPointsToDeduct,
        violations: selectedViolations,
        note: draft.note || '',
        gradedBy: user?.fullName || user?.username || 'Giám thị',
        gradedById: user?.id || null,
        date: format(new Date(), 'yyyy-MM-dd')
      };

      const res = await addClassSanitationDeduction(deductionData);
      if (res.success) {
        // Optimistically add to deductions list
        const newRecord = {
          id: res.id,
          ...deductionData,
          createdAt: { seconds: Math.floor(Date.now() / 1000) }
        };
        setDeductions(prev => [newRecord, ...prev]);

        // Reset draft for this class
        setDraftForms(prev => ({
          ...prev,
          [className]: { selectedViolations: [], otherViolation: '', otherPenalty: '', note: '' }
        }));

        showToast(`Đã lưu trừ ${totalPointsToDeduct} điểm cho lớp ${className}!`);
      } else {
        alert("Lỗi khi lưu trừ điểm: " + res.error);
      }
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi: " + err.message);
    } finally {
      setSavingClass(null);
    }
  };

  // Delete a specific deduction record
  const handleDeleteDeduction = async (d) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa lần trừ ${d.pointsDeducted}đ của lớp ${d.className}?`)) {
      return;
    }

    setDeletingId(d.id);
    try {
      const res = await deleteClassSanitationDeduction(d.id);
      if (res.success) {
        setDeductions(prev => prev.filter(item => item.id !== d.id));
        showToast(`Đã xóa lần trừ điểm của lớp ${d.className}`);
      } else {
        alert("Lỗi khi xóa: " + res.error);
      }
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi: " + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Score styling badges
  const getScoreBadgeClass = (score) => {
    if (score >= 19) return 'sanitation-score-10';
    if (score >= 15) return 'sanitation-score-high';
    if (score >= 10) return 'sanitation-score-med';
    return 'sanitation-score-low';
  };

  const getScoreRatingText = (score) => {
    if (score >= 18) return 'Tốt';
    if (score >= 14) return 'Khá';
    if (score >= 10) return 'Đạt';
    return 'Chưa đạt';
  };

  // Export to Excel for weekly summary
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Tuan_${selectedWeek}`);

    worksheet.columns = [
      { width: 8 },  // STT
      { width: 14 }, // Lớp
      { width: 14 }, // Điểm tổng kết
      { width: 16 }, // Xếp loại
      { width: 16 }, // Tổng điểm trừ
      { width: 50 }, // Chi tiết các lần trừ điểm
      { width: 25 }  // GVCN
    ];

    // Header 1: School Name & Country
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

    // Header 2: Sub-motto
    worksheet.mergeCells('A2:C2');
    const cellA2 = worksheet.getCell('A2');
    cellA2.value = "LIÊN ĐỘI - BAN THI ĐUA";
    cellA2.font = { name: 'Times New Roman', size: 11, italic: true };
    cellA2.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('D2:G2');
    const cellD2 = worksheet.getCell('D2');
    cellD2.value = "Độc lập - Tự do - Hạnh phúc";
    cellD2.font = { name: 'Times New Roman', size: 11, bold: true, underline: true };
    cellD2.alignment = { horizontal: 'center', vertical: 'middle' };

    // Title
    worksheet.mergeCells('A4:G4');
    const cellA4 = worksheet.getCell('A4');
    cellA4.value = `BẢNG TỔNG HỢP ĐIỂM VỆ SINH CÁC LỚP - ${selectedWeekLabel.toUpperCase()}`;
    cellA4.font = { name: 'Times New Roman', size: 14, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    // Table Header
    const headers = ["STT", "Lớp", "Điểm (Thang 20)", "Xếp loại", "Tổng điểm trừ", "Chi tiết các lần trừ điểm (Tài khoản - Thời gian - Số điểm - Lỗi)", "GVCN"];
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
        fgColor: { argb: 'FFE2E8F0' }
      };
    });

    // Rows
    filteredClasses.forEach((c, idx) => {
      const { score, totalDeducted, list } = getClassScoreInfo(c.tenlop);
      const rating = getScoreRatingText(score);

      let detailsStr = "Không vi phạm (Đạt trọn vẹn 20đ)";
      if (list.length > 0) {
        detailsStr = list.map((d, dIdx) => {
          const timeStr = formatDeductionTime(d);
          const vStr = d.violations?.join(', ') || 'Vi phạm';
          const noteStr = d.note ? ` [Ghi chú: ${d.note}]` : '';
          return `${dIdx + 1}. [${timeStr}] ${d.gradedBy} trừ ${d.pointsDeducted}đ: ${vStr}${noteStr}`;
        }).join('\n');
      }

      const row = worksheet.addRow([
        idx + 1,
        c.tenlop,
        score,
        rating,
        totalDeducted > 0 ? `-${totalDeducted}đ` : '0đ',
        detailsStr,
        c.homeroomTeacherName || ''
      ]);

      row.font = { name: 'Times New Roman', size: 12 };
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if ([1, 2, 3, 4, 5].includes(colNumber)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { vertical: 'middle', wrapText: true };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `BangTongHop_VeSinh_Tuan_${selectedWeek}.xlsx`);
  };

  return (
    <div className="sanitation-page">
      <Header title="Chấm vệ sinh lớp" />

      {/* Floating feedback toast */}
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
          <Check size={16} color="#10b981" /> {toastMessage}
        </div>
      )}

      <div className="sanitation-content">
        {/* FILTERS CARD */}
        <Card>
          <CardBody>
            <div className="sanitation-filters">
              <div>
                <label className="text-xs font-semibold text-muted mb-1 block">
                  <Calendar size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                  Tuần học
                </label>
                <Select
                  value={selectedWeek}
                  onChange={e => setSelectedWeek(e.target.value)}
                  options={weekOptions}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted mb-1 block">Khối lớp</label>
                <Select
                  value={gradeFilter}
                  onChange={e => setGradeFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'Tất cả khối' },
                    { value: '6', label: 'Khối 6' },
                    { value: '7', label: 'Khối 7' },
                    { value: '8', label: 'Khối 8' },
                    { value: '9', label: 'Khối 9' }
                  ]}
                />
              </div>
            </div>

            {/* QUICK STATS */}
            <div className="sanitation-summary-grid">
              <div className="sanitation-stat-card">
                <span className="sanitation-stat-value text-primary">{stats.total}</span>
                <span className="sanitation-stat-label">Tổng số lớp</span>
              </div>
              <div className="sanitation-stat-card">
                <span className="sanitation-stat-value text-success">{stats.fullScore}</span>
                <span className="sanitation-stat-label">Lớp đạt 20đ</span>
              </div>
              <div className="sanitation-stat-card">
                <span className="sanitation-stat-value text-danger">{stats.penalized}</span>
                <span className="sanitation-stat-label">Bị trừ điểm</span>
              </div>
              <div className="sanitation-stat-card">
                <span className="sanitation-stat-value" style={{ color: '#8b5cf6' }}>{stats.avg}</span>
                <span className="sanitation-stat-label">Điểm TB tuần</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* TABS & ACTIONS */}
        <div className="flex-between gap-2 flex-wrap">
          <div className="sanitation-tabs">
            <button 
              className={`sanitation-tab-btn ${activeTab === 'grading' ? 'active' : ''}`}
              onClick={() => setActiveTab('grading')}
            >
              <ClipboardCheck size={16} /> Chấm điểm ({filteredClasses.length} lớp)
            </button>
            <button 
              className={`sanitation-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              <Award size={16} /> Bảng tổng hợp tuần
            </button>
          </div>

          <div>
            <Button variant="secondary" size="sm" onClick={handleExportExcel}>
              <FileSpreadsheet size={15} style={{ marginRight: '4px' }} /> Xuất Excel tuần
            </Button>
          </div>
        </div>

        {/* TAB 1: GRADING CARDS */}
        {loading || loadingWeekData ? (
          <p className="text-center text-muted py-8">Đang tải danh sách lớp và dữ liệu chấm...</p>
        ) : filteredClasses.length === 0 ? (
          <p className="text-center text-muted py-8">Không tìm thấy lớp học nào phù hợp.</p>
        ) : activeTab === 'grading' ? (
          <div className="sanitation-list">
            {filteredClasses.map(c => {
              const { score, totalDeducted, list } = getClassScoreInfo(c.tenlop);
              const draft = draftForms[c.tenlop] || { selectedViolations: [], otherViolation: '', otherPenalty: '', note: '' };
              const selectedViolations = draft.selectedViolations || [];

              const standardPenalty = selectedViolations.reduce((sum, vLabel) => {
                const v = COMMON_VIOLATIONS.find(item => item.label === vLabel);
                return sum + (v ? v.penalty : 0);
              }, 0);

              const customText = (draft.otherViolation || '').trim();
              const customPenalty = parseFloat(draft.otherPenalty) || 0;
              const hasValidCustom = customText !== '' && customPenalty > 0;
              const totalPendingPenalty = standardPenalty + (hasValidCustom ? customPenalty : 0);

              const previewScore = Math.max(0, score - totalPendingPenalty);
              const isSaving = savingClass === c.tenlop;
              const canSave = selectedViolations.length > 0 || hasValidCustom;

              return (
                <div 
                  key={c.id || c.tenlop} 
                  className={`sanitation-class-card ${totalDeducted > 0 ? 'has-violations' : ''}`}
                >
                  {/* Card Header */}
                  <div className="sanitation-class-header">
                    <div className="sanitation-class-name">
                      <span>{c.tenlop}</span>
                      {c.homeroomTeacherName && (
                        <span className="text-xs text-muted" style={{ fontWeight: 400 }}>
                          (GVCN: {c.homeroomTeacherName})
                        </span>
                      )}
                    </div>
                    <div className={`sanitation-score-pill ${getScoreBadgeClass(score)}`}>
                      <span>{score}/20 điểm</span>
                      <span>• {getScoreRatingText(score)}</span>
                      {totalDeducted > 0 && (
                        <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                          (-{totalDeducted}đ tuần này)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="sanitation-card-body">
                    {/* Previous Deductions History in this Week */}
                    {list.length > 0 && (
                      <div className="deduction-history-box">
                        <div className="deduction-history-title">
                          <History size={14} />
                          <span>Lịch sử trừ điểm tuần này ({list.length} lần ghi nhận):</span>
                        </div>
                        <div className="deduction-history-list">
                          {list.map((d) => (
                            <div key={d.id} className="deduction-item">
                              <div className="deduction-item-info">
                                <div className="deduction-item-header">
                                  <span className="deduction-badge">-{d.pointsDeducted}đ</span>
                                  <span>{d.violations?.join(', ') || 'Vi phạm vệ sinh'}</span>
                                </div>
                                <div className="deduction-item-meta">
                                  <span>
                                    <Clock size={11} style={{ display: 'inline', marginRight: '3px', verticalAlign: '-1px' }} />
                                    {formatDeductionTime(d)}
                                  </span>
                                  <span style={{ margin: '0 6px' }}>•</span>
                                  <span>
                                    <User size={11} style={{ display: 'inline', marginRight: '3px', verticalAlign: '-1px' }} />
                                    {d.gradedBy || 'Giám thị'}
                                  </span>
                                  {d.note && (
                                    <>
                                      <span style={{ margin: '0 6px' }}>•</span>
                                      <span style={{ fontStyle: 'italic' }}>Ghi chú: {d.note}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="deduction-delete-btn"
                                title="Xóa lần trừ điểm này"
                                disabled={deletingId === d.id}
                                onClick={() => handleDeleteDeduction(d)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* New Deduction Checklist */}
                    <div>
                      <span className="text-xs font-semibold text-muted mb-2 block">
                        Chọn lỗi vi phạm để trừ điểm lần này:
                      </span>
                      <div className="violation-chips-group">
                        {COMMON_VIOLATIONS.map(v => {
                          const isSelected = selectedViolations.includes(v.label);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              className={`violation-chip ${isSelected ? 'selected' : ''}`}
                              onClick={() => handleToggleViolation(c.tenlop, v)}
                            >
                              {isSelected ? <X size={12} /> : null}
                              <span>{v.label} (-{v.penalty}đ)</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Lỗi vi phạm phát sinh khác */}
                    <div className="custom-violation-box">
                      <span className="text-xs font-semibold text-muted">
                        Vi phạm khác (nếu không có trong 7 lỗi gợi ý ở trên):
                      </span>
                      <div className="custom-violation-inputs">
                        <input 
                          type="text"
                          className="sanitation-note-input"
                          placeholder="Nhập tên lỗi phát sinh (vd: Vẽ bậy lên bàn, làm hỏng chậu hoa, làm đổ nước...)"
                          value={draft.otherViolation || ''}
                          onChange={e => handleCustomViolationChange(c.tenlop, 'otherViolation', e.target.value)}
                          style={{ flex: 1, minWidth: '200px' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="text-xs font-semibold text-danger">Trừ:</span>
                          <input 
                            type="number"
                            min="0.5"
                            max="20"
                            step="0.5"
                            className="sanitation-note-input"
                            placeholder="Số điểm"
                            value={draft.otherPenalty || ''}
                            onChange={e => handleCustomViolationChange(c.tenlop, 'otherPenalty', e.target.value)}
                            style={{ width: '85px', textAlign: 'center' }}
                          />
                          <span className="text-xs font-semibold text-muted">điểm</span>
                        </div>
                      </div>
                    </div>

                    {/* Note input */}
                    <div>
                      <input 
                        type="text"
                        className="sanitation-note-input"
                        placeholder="Ghi chú cụ thể (vd: học sinh vi phạm, vị trí rác, bàn ghế chưa ngay ngắn...)"
                        value={draft.note || ''}
                        onChange={e => handleNoteChange(c.tenlop, e.target.value)}
                      />
                    </div>

                    {/* Per-class Action Area & Save Button */}
                    <div className="class-action-area">
                      <div className="points-deduct-preview">
                        {totalPendingPenalty > 0 ? (
                          <span className="text-danger">
                            Trừ lần này: -{totalPendingPenalty}đ ➔ Điểm sau khi lưu: <strong>{previewScore}/20đ</strong>
                          </span>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            Chưa chọn hoặc nhập lỗi vi phạm mới
                          </span>
                        )}
                      </div>

                      <Button 
                        size="sm"
                        disabled={!canSave || isSaving}
                        onClick={() => handleSaveClass(c.tenlop)}
                      >
                        <Save size={14} style={{ marginRight: '5px' }} />
                        {isSaving ? 'Đang lưu...' : `Lưu trừ điểm lớp ${c.tenlop}`}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* TAB 2: WEEKLY SUMMARY */
          <Card>
            <CardBody>
              <div className="flex-between align-center mb-3 flex-wrap gap-2">
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                    Bảng tổng hợp điểm vệ sinh ({selectedWeekLabel})
                  </h4>
                  <p className="text-xs text-muted mt-1" style={{ margin: 0 }}>
                    Thang điểm chuẩn 20 điểm / tuần • Điểm không âm (tối thiểu 0 điểm)
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleExportExcel}>
                  <FileSpreadsheet size={15} style={{ marginRight: '4px' }} /> Xuất Excel
                </Button>
              </div>

              <div className="sanitation-table-wrapper">
                <table className="sanitation-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px', textAlign: 'center' }}>STT</th>
                      <th style={{ width: '90px' }}>Lớp</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Điểm tuần</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Xếp loại</th>
                      <th style={{ width: '110px', textAlign: 'center' }}>Tổng điểm trừ</th>
                      <th>Chi tiết các lần trừ điểm trong tuần (Tài khoản - Thời gian - Số điểm - Lỗi)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClasses.map((c, index) => {
                      const { score, totalDeducted, list } = getClassScoreInfo(c.tenlop);
                      return (
                        <tr key={c.id || c.tenlop}>
                          <td style={{ textAlign: 'center' }}>{index + 1}</td>
                          <td>
                            <strong>{c.tenlop}</strong>
                            {c.homeroomTeacherName && (
                              <div className="text-xs text-muted">{c.homeroomTeacherName}</div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`sanitation-score-pill ${getScoreBadgeClass(score)}`}>
                              {score}/20
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>
                            {getScoreRatingText(score)}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: totalDeducted > 0 ? '#dc2626' : '#10b981' }}>
                            {totalDeducted > 0 ? `-${totalDeducted}đ` : '0đ'}
                          </td>
                          <td>
                            {list.length === 0 ? (
                              <span className="text-success" style={{ fontSize: '0.8rem' }}>
                                ✓ Không vi phạm (Đạt trọn vẹn 20đ)
                              </span>
                            ) : (
                              <div>
                                {list.map((d, dIdx) => (
                                  <div key={d.id || dIdx} className="summary-log-entry">
                                    <span style={{ fontWeight: 600, color: '#dc2626' }}>
                                      -{d.pointsDeducted}đ
                                    </span>
                                    {' '}• <strong>{d.gradedBy || 'Giám thị'}</strong>
                                    {' '}({formatDeductionTime(d)}):
                                    {' '}<span style={{ color: 'var(--text-color)' }}>{d.violations?.join(', ')}</span>
                                    {d.note && (
                                      <span className="text-muted"> — Ghi chú: {d.note}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
