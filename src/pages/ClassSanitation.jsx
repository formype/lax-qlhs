import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { DayPicker } from '../components/ui/DatePicker';
import { 
  Sparkles, 
  CheckCircle, 
  AlertTriangle, 
  Save, 
  Download, 
  RotateCcw, 
  Search, 
  Filter, 
  ClipboardCheck, 
  Award, 
  Check, 
  X,
  FileSpreadsheet
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchClasses, saveClassSanitation, fetchClassSanitationByDate } from '../lib/firebase';
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
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [session, setSession] = useState(new Date().getHours() < 12 ? 'Sáng' : 'Chiều');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('grading'); // 'grading' | 'summary'

  // Records state: { [className]: { score: 10, violations: [], note: '', isModified: false } }
  const [records, setRecords] = useState({});

  useEffect(() => {
    const loadClassesList = async () => {
      setLoadingClasses(true);
      const data = await fetchClasses();
      setClasses(data);
      setLoadingClasses(false);
    };
    loadClassesList();
  }, []);

  // Fetch sanitation records whenever date or session changes
  useEffect(() => {
    const loadData = async () => {
      if (!date || !session) return;
      setLoadingData(true);
      try {
        const existingData = await fetchClassSanitationByDate(date, session);
        const initialRecords = {};
        
        // Populate existing data or create blank record
        classes.forEach(c => {
          if (existingData && existingData[c.tenlop]) {
            const item = existingData[c.tenlop];
            initialRecords[c.tenlop] = {
              className: c.tenlop,
              score: typeof item.score === 'number' ? item.score : 20,
              violations: item.violations || [],
              note: item.note || '',
              gradedBy: item.gradedBy || '',
              hasSavedData: true
            };
          } else {
            initialRecords[c.tenlop] = {
              className: c.tenlop,
              score: 20,
              violations: [],
              note: '',
              hasSavedData: false
            };
          }
        });
        setRecords(initialRecords);
      } catch (err) {
        console.error("Lỗi khi tải dữ liệu chấm vệ sinh:", err);
      } finally {
        setLoadingData(false);
      }
    };

    if (classes.length > 0) {
      loadData();
    }
  }, [date, session, classes]);

  // Filtered classes by grade
  const filteredClasses = useMemo(() => {
    return classes.filter(c => {
      if (gradeFilter === 'all') return true;
      return c.khoi === gradeFilter || c.tenlop?.startsWith(gradeFilter);
    });
  }, [classes, gradeFilter]);

  // Stats calculation
  const stats = useMemo(() => {
    let total = filteredClasses.length;
    let graded = 0;
    let fullScore = 0;
    let penalized = 0;
    let totalScore = 0;

    filteredClasses.forEach(c => {
      const r = records[c.tenlop];
      if (r && r.hasSavedData) {
        graded++;
        totalScore += r.score;
        if (r.score === 20) fullScore++;
        else penalized++;
      }
    });

    const avg = graded > 0 ? (totalScore / graded).toFixed(1) : '-';
    return { total, graded, fullScore, penalized, avg };
  }, [filteredClasses, records]);

  // Toggle violation for a class
  const handleToggleViolation = (className, violation) => {
    setRecords(prev => {
      const current = prev[className] || { className, score: 20, violations: [], note: '' };
      const exists = current.violations.includes(violation.label);
      const newViolations = exists 
        ? current.violations.filter(v => v !== violation.label)
        : [...current.violations, violation.label];
      
      // Auto calculate score based on default 20 minus total penalties
      const totalPenalty = newViolations.reduce((sum, vLabel) => {
        const item = COMMON_VIOLATIONS.find(v => v.label === vLabel);
        return sum + (item ? item.penalty : 1);
      }, 0);

      const calculatedScore = Math.max(0, 20 - totalPenalty);

      return {
        ...prev,
        [className]: {
          ...current,
          violations: newViolations,
          score: calculatedScore,
          isModified: true
        }
      };
    });
  };

  // Change score manually
  const handleScoreChange = (className, newScore) => {
    const validScore = Math.min(20, Math.max(0, parseFloat(newScore) || 0));
    setRecords(prev => ({
      ...prev,
      [className]: {
        ...(prev[className] || { className, violations: [], note: '' }),
        score: validScore,
        isModified: true
      }
    }));
  };

  // Change note
  const handleNoteChange = (className, note) => {
    setRecords(prev => ({
      ...prev,
      [className]: {
        ...(prev[className] || { className, score: 20, violations: [] }),
        note,
        isModified: true
      }
    }));
  };

  // Quick mark all 20 points
  const handleMarkAllPerfect = () => {
    if (!window.confirm(`Đánh dấu tất cả các lớp trong khối đang chọn đạt 20 điểm (Tốt)?`)) return;
    setRecords(prev => {
      const updated = { ...prev };
      filteredClasses.forEach(c => {
        updated[c.tenlop] = {
          ...(updated[c.tenlop] || { className: c.tenlop }),
          score: 20,
          violations: [],
          isModified: true
        };
      });
      return updated;
    });
  };

  // Save all classes
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const recordsToSave = filteredClasses.map(c => {
        const r = records[c.tenlop] || { className: c.tenlop, score: 20, violations: [], note: '' };
        return {
          className: c.tenlop,
          score: r.score,
          violations: r.violations,
          note: r.note
        };
      });

      const res = await saveClassSanitation(date, session, recordsToSave, user);
      if (res.success) {
        alert("Lưu kết quả chấm vệ sinh thành công!");
        // Mark all as saved
        setRecords(prev => {
          const updated = { ...prev };
          filteredClasses.forEach(c => {
            if (updated[c.tenlop]) {
              updated[c.tenlop].hasSavedData = true;
              updated[c.tenlop].isModified = false;
            }
          });
          return updated;
        });
      } else {
        alert("Có lỗi xảy ra khi lưu: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Đã xảy ra lỗi: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('ChamVeSinh');

    worksheet.columns = [
      { width: 8 },  // STT
      { width: 14 }, // Lớp
      { width: 12 }, // Điểm
      { width: 16 }, // Xếp loại
      { width: 35 }, // Lỗi trừ điểm
      { width: 30 }, // Ghi chú
      { width: 20 }  // Người chấm
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
    const formattedDate = format(parseISO(date), 'dd/MM/yyyy');
    cellA4.value = `BẢNG CHẤM ĐIỂM VỆ SINH CÁC LỚP (${session.toUpperCase()} - NGÀY ${formattedDate})`;
    cellA4.font = { name: 'Times New Roman', size: 14, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    // Table Header
    const headers = ["STT", "Lớp", "Điểm", "Xếp loại", "Các lỗi vi phạm", "Ghi chú cụ thể", "Người chấm"];
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
      const r = records[c.tenlop] || { score: 20, violations: [], note: '' };
      const rating = r.score >= 18 ? 'Tốt' : r.score >= 14 ? 'Khá' : r.score >= 10 ? 'Trung bình' : 'Chưa đạt';
      const violationsStr = r.violations?.join(', ') || 'Không vi phạm';

      const row = worksheet.addRow([
        idx + 1,
        c.tenlop,
        r.score,
        rating,
        violationsStr,
        r.note || '',
        r.gradedBy || user?.fullName || 'Giám thị'
      ]);

      row.font = { name: 'Times New Roman', size: 12 };
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 4) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { vertical: 'middle', wrapText: true };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `BangChamVeSinh_${session}_${format(parseISO(date), 'ddMMyyyy')}.xlsx`);
  };

  const getScoreBadgeClass = (score) => {
    if (score >= 19) return 'sanitation-score-10';
    if (score >= 16) return 'sanitation-score-high';
    if (score >= 12) return 'sanitation-score-med';
    return 'sanitation-score-low';
  };

  const getScoreRatingText = (score) => {
    if (score >= 18) return 'Tốt';
    if (score >= 14) return 'Khá';
    if (score >= 10) return 'Đạt';
    return 'Chưa đạt';
  };

  return (
    <div className="sanitation-page">
      <Header title="Chấm vệ sinh lớp" />

      <div className="sanitation-content">
        {/* FILTERS CARD */}
        <Card>
          <CardBody>
            <div className="sanitation-filters">
              <div>
                <label className="text-xs font-semibold text-muted mb-1 block">Ngày chấm</label>
                <DayPicker value={date} onChange={setDate} />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted mb-1 block">Buổi học</label>
                <Select
                  value={session}
                  onChange={e => setSession(e.target.value)}
                  options={[
                    { value: 'Sáng', label: 'Buổi sáng' },
                    { value: 'Chiều', label: 'Buổi chiều' }
                  ]}
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
                <span className="sanitation-stat-label">Điểm TB</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* TABS & BULK ACTIONS */}
        <div className="flex-between gap-2 flex-wrap">
          <div className="sanitation-tabs">
            <button 
              className={`sanitation-tab-btn ${activeTab === 'grading' ? 'active' : ''}`}
              onClick={() => setActiveTab('grading')}
            >
              <ClipboardCheck size={16} /> Chấm điểm ({filteredClasses.length})
            </button>
            <button 
              className={`sanitation-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              <Award size={16} /> Bảng tổng hợp
            </button>
          </div>

          <div className="flex-row gap-2">
            {activeTab === 'grading' ? (
              <>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleMarkAllPerfect}
                  title="Gán 20 điểm cho tất cả các lớp đang hiển thị"
                >
                  <Sparkles size={15} style={{ marginRight: '4px' }} /> Đạt 20đ hết
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSaveAll}
                  disabled={saving || loadingData}
                >
                  <Save size={15} style={{ marginRight: '4px' }} /> {saving ? 'Đang lưu...' : 'Lưu tất cả'}
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleExportExcel}>
                <FileSpreadsheet size={15} style={{ marginRight: '4px' }} /> Xuất Excel
              </Button>
            )}
          </div>
        </div>

        {/* CONTENT TABS */}
        {loadingClasses || loadingData ? (
          <p className="text-center text-muted py-8">Đang tải danh sách lớp và dữ liệu chấm...</p>
        ) : filteredClasses.length === 0 ? (
          <p className="text-center text-muted py-8">Không tìm thấy lớp học nào phù hợp.</p>
        ) : activeTab === 'grading' ? (
          /* GRADING TAB */
          <div className="sanitation-list">
            {filteredClasses.map(c => {
              const rec = records[c.tenlop] || { score: 20, violations: [], note: '' };
              const score = typeof rec.score === 'number' ? rec.score : 20;
              const hasViolations = rec.violations && rec.violations.length > 0;

              return (
                <div 
                  key={c.id || c.tenlop} 
                  className={`sanitation-class-card ${hasViolations ? 'has-violations' : ''}`}
                >
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
                      <span>{score} điểm</span>
                      <span>• {getScoreRatingText(score)}</span>
                    </div>
                  </div>

                  <div className="sanitation-card-body">
                    {/* Score Control */}
                    <div className="flex-between align-center flex-wrap gap-2">
                      <div className="sanitation-score-control">
                        <span className="text-xs font-semibold text-muted">Điều chỉnh điểm:</span>
                        <div className="score-stepper">
                          <button 
                            className="stepper-btn" 
                            onClick={() => handleScoreChange(c.tenlop, score - 0.5)}
                          >
                            -
                          </button>
                          <span className="stepper-value">{score}</span>
                          <button 
                            className="stepper-btn" 
                            onClick={() => handleScoreChange(c.tenlop, score + 0.5)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="quick-scores-row">
                        {[20, 18, 16, 14, 10].map(pts => (
                          <button
                            key={pts}
                            className={`quick-score-btn ${score === pts ? 'active' : ''}`}
                            onClick={() => handleScoreChange(c.tenlop, pts)}
                          >
                            {pts}đ
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Common Violations / Checklist */}
                    <div>
                      <span className="text-xs font-semibold text-muted mb-2 block">
                        Các lỗi trừ điểm (chạm để chọn/bỏ):
                      </span>
                      <div className="violation-chips-group">
                        {COMMON_VIOLATIONS.map(v => {
                          const isSelected = rec.violations?.includes(v.label);
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

                    {/* Note input */}
                    <div>
                      <input 
                        type="text"
                        className="sanitation-note-input"
                        placeholder="Ghi chú thêm (vd: còn rác ở hộc bàn, lau bảng chưa sạch...)"
                        value={rec.note || ''}
                        onChange={e => handleNoteChange(c.tenlop, e.target.value)}
                      />
                    </div>

                    <div className="sanitation-card-footer">
                      <span>
                        {rec.hasSavedData ? (
                          <span className="text-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Check size={12} /> Đã lưu
                          </span>
                        ) : rec.isModified ? (
                          <span className="text-warning">Chưa lưu thay đổi</span>
                        ) : (
                          <span className="text-muted">Chưa chấm</span>
                        )}
                      </span>

                      {rec.gradedBy && (
                        <span className="text-muted">Người chấm: {rec.gradedBy}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="mt-4 mb-4">
              <Button fullWidth onClick={handleSaveAll} disabled={saving}>
                <Save size={16} style={{ marginRight: '6px' }} />
                {saving ? 'Đang lưu dữ liệu...' : 'Lưu kết quả chấm vệ sinh tất cả các lớp'}
              </Button>
            </div>
          </div>
        ) : (
          /* SUMMARY TAB */
          <Card>
            <CardBody>
              <div className="flex-between align-center mb-3">
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                  Bảng tổng hợp điểm vệ sinh ({session} - {format(parseISO(date), 'dd/MM/yyyy')})
                </h4>
                <Button variant="secondary" size="sm" onClick={handleExportExcel}>
                  <FileSpreadsheet size={15} style={{ marginRight: '4px' }} /> Xuất Excel
                </Button>
              </div>

              <div className="sanitation-table-wrapper">
                <table className="sanitation-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>STT</th>
                      <th>Lớp</th>
                      <th style={{ textAlign: 'center' }}>Điểm</th>
                      <th style={{ textAlign: 'center' }}>Xếp loại</th>
                      <th>Lỗi vi phạm</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClasses.map((c, index) => {
                      const rec = records[c.tenlop] || { score: 20, violations: [], note: '' };
                      const score = typeof rec.score === 'number' ? rec.score : 20;
                      return (
                        <tr key={c.id || c.tenlop}>
                          <td style={{ textAlign: 'center' }}>{index + 1}</td>
                          <td>
                            <strong>{c.tenlop}</strong>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`sanitation-score-pill ${getScoreBadgeClass(score)}`}>
                              {score}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>
                            {getScoreRatingText(score)}
                          </td>
                          <td style={{ color: rec.violations?.length > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                            {rec.violations?.length > 0 ? rec.violations.join(', ') : 'Sạch sẽ'}
                          </td>
                          <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {rec.note || '-'}
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
