import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { 
  Trophy, 
  Calendar,
  Eye,
  Award,
  X,
  BookOpen,
  ShieldAlert,
  Sparkles,
  Info
} from 'lucide-react';
import { format, parse, parseISO } from 'date-fns';
import { 
  fetchClasses, 
  fetchSystemSettings, 
  fetchClassSanitationByWeek, 
  fetchAllViolations,
  fetchStudents,
  fetchAttendanceByDateRange,
  fetchWeeklyEmulation
} from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
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

export function WeeklyEmulationTracking() {
  const { user } = useAuth();

  // States
  const [classes, setClasses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [allViolations, setAllViolations] = useState([]);
  const [sanitationDeductions, setSanitationDeductions] = useState([]);
  const [students, setStudents] = useState([]);
  const [weekAttendance, setWeekAttendance] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(false);

  // Week & Grade Filter (defaults to current week)
  const [selectedWeek, setSelectedWeek] = useState('1');
  const [selectedGrade, setSelectedGrade] = useState('all'); // 'all', '6', '7', '8', '9'

  // Excel Learning Data loaded from saved emulation in Firebase
  const [excelData, setExcelData] = useState({});
  const [excelFileName, setExcelFileName] = useState('');
  const [customPenalties, setCustomPenalties] = useState({});

  // Detail Modal
  const [detailClass, setDetailClass] = useState(null);

  // Map studentId -> student data for quick lookup of hoten, mahs
  const studentMap = useMemo(() => {
    const map = {};
    (students || []).forEach(s => {
      map[s.id] = s;
    });
    return map;
  }, [students]);

  // Helper: Get date range and calendar info for a given week
  const getWeekInfo = (weekNum, sData) => {
    if (!sData || !weekNum) return null;
    const s1Start = parse(sData.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s2Start = parse(sData.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
    const s1Weeks = sData.semester1Weeks || 18;
    const w = parseInt(weekNum, 10);
    if (isNaN(w) || w < 1) return null;

    const isHK1 = w <= s1Weeks;
    const weekIndexInHK = isHK1 ? w - 1 : w - 1 - s1Weeks;
    const baseDate = isHK1 ? s1Start : s2Start;

    const weekStart = new Date(baseDate);
    weekStart.setDate(weekStart.getDate() + (weekIndexInHK * 7));

    const fridayDate = new Date(weekStart);
    fridayDate.setDate(weekStart.getDate() + 4);

    const saturdayDate = new Date(weekStart);
    saturdayDate.setDate(weekStart.getDate() + 5);
    saturdayDate.setHours(0, 0, 0, 0);

    const sundayDate = new Date(weekStart);
    sundayDate.setDate(weekStart.getDate() + 6);

    return {
      weekStart,
      fridayDate,
      saturdayDate,
      sundayDate,
      startDateStr: format(weekStart, 'yyyy-MM-dd'),
      endDateStr: format(sundayDate, 'yyyy-MM-dd')
    };
  };

  // 1. Initial Load: classes, system settings, all violations, all students
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [cData, sData, vData, stData] = await Promise.all([
          fetchClasses(),
          fetchSystemSettings(),
          fetchAllViolations(),
          fetchStudents()
        ]);

        setClasses(cData || []);
        setSettings(sData);
        setAllViolations(vData || []);
        setStudents(stData || []);

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
        console.error("Lỗi khởi tạo theo dõi thi đua tuần:", err);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  // 2. Fetch sanitation data, attendance data and saved emulation when selectedWeek changes
  useEffect(() => {
    const loadWeekData = async () => {
      if (!selectedWeek || !settings) return;
      setLoadingWeek(true);
      try {
        const weekInfo = getWeekInfo(selectedWeek, settings);
        const startDateStr = weekInfo ? weekInfo.startDateStr : '2026-09-07';
        const endDateStr = weekInfo ? weekInfo.endDateStr : '2027-06-30';

        const [sanitation, savedEmulation, attendanceDocs] = await Promise.all([
          fetchClassSanitationByWeek(selectedWeek),
          fetchWeeklyEmulation(selectedWeek),
          fetchAttendanceByDateRange(startDateStr, endDateStr)
        ]);

        setSanitationDeductions(sanitation || []);
        setWeekAttendance(attendanceDocs || []);

        if (savedEmulation && savedEmulation.data) {
          setExcelData(savedEmulation.data.excelData || {});
          setExcelFileName(savedEmulation.data.excelFileName || 'Dữ liệu Sổ đầu bài');
          setCustomPenalties(savedEmulation.data.customPenalties || {});
        } else {
          setExcelData({});
          setExcelFileName('');
          setCustomPenalties({});
        }
      } catch (err) {
        console.error("Lỗi tải dữ liệu tuần:", err);
      } finally {
        setLoadingWeek(false);
      }
    };
    loadWeekData();
  }, [selectedWeek, settings]);

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
    
    for (const rule of STANDARD_PENALTIES) {
      if (rule.match.some(m => typeText === m || typeText.includes(m))) {
        return { isStandard: true, penalty: rule.penalty, ruleName: rule.match[0] };
      }
    }

    const custom = customPenalties[v.id];
    if (custom !== undefined && custom !== '') {
      return { isStandard: false, penalty: parseFloat(custom) || 0, isCustomEntered: true };
    }

    if (v.diemtru && parseFloat(v.diemtru) > 0) {
      return { isStandard: false, penalty: parseFloat(v.diemtru), isCustomEntered: false };
    }

    return { isStandard: false, penalty: 0, needsInput: true };
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
    const list = classes.map(c => {
      const clsName = c.tenlop;
      const grade = getCleanGrade(c);

      // 1. Học tập (từ kết quả Sổ đầu bài đã lưu)
      const excelItem = excelData[clsName];
      const hocTapScore = excelItem ? excelItem.totalHocTap : 0;
      const hasExcel = !!excelItem;

      // 2. Kỷ luật (50đ - các lỗi vi phạm trong tuần + chuyên cần vắng)
      const classViolations = weekViolations.filter(v => v.tenlop === clsName);
      let totalViolationDeduction = 0;
      const violationDetails = classViolations.map(v => {
        const pInfo = getViolationPenaltyInfo(v);
        totalViolationDeduction += pInfo.penalty;
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

      // Tra cứu chuyên cần của tuần đó:
      const normClass = clsName.replace(/-/g, '/').trim().toLowerCase();
      const classAttendanceDocs = weekAttendance.filter(att => {
        const attCls = (att.className || '').replace(/-/g, '/').trim().toLowerCase();
        return attCls === normClass;
      });

      let totalAttendanceDeduction = 0;
      const attendanceDetails = [];

      classAttendanceDocs.forEach(att => {
        if (att.records && typeof att.records === 'object') {
          Object.keys(att.records).forEach(studentId => {
            const status = att.records[studentId];
            if (status === 'absent_kp') {
              totalAttendanceDeduction += 2;
              const st = studentMap[studentId];
              attendanceDetails.push({
                id: `${att.id}_${studentId}`,
                studentId,
                hoten: st?.hoten || 'Học sinh',
                mahs: st?.mahs || '',
                date: att.date,
                session: att.session || 'Sáng',
                status: 'absent_kp',
                statusLabel: 'Vắng không phép',
                reason: 'Không phép',
                penalty: 2
              });
            } else if (status === 'absent_p') {
              const rawReason = att.reasons?.[studentId] || 'Việc riêng';
              const reasonLower = rawReason.trim().toLowerCase();
              const isSick = reasonLower.includes('bệnh') || reasonLower.includes('benh');
              const penalty = isSick ? 0 : 0.5;

              totalAttendanceDeduction += penalty;
              const st = studentMap[studentId];
              attendanceDetails.push({
                id: `${att.id}_${studentId}`,
                studentId,
                hoten: st?.hoten || 'Học sinh',
                mahs: st?.mahs || '',
                date: att.date,
                session: att.session || 'Sáng',
                status: 'absent_p',
                statusLabel: isSick ? 'Vắng có phép (Bệnh)' : 'Vắng có phép (Việc riêng)',
                reason: rawReason,
                penalty
              });
            }
          });
        }
      });

      totalViolationDeduction = Math.round(totalViolationDeduction * 100) / 100;
      totalAttendanceDeduction = Math.round(totalAttendanceDeduction * 100) / 100;
      const totalDisciplineDeduction = Math.round((totalViolationDeduction + totalAttendanceDeduction) * 100) / 100;
      const kyLuatScore = Math.max(0, Math.round((50 - totalDisciplineDeduction) * 100) / 100);

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
        totalViolationDeduction,
        violationDetails,
        totalAttendanceDeduction,
        attendanceDetails,
        veSinhScore,
        totalSanitationDeduction,
        sanitationDetails: classSanitation,
        totalScore,
        rank: 1
      };
    });

    // 2. Group by Grade and compute ranking within each grade
    const grades = ['6', '7', '8', '9'];
    grades.forEach(g => {
      const inGrade = list.filter(item => item.grade === g);
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
  }, [classes, excelData, weekViolations, customPenalties, sanitationDeductions, weekAttendance, studentMap]);

  // Filtered by selected grade tab
  const filteredResults = useMemo(() => {
    if (selectedGrade === 'all') {
      return [...emulationResults].sort((a, b) => {
        if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
        return a.rank - b.rank;
      });
    }
    return emulationResults
      .filter(item => item.grade === selectedGrade)
      .sort((a, b) => a.rank - b.rank);
  }, [emulationResults, selectedGrade]);

  const getRankBadgeContent = (rank) => {
    if (rank === 1) return <span className="rank-badge rank-1" title="Hạng 1">🏆</span>;
    if (rank === 2) return <span className="rank-badge rank-2" title="Hạng 2">🥈</span>;
    if (rank === 3) return <span className="rank-badge rank-3" title="Hạng 3">🥉</span>;
    return <span className="rank-badge rank-other">{rank}</span>;
  };

  const hasSavedExcel = Object.keys(excelData).length > 0;

  return (
    <div className="weekly-emulation-page">
      <Header title="Theo dõi thi đua tuần" />

      <div className="weekly-emulation-content">
        {/* WEEK FILTER */}
        <Card>
          <CardBody>
            <div className="emulation-filters mb-2">
              <div style={{ maxWidth: '420px', width: '100%' }}>
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {hasSavedExcel ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.85rem',
                    color: '#059669',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontWeight: 600
                  }}>
                    <Award size={15} color="#059669" />
                    Đã có kết quả thi đua ({Object.keys(excelData).length} lớp có điểm SĐB)
                  </span>
                ) : (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '0.85rem',
                    color: '#d97706',
                    background: 'rgba(245, 158, 11, 0.1)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    lineHeight: 1.4
                  }}>
                    <Info size={16} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>Điểm thi đua của các lớp chưa bao gồm điểm sổ đầu bài online.</div>
                      <div style={{ fontSize: '0.8rem', color: '#b45309' }}>Điểm thi đua hiện tại sẽ thay đổi theo ghi nhận của từng buổi học trong tuần</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* GRADE TABS */}
        <div className="flex-between align-center flex-wrap gap-2">
          <div className="emulation-grade-tabs">
            <button
              className={`grade-tab-btn ${selectedGrade === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedGrade('all')}
            >
              Tất cả ({emulationResults.length})
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
              <p className="text-center text-muted py-8">Đang tải và cập nhật điểm thi đua...</p>
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
                            <div className="text-xs text-danger" style={{ lineHeight: 1.25, marginTop: '2px' }}>
                              {item.totalViolationDeduction > 0 && (
                                <div>(-{item.totalViolationDeduction}đ vi phạm)</div>
                              )}
                              {item.totalAttendanceDeduction > 0 && (
                                <div>(-{item.totalAttendanceDeduction}đ chuyên cần)</div>
                              )}
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
                  <span>1. Điểm học tập (Sổ đầu bài online):</span>
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
                    Chưa nạp dữ liệu Sổ đầu bài cho lớp này (Điểm tính: 0).
                  </p>
                )}
              </div>

              {/* 2. Chi tiết kỷ luật */}
              <div className="emulation-detail-section">
                <div className="emulation-detail-title">
                  <ShieldAlert size={16} className="text-danger" />
                  <span>2. Điểm kỷ luật (50 điểm ban đầu - Vi phạm & Chuyên cần):</span>
                </div>

                {/* 2.1 Vi phạm học sinh */}
                <div style={{ marginBottom: '10px' }}>
                  <div className="text-xs font-semibold" style={{ color: '#b91c1c', marginBottom: '4px' }}>
                    • Vi phạm nội quy ({detailClass.violationDetails.length} lượt - trừ {detailClass.totalViolationDeduction}đ):
                  </div>
                  {detailClass.violationDetails.length === 0 ? (
                    <p className="text-xs text-success font-semibold" style={{ margin: '0 0 0 8px' }}>
                      ✓ Không có vi phạm nội quy trong tuần.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '4px' }}>
                      {detailClass.violationDetails.map((v, idx) => (
                        <div key={v.id || idx} style={{
                          fontSize: '0.8rem',
                          padding: '5px 8px',
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
                    </div>
                  )}
                </div>

                {/* 2.2 Chuyên cần vắng */}
                <div style={{ marginBottom: '8px' }}>
                  <div className="text-xs font-semibold" style={{ color: '#b91c1c', marginBottom: '4px' }}>
                    • Chuyên cần tuần ({detailClass.attendanceDetails.length} lượt vắng - trừ {detailClass.totalAttendanceDeduction}đ):
                  </div>
                  {detailClass.attendanceDetails.length === 0 ? (
                    <p className="text-xs text-success font-semibold" style={{ margin: '0 0 0 8px' }}>
                      ✓ Lớp đạt chuyên cần 100%, không có học sinh vắng trong tuần.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '4px' }}>
                      {detailClass.attendanceDetails.map((a, idx) => (
                        <div key={a.id || idx} style={{
                          fontSize: '0.8rem',
                          padding: '5px 8px',
                          background: 'var(--card-bg, #fff)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)'
                        }}>
                          <span style={{ fontWeight: 700, color: a.penalty > 0 ? '#dc2626' : '#10b981' }}>
                            {a.penalty > 0 ? `-${a.penalty}đ` : '0đ'}
                          </span>
                          {' '}• <strong>{a.hoten}</strong> ({a.mahs || 'HS'}):
                          {' '}<span style={{ color: a.status === 'absent_kp' ? '#dc2626' : '#2563eb', fontWeight: 600 }}>
                            {a.statusLabel}
                          </span>
                          {a.date && (
                            <span className="text-muted" style={{ marginLeft: '4px', fontSize: '0.75rem' }}>
                              [{format(parseISO(a.date), 'dd/MM')} - {a.session}]
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tổng kết kỷ luật */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
                  ➔ Điểm kỷ luật còn lại: 50 - {detailClass.totalViolationDeduction} (vi phạm) - {detailClass.totalAttendanceDeduction} (chuyên cần) = {detailClass.kyLuatScore.toFixed(2)} điểm
                </div>
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
