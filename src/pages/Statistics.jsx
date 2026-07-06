import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardBody } from '../components/ui/Card';
import { Select, Input } from '../components/ui/Input';
import { DayPicker, MonthPicker } from '../components/ui/DatePicker';
import { Button } from '../components/ui/Button';
import { getAttendanceHistory, getRecentViolations, fetchStudents, fetchClasses, fetchViolationTypes, fetchSystemSettings } from '../lib/firebase';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval, parse, getMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Search as SearchIcon, FileText, Download, BarChart2, PieChart as PieIcon, CalendarCheck, FileWarning, X, ClipboardList } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import './Search.css'; 
import './Statistics.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#F06292', '#BA68C8'];

export function Statistics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('attendance'); // 'attendance' or 'violation'
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalType, setModalType] = useState(''); // 'attendance' or 'violation'
  
  const [attendanceData, setAttendanceData] = useState([]);
  const [violations, setViolations] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [violationTypes, setViolationTypes] = useState([]);
  const [settings, setSettings] = useState(null);

  const [timeFilterType, setTimeFilterType] = useState('week');
  const [timeValueDay, setTimeValueDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeValueWeek, setTimeValueWeek] = useState('1');
  const [timeValueMonth, setTimeValueMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [timeValueSemester, setTimeValueSemester] = useState('1');
  const dateInputRef = useRef(null);
  const monthInputRef = useRef(null);

  const [targetFilterType, setTargetFilterType] = useState('all');
  const [targetValueGrade, setTargetValueGrade] = useState('');
  const [targetValueClass, setTargetValueClass] = useState('');
  const [targetValueStudentId, setTargetValueStudentId] = useState('');

  const [statusFilter, setStatusFilter] = useState('all');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');

  const [typeFilter, setTypeFilter] = useState('all');

  const isAdminOrGiamthi = user?.role?.includes('admin') || user?.role?.includes('vip-admin') || user?.role?.includes('giamthi');
  const isGiaovienOnly = user?.role?.includes('giaovien') && !isAdminOrGiamthi;
  const [teacherClass, setTeacherClass] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [history, vData, studentsData, classesData, tData, sData] = await Promise.all([
        getAttendanceHistory(),
        getRecentViolations(),
        fetchStudents(),
        fetchClasses(),
        fetchViolationTypes(),
        fetchSystemSettings()
      ]);
      
      const flatAttendance = [];
      history.forEach(att => {
        if (!att.records) return;
        Object.keys(att.records).forEach(studentId => {
          const status = att.records[studentId];
          const student = studentsData.find(s => s.id === studentId);
          if (student) {
            flatAttendance.push({
              id: `${att.id}_${studentId}`,
              date: att.date,
              session: att.session || 'Sáng',
              className: att.className,
              studentId: studentId,
              mahs: student.mahs || '',
              hoten: student.hoten || '',
              khoi: student.khoi || '',
              status: status,
              reason: (att.reasons && att.reasons[studentId]) ? att.reasons[studentId] : (status === 'absent_p' ? 'Việc riêng' : null),
            });
          }
        });
      });

      setAttendanceData(flatAttendance);
      setViolations(vData);
      setStudents(studentsData);
      setClasses(classesData);
      setViolationTypes(tData);
      setSettings(sData);

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
            currentWeek = 1; // Before semester 1 starts, default to week 1
         }
         setTimeValueWeek(currentWeek.toString());
      }

      if (isGiaovienOnly) {
         const myClass = classesData.find(c => c.homeroomTeacherId === user?.id);
         const cls = myClass ? myClass.tenlop : '_NONE_';
         setTeacherClass(cls);
         setTargetFilterType('class');
         setTargetValueClass(cls);
      }

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

  const getWeekNum = (dateStr) => {
    if (!settings) return 0;
    const vDate = parse(dateStr, 'yyyy-MM-dd', new Date());
    const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
    const s1Weeks = settings.semester1Weeks || 18;
    
    if (vDate >= s2Start) {
      const diffTime = vDate.getTime() - s2Start.getTime();
      const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
      return diffWeeks + 1 + s1Weeks;
    } else {
      const diffTime = vDate.getTime() - s1Start.getTime();
      const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
      return diffWeeks + 1;
    }
  };

  const filteredAttendance = useMemo(() => {
    return attendanceData.filter(a => {
      if (!a.date) return false;
      const aDate = parse(a.date, 'yyyy-MM-dd', new Date());
      const weekNum = getWeekNum(a.date);

      if (timeFilterType === 'day') {
        if (a.date !== timeValueDay) return false;
      } else if (timeFilterType === 'week') {
        if (weekNum.toString() !== timeValueWeek) return false;
      } else if (timeFilterType === 'month') {
        if (format(aDate, 'yyyy-MM') !== timeValueMonth) return false;
      } else if (timeFilterType === 'semester') {
        const s1Weeks = settings?.semester1Weeks || 18;
        if (timeValueSemester === '1' && (weekNum < 1 || weekNum > s1Weeks)) return false;
        if (timeValueSemester === '2' && weekNum <= s1Weeks) return false;
      }

      if (isGiaovienOnly) {
        if (a.className !== teacherClass) return false;
      } else {
        if (targetFilterType === 'grade') {
          if (targetValueGrade && a.khoi !== targetValueGrade && !a.className?.startsWith(targetValueGrade)) return false;
        } else if (targetFilterType === 'class') {
          if (targetValueClass && a.className !== targetValueClass) return false;
        }
      }

      if (targetValueStudentId) {
        const searchStr = targetValueStudentId.toLowerCase();
        const matchId = (a.mahs || '').toLowerCase().includes(searchStr);
        const matchName = (a.hoten || '').toLowerCase().includes(searchStr);
        if (!matchId && !matchName) return false;
      }

      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (sessionFilter !== 'all' && a.session !== sessionFilter) return false;
      if (reasonFilter !== 'all') {
         if (reasonFilter === 'absent_no_reason' && a.status === 'absent_kp') {
            // Match
         } else if (a.reason !== reasonFilter) {
            return false;
         }
      }

      return true;
    });
  }, [attendanceData, settings, timeFilterType, timeValueDay, timeValueWeek, timeValueMonth, timeValueSemester, targetFilterType, targetValueGrade, targetValueClass, targetValueStudentId, statusFilter, sessionFilter, reasonFilter, isGiaovienOnly, teacherClass]);

  const filteredViolations = useMemo(() => {
    return violations.filter(v => {
      if (!v.ngayvipham) return false;
      const vDate = parse(v.ngayvipham, 'yyyy-MM-dd', new Date());
      const weekNum = getWeekNum(v.ngayvipham);

      if (timeFilterType === 'day') {
        if (v.ngayvipham !== timeValueDay) return false;
      } else if (timeFilterType === 'week') {
        if (weekNum.toString() !== timeValueWeek) return false;
      } else if (timeFilterType === 'month') {
        if (format(vDate, 'yyyy-MM') !== timeValueMonth) return false;
      } else if (timeFilterType === 'semester') {
        const s1Weeks = settings?.semester1Weeks || 18;
        if (timeValueSemester === '1' && (weekNum < 1 || weekNum > s1Weeks)) return false;
        if (timeValueSemester === '2' && weekNum <= s1Weeks) return false;
      }

      if (isGiaovienOnly) {
        if (v.tenlop !== teacherClass) return false;
      } else {
        if (targetFilterType === 'grade') {
          if (targetValueGrade && v.khoi !== targetValueGrade && !v.tenlop?.startsWith(targetValueGrade)) return false;
        } else if (targetFilterType === 'class') {
          if (targetValueClass && v.tenlop !== targetValueClass) return false;
        }
      }

      if (targetValueStudentId) {
        const searchStr = targetValueStudentId.toLowerCase();
        const matchId = (v.mahs || '').toLowerCase().includes(searchStr);
        const matchName = (v.hoten || '').toLowerCase().includes(searchStr);
        if (!matchId && !matchName) return false;
      }

      if (typeFilter !== 'all' && v.loaivipham !== typeFilter) return false;

      return true;
    });
  }, [violations, settings, timeFilterType, timeValueDay, timeValueWeek, timeValueMonth, timeValueSemester, targetFilterType, targetValueGrade, targetValueClass, targetValueStudentId, typeFilter, isGiaovienOnly, teacherClass]);

  const formatAbsenceDetails = (absences) => {
    if (!absences || absences.length === 0) return '';
    const getDays = (d) => Math.floor(parse(d, 'yyyy-MM-dd', new Date()).getTime() / 86400000);
    const formatD = (d) => format(parse(d, 'yyyy-MM-dd', new Date()), 'd/M/yyyy');
    
    const sorted = [...absences].sort((a,b) => {
      const da = getDays(a.date);
      const db = getDays(b.date);
      if (da !== db) return da - db;
      return (a.session === 'Sáng' ? 0 : 1) - (b.session === 'Sáng' ? 0 : 1);
    }).map(a => ({ 
      ...a, 
      day: getDays(a.date),
      absIndex: getDays(a.date) * 2 + (a.session === 'Sáng' ? 0 : 1),
      dateStr: formatD(a.date)
    }));

    const blocks = [];
    let i = 0;
    while(i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j+1].absIndex === sorted[j].absIndex + 1) {
         j++;
      }
      blocks.push(sorted.slice(i, j + 1));
      i = j + 1;
    }

    const finalResults = [];
    let k = 0;
    while(k < blocks.length) {
      const block = blocks[k];
      if (block.length === 1) {
         let m = k;
         while (m + 1 < blocks.length 
                && blocks[m+1].length === 1
                && blocks[m+1][0].session === block[0].session
                && blocks[m+1][0].day === blocks[m][0].day + 1) {
            m++;
         }
         if (m > k) {
            finalResults.push(`Các buổi ${block[0].session.toLowerCase()} từ ${block[0].dateStr} đến ${blocks[m][0].dateStr}`);
            k = m + 1;
            continue;
         }
      }
      
      if (block.length >= 3) {
         finalResults.push(`Từ ${block[0].session.toLowerCase()} ${block[0].dateStr} đến ${block[block.length-1].session.toLowerCase()} ${block[block.length-1].dateStr}`);
      } else if (block.length === 2) {
         if (block[0].day === block[1].day) {
            finalResults.push(`Cả ngày ${block[0].dateStr}`);
         } else {
            finalResults.push(`Chiều ${block[0].dateStr}, Sáng ${block[1].dateStr}`);
         }
      } else {
         finalResults.push(`${block[0].session} ${block[0].dateStr}`);
      }
      k++;
    }
    return finalResults.join(', ');
  };

  const filteredStudentsForStats = useMemo(() => {
     return students.filter(s => {
        if (isGiaovienOnly) {
           if (s.tenlop !== teacherClass) return false;
        } else {
           if (targetFilterType === 'grade') {
             if (targetValueGrade && s.khoi !== targetValueGrade && !s.tenlop?.startsWith(targetValueGrade)) return false;
           } else if (targetFilterType === 'class') {
             if (targetValueClass && s.tenlop !== targetValueClass) return false;
           }
        }
        if (targetValueStudentId) {
           const searchStr = targetValueStudentId.toLowerCase();
           const matchId = (s.mahs || '').toLowerCase().includes(searchStr);
           const matchName = (s.hoten || '').toLowerCase().includes(searchStr);
           if (!matchId && !matchName) return false;
        }
        return true;
     });
  }, [students, targetFilterType, targetValueGrade, targetValueClass, targetValueStudentId, isGiaovienOnly, teacherClass]);

  const attendanceStats = useMemo(() => {
     const studentMap = {};

     filteredStudentsForStats.forEach(s => {
        studentMap[s.id] = {
           mahs: s.mahs, hoten: s.hoten, className: s.tenlop,
           present: 0, absent_p: 0, absent_kp: 0, absent_benh: 0, absent_viecrieng: 0, total_absent: 0,
           absences: []
        };
     });

     filteredAttendance.forEach(a => {
        if (!studentMap[a.studentId]) return;
        const s = studentMap[a.studentId];
        
        if (a.status === 'present') {
           s.present++;
        }
        else {
           if (a.status === 'absent_p') {
              s.absent_p++;
              if (a.reason === 'Bệnh') { s.absent_benh++; }
              else if (a.reason === 'Việc riêng') { s.absent_viecrieng++; }
           } else if (a.status === 'absent_kp') {
              s.absent_kp++;
           }
           if (a.status === 'absent_p' || a.status === 'absent_kp') {
              s.total_absent++;
              s.absences.push({ date: a.date, session: a.session, status: a.status, reason: a.reason });
           }
        }
     });

     let perfect_attendance_count = 0;
     let absent_p = 0;
     let absent_kp = 0;
     let absent_benh = 0;
     let absent_viecrieng = 0;

     const studentList = Object.values(studentMap)
       .map(s => {
          if (s.total_absent === 0) perfect_attendance_count++;
          if (s.absent_p > 0) absent_p++;
          if (s.absent_kp > 0) absent_kp++;
          if (s.absent_benh > 0) absent_benh++;
          if (s.absent_viecrieng > 0) absent_viecrieng++;

          return {
             ...s,
             absentDetails_p: formatAbsenceDetails(s.absences.filter(x => x.status === 'absent_p')),
             absentDetails_kp: formatAbsenceDetails(s.absences.filter(x => x.status === 'absent_kp')),
             absentDetails_benh: formatAbsenceDetails(s.absences.filter(x => x.reason === 'Bệnh')),
             absentDetails_viecrieng: formatAbsenceDetails(s.absences.filter(x => x.reason === 'Việc riêng'))
          };
       })
       .sort((a, b) => b.total_absent - a.total_absent);
     
     const pieData = [
        { name: 'Đi học đầy đủ', value: perfect_attendance_count },
        { name: 'Vắng có phép', value: absent_p },
        { name: 'Vắng không phép', value: absent_kp }
     ];
     
     return { 
        present: perfect_attendance_count, 
        absent_p, absent_kp, absent_benh, absent_viecrieng, 
        studentList, pieData 
     };
  }, [filteredAttendance, filteredStudentsForStats]);

  const violationStats = useMemo(() => {
     let totalPoints = 0;
     const typeMap = {};
     const studentMap = {};

     filteredViolations.forEach(v => {
        totalPoints += (v.diemtru || 0);

        if (!typeMap[v.loaivipham]) typeMap[v.loaivipham] = { name: v.loaivipham, count: 0, points: 0 };
        typeMap[v.loaivipham].count++;
        typeMap[v.loaivipham].points += (v.diemtru || 0);

        const sId = v.mahs + '_' + v.hoten;
        if (!studentMap[sId]) {
           studentMap[sId] = { mahs: v.mahs, hoten: v.hoten, className: v.tenlop, count: 0, points: 0, violationsMap: {} };
        }
        studentMap[sId].count++;
        studentMap[sId].points += (v.diemtru || 0);
        
        if (!studentMap[sId].violationsMap[v.loaivipham]) {
            studentMap[sId].violationsMap[v.loaivipham] = 0;
        }
        studentMap[sId].violationsMap[v.loaivipham]++;
     });

     const typeList = Object.values(typeMap).sort((a,b) => b.count - a.count);
     const studentList = Object.values(studentMap).map(s => {
         const errorDetails = s.violationsMap 
             ? Object.entries(s.violationsMap)
                 .map(([errorName, errorCount]) => `${errorName} (${errorCount} lần)`)
                 .join(', ')
             : '';
         return { ...s, errorDetails };
     }).sort((a,b) => isGiaovienOnly ? (b.count - a.count) : (b.points - a.points));
     
     const pieData = typeList.map(t => ({ name: t.name, value: t.count }));
     
     return { totalPoints, typeList, studentList, pieData };
  }, [filteredViolations]);

  const attendanceChartData = useMemo(() => {
     if (isGiaovienOnly || targetFilterType === 'class') {
         return attendanceStats.studentList.filter(s => s.total_absent > 0);
     } else {
         const classMap = {};
         attendanceStats.studentList.forEach(s => {
             if (s.total_absent === 0) return;
             const cName = s.className || 'Chưa xếp lớp';
             if (!classMap[cName]) {
                 classMap[cName] = { name: cName, absent_p: 0, absent_kp: 0, total_absent: 0 };
             }
             classMap[cName].absent_p += s.absent_p;
             classMap[cName].absent_kp += s.absent_kp;
             classMap[cName].total_absent += s.total_absent;
         });
         return Object.values(classMap).sort((a, b) => b.total_absent - a.total_absent);
     }
  }, [attendanceStats.studentList, isGiaovienOnly, targetFilterType]);

  const violationChartData = useMemo(() => {
     if (isGiaovienOnly || targetFilterType === 'class') {
         return violationStats.studentList;
     } else {
         const classMap = {};
         violationStats.studentList.forEach(s => {
             const cName = s.className || 'Chưa xếp lớp';
             if (!classMap[cName]) {
                 classMap[cName] = { name: cName, points: 0, count: 0 };
             }
             classMap[cName].points += s.points;
             classMap[cName].count += s.count;
         });
         return Object.values(classMap).sort((a, b) => b.points - a.points);
     }
  }, [violationStats.studentList, isGiaovienOnly, targetFilterType]);

  const listToRender = useMemo(() => {
     if (!modalType) return [];
     if (modalType === 'violation') return violationStats.studentList;
     if (modalType === 'attendance_present') return attendanceStats.studentList.filter(s => s.total_absent === 0);
     if (modalType === 'attendance_absent_p') return attendanceStats.studentList.filter(s => s.absent_p > 0);
     if (modalType === 'attendance_absent_kp') return attendanceStats.studentList.filter(s => s.absent_kp > 0);
     if (modalType === 'attendance_absent_benh') return attendanceStats.studentList.filter(s => s.absent_benh > 0);
     if (modalType === 'attendance_absent_viecrieng') return attendanceStats.studentList.filter(s => s.absent_viecrieng > 0);
     return [];
  }, [modalType, attendanceStats.studentList, violationStats.studentList]);

  const exportModalPDF = async () => {
    if (listToRender.length === 0) return;

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
    doc.text(`DANH SÁCH CHI TIẾT - ${modalTitle.toUpperCase()}`, pageWidth / 2, 35, { align: 'center' });

    let tableColumn = [];
    let tableRows = [];

    if (modalType?.startsWith('attendance_')) {
       tableColumn = ["STT", "Họ và tên", "Lớp", modalType === 'attendance_present' ? "Tổng số buổi đi học" : "Chi tiết vắng"];
       tableRows = listToRender.map((s, index) => [
         index + 1,
         s.hoten || '',
         s.className || '',
         modalType === 'attendance_present' ? s.present : 
            modalType === 'attendance_absent_p' ? s.absentDetails_p :
            modalType === 'attendance_absent_kp' ? s.absentDetails_kp :
            modalType === 'attendance_absent_benh' ? s.absentDetails_benh : s.absentDetails_viecrieng
       ]);
    } else {
       tableColumn = isGiaovienOnly ? ["STT", "Họ và tên", "Lớp", "Lỗi vi phạm"] : ["STT", "Họ và tên", "Lớp", "Số lần VP", "Tổng điểm trừ"];
       tableRows = listToRender.map((s, index) => isGiaovienOnly ? [
         index + 1,
         s.hoten || '',
         s.className || '',
         s.errorDetails || ''
       ] : [
         index + 1,
         s.hoten || '',
         s.className || '',
         s.count,
         `-${s.points}`
       ]);
    }

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
      styles: { font: 'Tinos', fontSize: 13, lineWidth: 0.1, lineColor: [0, 0, 0] },
      headStyles: { font: 'Tinos', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] },
    });

    doc.save(`ChiTietThongKe_${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  const exportModalExcel = async () => {
    if (listToRender.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('ChiTietThongKe');

    worksheet.pageSetup.orientation = 'landscape';
    worksheet.pageSetup.paperSize = 9;

    worksheet.columns = modalType?.startsWith('attendance_') ? [
      { width: 10 }, { width: 30 }, { width: 15 }, { width: 40 }
    ] : [
      { width: 10 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 15 }
    ];

    worksheet.mergeCells('A1:B1');
    const cellA1 = worksheet.getCell('A1');
    cellA1.value = "ỦY BAN NHÂN DÂN PHƯỜNG MINH PHỤNG";
    cellA1.font = { name: 'Times New Roman', size: 13, bold: false };
    cellA1.alignment = { horizontal: 'center', vertical: 'middle' };

    const lastColIndex = modalType?.startsWith('attendance_') ? 4 : 5;
    const lastColLetter = modalType?.startsWith('attendance_') ? 'D' : 'E';

    worksheet.mergeCells(`C1:${lastColLetter}1`);
    const cellRight1 = worksheet.getCell('C1');
    cellRight1.value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
    cellRight1.font = { name: 'Times New Roman', size: 13, bold: true };
    cellRight1.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:B2');
    const cellA2 = worksheet.getCell('A2');
    cellA2.value = "TRƯỜNG THCS LÊ ANH XUÂN";
    cellA2.font = { name: 'Times New Roman', size: 13, bold: true, underline: true };
    cellA2.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells(`C2:${lastColLetter}2`);
    const cellRight2 = worksheet.getCell('C2');
    cellRight2.value = "Độc lập - Tự do - Hạnh phúc";
    cellRight2.font = { name: 'Times New Roman', size: 14, bold: true, underline: true };
    cellRight2.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells(`A4:${lastColLetter}4`);
    const cellA4 = worksheet.getCell('A4');
    cellA4.value = `DANH SÁCH CHI TIẾT - ${modalTitle.toUpperCase()}`;
    cellA4.font = { name: 'Times New Roman', size: 16, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    const headers = modalType?.startsWith('attendance_') 
      ? ["STT", "Họ và tên", "Lớp", modalType === 'attendance_present' ? "Tổng số buổi đi học" : "Chi tiết vắng"]
      : (isGiaovienOnly ? ["STT", "Họ và tên", "Lớp", "Lỗi vi phạm"] : ["STT", "Họ và tên", "Lớp", "Số lần VP", "Tổng điểm trừ"]);

    const headerRow = worksheet.getRow(6);
    headerRow.values = headers;
    headerRow.font = { name: 'Times New Roman', size: 13, bold: true };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    headers.forEach((_, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    listToRender.forEach((s, index) => {
      const rowData = modalType?.startsWith('attendance_') ? [
        index + 1,
        s.hoten || '',
        s.className || '',
        modalType === 'attendance_present' ? s.present : 
            modalType === 'attendance_absent_p' ? s.absentDetails_p :
            modalType === 'attendance_absent_kp' ? s.absentDetails_kp :
            modalType === 'attendance_absent_benh' ? s.absentDetails_benh : s.absentDetails_viecrieng
      ] : (isGiaovienOnly ? [
        index + 1,
        s.hoten || '',
        s.className || '',
        s.errorDetails || ''
      ] : [
        index + 1,
        s.hoten || '',
        s.className || '',
        s.count,
        `-${s.points}`
      ]);

      const row = worksheet.addRow(rowData);
      row.font = { name: 'Times New Roman', size: 13 };
      
      row.eachCell((cell, colNumber) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `ChiTietThongKe_${format(new Date(), 'ddMMyyyy')}.xlsx`);
  };

  return (
    <>
      <Header title="Thống kê dữ liệu" />
      <div className="search-container statistics-container pb-10">
        
        {/* HEADER ACTIONS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 mt-2 gap-4">
          <div className="stats-mode-switch">
             <button className={`mode-btn ${mode === 'attendance' ? 'active' : ''}`} onClick={() => setMode('attendance')}>
               <CalendarCheck size={18} /> Chuyên cần
             </button>
             <button className={`mode-btn ${mode === 'violation' ? 'active' : ''}`} onClick={() => setMode('violation')}>
               <FileWarning size={18} /> Vi phạm
             </button>
          </div>
        </div>

        {/* ===================== PREMIUM FILTERS ===================== */}
        <div className="stats-filter-card">
          <div className="stats-filter-header">
             <div className="stats-filter-title">
                <SearchIcon size={20} color="var(--primary-color)"/>
                Bộ lọc dữ liệu
             </div>
             {isGiaovienOnly && (
               <div className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                  Lớp chủ nhiệm: {teacherClass || 'Chưa phân công'}
               </div>
             )}
          </div>
          
          <div className="filter-stack-vertical">
             <div className="filter-group-vertical">
               <label>Thời gian</label>
               <div className="flex flex-wrap gap-2">
                 <Select
                   value={timeFilterType}
                   onChange={(e) => setTimeFilterType(e.target.value)}
                   options={[
                     { value: 'all', label: 'Tất cả' },
                     { value: 'day', label: 'Theo ngày' },
                     { value: 'week', label: 'Theo tuần' },
                     { value: 'month', label: 'Theo tháng' },
                     { value: 'semester', label: 'Theo học kỳ' },
                   ]}
                   className="w-full flex-1"
                 />
                 {timeFilterType === 'day' && (
                   <div className="date-picker-wrapper flex-1" onClick={() => dateInputRef.current?.showPicker()}>
                     <input 
                       ref={dateInputRef}
                       type="date" 
                       className="input-field native-date-input" 
                       value={timeValueDay}
                       onChange={(e) => setTimeValueDay(e.target.value)}
                     />
                     <DayPicker value={timeValueDay} onChange={setTimeValueDay} />
                   </div>
                 )}
                 {timeFilterType === 'week' && (
                   <Select
                     value={timeValueWeek}
                     onChange={(e) => setTimeValueWeek(e.target.value)}
                     options={weekOptions}
                     className="w-full flex-1"
                   />
                 )}
                 {timeFilterType === 'month' && (
                   <div className="date-picker-wrapper flex-1" onClick={() => monthInputRef.current?.showPicker()}>
                     <input 
                       ref={monthInputRef}
                       type="month" 
                       className="input-field native-date-input" 
                       value={timeValueMonth}
                       onChange={(e) => setTimeValueMonth(e.target.value)}
                     />
                     <MonthPicker value={timeValueMonth} onChange={setTimeValueMonth} />
                   </div>
                 )}
                 {timeFilterType === 'semester' && (
                   <Select
                     value={timeValueSemester}
                     onChange={(e) => setTimeValueSemester(e.target.value)}
                     options={[
                       { value: '1', label: 'Học kỳ 1' },
                       { value: '2', label: 'Học kỳ 2' },
                     ]}
                     className="w-full flex-1"
                   />
                 )}
               </div>
             </div>

             <div className="filter-group-vertical">
               <label>{isGiaovienOnly ? "Tìm kiếm học sinh" : "Đối tượng & Tìm kiếm"}</label>
               <div className="flex flex-wrap gap-2">
                 {isGiaovienOnly ? (
                   <Select
                     value={targetValueStudentId}
                     onChange={(e) => setTargetValueStudentId(e.target.value)}
                     options={[
                       { value: '', label: 'Tất cả học sinh trong lớp' },
                       ...students.filter(s => s.tenlop === teacherClass).map(s => ({ value: s.mahs, label: `${s.mahs} - ${s.hoten}` }))
                     ]}
                     className="w-full flex-1"
                   />
                 ) : (
                   <>
                     <Select
                       value={targetFilterType}
                       onChange={(e) => {
                         setTargetFilterType(e.target.value);
                         setTargetValueGrade('');
                         setTargetValueClass('');
                       }}
                       options={[
                         { value: 'all', label: 'Toàn trường' },
                         { value: 'grade', label: 'Theo khối' },
                         { value: 'class', label: 'Theo lớp' }
                       ]}
                       className="w-full flex-1"
                     />
                     {targetFilterType === 'grade' && (
                       <Select
                         value={targetValueGrade}
                         onChange={(e) => setTargetValueGrade(e.target.value)}
                         options={[{ value: '', label: 'Khối...' }, ...gradeOptions]}
                         className="w-full flex-1"
                       />
                     )}
                     {targetFilterType === 'class' && (
                       <Select
                         value={targetValueClass}
                         onChange={(e) => setTargetValueClass(e.target.value)}
                         options={[{ value: '', label: 'Lớp...' }, ...classOptions]}
                         className="w-full flex-1"
                       />
                     )}
                     <div className="search-input-wrapper flex-1 min-w-[200px]">
                       <SearchIcon className="search-icon" size={18} />
                       <Input
                         placeholder="Tìm mã hoặc tên HS..."
                         value={targetValueStudentId}
                         onChange={(e) => setTargetValueStudentId(e.target.value)}
                         hideLabel
                       />
                     </div>
                   </>
                 )}
               </div>
             </div>
             
             {mode === 'attendance' && (
               <div className="filter-group-vertical pt-2 border-t border-gray-100">
                 <label>Trạng thái</label>
                 <Select
                   value={statusFilter}
                   onChange={(e) => setStatusFilter(e.target.value)}
                   options={[
                     { value: 'all', label: 'Tất cả trạng thái' },
                     { value: 'present', label: 'Đi học' },
                     { value: 'absent_p', label: 'Vắng có phép' },
                     { value: 'absent_kp', label: 'Vắng không phép' }
                   ]}
                   className="w-full"
                 />
               </div>
             )}

             {mode === 'attendance' && (statusFilter === 'all' || statusFilter === 'absent_p') && (
               <div className="filter-group-vertical">
                 <label>Lý do vắng</label>
                 <Select
                   value={reasonFilter}
                   onChange={(e) => setReasonFilter(e.target.value)}
                   options={[
                     { value: 'all', label: 'Tất cả lý do' },
                     { value: 'Bệnh', label: 'Bệnh' },
                     { value: 'Việc riêng', label: 'Việc riêng' },
                     ...(statusFilter === 'all' ? [{ value: 'absent_no_reason', label: 'Không có lý do (Không phép)' }] : [])
                   ]}
                   className="w-full"
                 />
               </div>
             )}

             {mode === 'attendance' && (
               <div className="filter-group-vertical">
                 <label>Buổi học</label>
                 <Select
                   value={sessionFilter}
                   onChange={(e) => setSessionFilter(e.target.value)}
                   options={[
                     { value: 'all', label: 'Tất cả buổi' },
                     { value: 'Sáng', label: 'Buổi Sáng' },
                     { value: 'Chiều', label: 'Buổi Chiều' }
                   ]}
                   className="w-full"
                 />
               </div>
             )}

             {mode === 'violation' && !isGiaovienOnly && (
               <div className="filter-group-vertical pt-2 border-t border-gray-100">
                 <label>Loại vi phạm</label>
                 <Select
                   value={typeFilter}
                   onChange={(e) => setTypeFilter(e.target.value)}
                   options={[
                     { value: 'all', label: 'Tất cả các lỗi' },
                     ...violationTypes.map(t => ({ value: t.tenloai, label: t.tenloai }))
                   ]}
                   className="w-full"
                 />
               </div>
             )}
          </div>
        </div>

        {!loading && mode === 'attendance' && (
           <>
              <div className="stats-summary-grid">
                 {(statusFilter === 'all' || statusFilter === 'present') && (
                   <div className="premium-stat-card" onClick={() => { setModalType('attendance_present'); setModalTitle('Học sinh đi học'); setShowModal(true); }}>
                      <div className="stat-left-col">
                         <span className="stat-title">Tổng đi học</span>
                         <span className="stat-value">{attendanceStats.present}</span>
                      </div>
                   </div>
                 )}
                 {(statusFilter === 'all' || statusFilter === 'absent_p') && (
                   <>
                     <div className="premium-stat-card" onClick={() => { setModalType('attendance_absent_p'); setModalTitle('Học sinh vắng có phép'); setShowModal(true); }}>
                        <div className="stat-left-col">
                           <span className="stat-title">Vắng có phép</span>
                           <span className="stat-value">{attendanceStats.absent_p}</span>
                        </div>
                     </div>
                     <div className="premium-stat-card" onClick={() => { setModalType('attendance_absent_benh'); setModalTitle('Học sinh vắng vì bệnh'); setShowModal(true); }}>
                        <div className="stat-left-col">
                           <span className="stat-title">Vắng vì bệnh</span>
                           <span className="stat-value">{attendanceStats.absent_benh}</span>
                        </div>
                     </div>
                     <div className="premium-stat-card" onClick={() => { setModalType('attendance_absent_viecrieng'); setModalTitle('Học sinh vắng việc riêng'); setShowModal(true); }}>
                        <div className="stat-left-col">
                           <span className="stat-title">Vắng vì việc riêng</span>
                           <span className="stat-value">{attendanceStats.absent_viecrieng}</span>
                        </div>
                     </div>
                   </>
                 )}
                 {(statusFilter === 'all' || statusFilter === 'absent_kp') && (
                   <div className="premium-stat-card" onClick={() => { setModalType('attendance_absent_kp'); setModalTitle('Học sinh vắng không phép'); setShowModal(true); }}>
                      <div className="stat-left-col">
                         <span className="stat-title">Vắng không phép</span>
                         <span className="stat-value">{attendanceStats.absent_kp}</span>
                      </div>
                   </div>
                 )}
              </div>

              <div className="stats-charts-grid">
                 <div className="chart-card">
                    <h3 className="chart-title">
                       <PieIcon size={20} className="text-indigo-500" />
                       Tỷ lệ chuyên cần
                    </h3>
                    <div style={{ width: '100%', height: 280 }}>
                       <ResponsiveContainer>
                          <PieChart>
                             <Pie data={attendanceStats.pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label>
                                {attendanceStats.pieData.map((entry, index) => (
                                   <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                             </Pie>
                             <RechartsTooltip />
                             <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                       </ResponsiveContainer>
                    </div>
                 </div>
                 
                 <div className="chart-card overflow-x-auto">
                    <h3 className="chart-title sticky left-0 z-10 pt-2">
                       <BarChart2 size={20} className="text-indigo-500" />
                       {isGiaovienOnly || targetFilterType === 'class' ? 'Học sinh vắng nhiều nhất' : 'Lớp vắng nhiều nhất'}
                    </h3>
                    <div style={{ width: Math.max(400, attendanceChartData.length * 50), height: 320 }}>
                       <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={attendanceChartData} margin={{ top: 20, right: 30, left: -20, bottom: 60 }}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                             <XAxis dataKey={isGiaovienOnly || targetFilterType === 'class' ? "hoten" : "name"} tick={{fontSize: 11, fill: '#64748b'}} interval={0} angle={-45} textAnchor="end" tickLine={false} axisLine={false} />
                             <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                             <RechartsTooltip cursor={{fill: '#f1f5f9'}} />
                             <Legend verticalAlign="top" height={36} />
                             <Bar dataKey="absent_p" name="Có phép" stackId="a" fill="#f59e0b" radius={[0,0,4,4]} barSize={32} />
                             <Bar dataKey="absent_kp" name="Không phép" stackId="a" fill="#ef4444" radius={[4,4,0,0]} />
                          </BarChart>
                       </ResponsiveContainer>
                    </div>
                 </div>
              </div>
           </>
        )}

        {!loading && mode === 'violation' && (
           <>
              <div className="stats-summary-grid">
                 {!isGiaovienOnly && (
                 <div className="premium-stat-card" onClick={() => { setModalType('violation'); setModalTitle('Chi tiết vi phạm'); setShowModal(true); }}>
                    <div className="stat-left-col">
                       <span className="stat-title">Tổng điểm trừ</span>
                       <span className="stat-value">{violationStats.totalPoints}</span>
                       <span className="stat-subtitle">Từ các lỗi vi phạm</span>
                    </div>
                    <div className="stat-right-col stat-violations-icon">
                       <FileWarning size={24} />
                    </div>
                 </div>
                 )}
                 <div className="premium-stat-card" onClick={() => { setModalType('violation'); setModalTitle(isGiaovienOnly ? 'Danh sách học sinh vi phạm' : 'Danh sách lượt vi phạm'); setShowModal(true); }}>
                    <div className="stat-left-col">
                       <span className="stat-title">{isGiaovienOnly ? 'Số học sinh vi phạm' : 'Số lượt vi phạm'}</span>
                       <span className="stat-value">{isGiaovienOnly ? violationStats.studentList.length : filteredViolations.length}</span>
                       <span className="stat-subtitle">Trong thời gian chọn</span>
                    </div>
                    <div className="stat-right-col stat-absent-kp-icon">
                       <ClipboardList size={24} />
                    </div>
                 </div>
              </div>

              <div className="stats-charts-grid">
                 {violationStats.studentList.length > 0 && (
                 <>
                 <div className="chart-card">
                    <h3 className="chart-title">
                       <PieIcon size={20} className="text-indigo-500" />
                       Biểu đồ thống kê loại vi phạm
                    </h3>
                    <div style={{ width: '100%', height: 280 }}>
                       <ResponsiveContainer>
                          <PieChart>
                             <Pie data={violationStats.pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} fill="#8884d8" dataKey="value" label>
                                {violationStats.pieData.map((entry, index) => (
                                   <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                             </Pie>
                             <RechartsTooltip />
                             <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                       </ResponsiveContainer>
                    </div>
                 </div>
                 
                 <div className="chart-card overflow-x-auto">
                    <h3 className="chart-title sticky left-0 z-10 pt-2">
                       <BarChart2 size={20} className="text-indigo-500" />
                       {isGiaovienOnly || targetFilterType === 'class' ? 'Học sinh vi phạm nhiều nhất' : 'Lớp vi phạm nhiều nhất'}
                    </h3>
                    <div style={{ width: Math.max(400, violationChartData.length * 50), height: 320 }}>
                       <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={violationChartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                             <XAxis dataKey={isGiaovienOnly || targetFilterType === 'class' ? "hoten" : "name"} tick={{fontSize: 11, fill: '#64748b'}} interval={0} angle={-45} textAnchor="end" tickLine={false} axisLine={false} />
                             <YAxis type="number" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                             <RechartsTooltip cursor={{fill: '#f1f5f9'}} />
                             <Legend verticalAlign="top" height={36} />
                             <Bar dataKey={isGiaovienOnly ? "count" : "points"} name={isGiaovienOnly ? "Số lần vi phạm" : "Điểm trừ"} fill="#ef4444" radius={[4,4,0,0]} barSize={32} />
                          </BarChart>
                       </ResponsiveContainer>
                    </div>
                 </div>
                 </>
                 )}
              </div>
           </>
        )}
      </div>

      {/* MODAL CHI TIẾT */}
      {showModal && (
        <div className="stats-modal-overlay" onClick={(e) => { if (e.target.classList.contains('stats-modal-overlay')) setShowModal(false) }}>
          <div className="stats-modal-content">
            <div className="stats-modal-header">
              <h2 className="stats-modal-title">{modalTitle}</h2>
              <button className="stats-modal-close" onClick={() => setShowModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="stats-modal-body">
              <div className="stats-export-actions" style={{ justifyContent: 'flex-end', marginBottom: '16px', marginRight: '4px' }}>
                <button className="btn-export pdf" onClick={exportModalPDF} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                  <FileText size={16} /> Xuất PDF
                </button>
                <button className="btn-export excel" onClick={exportModalExcel} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                  <Download size={16} /> Xuất Excel
                </button>
              </div>
              <div className="stats-table-card">
                 <div className="overflow-x-auto">
                    {modalType?.startsWith('attendance_') ? (
                        <table className="premium-table">
                             <thead>
                                <tr>
                                   <th style={{width: '60px'}}>STT</th>
                                   <th>Họ và tên</th>
                                   <th style={{width: '100px'}}>Lớp</th>
                                   {modalType === 'attendance_present' ? <th>Tổng số buổi đi học</th> : <th>Chi tiết vắng</th>}
                                </tr>
                             </thead>
                             <tbody>
                                {listToRender.length > 0 ? listToRender.map((s, idx) => (
                                   <tr key={s.mahs}>
                                      <td className="text-gray-500">{idx + 1}</td>
                                      <td className="font-semibold text-gray-900">{s.hoten}</td>
                                      <td><span className="badge-gray">{s.className}</span></td>
                                      {modalType === 'attendance_present' ? (
                                         <td className="font-bold text-gray-900 text-center">{s.present}</td>
                                      ) : (
                                         <td className="text-sm text-gray-700">
                                            {modalType === 'attendance_absent_p' ? s.absentDetails_p :
                                             modalType === 'attendance_absent_kp' ? s.absentDetails_kp :
                                             modalType === 'attendance_absent_benh' ? s.absentDetails_benh :
                                             modalType === 'attendance_absent_viecrieng' ? s.absentDetails_viecrieng : ''}
                                         </td>
                                      )}
                                   </tr>
                                )) : (
                                   <tr>
                                      <td colSpan="4" className="text-center py-10 text-gray-400">Không có dữ liệu</td>
                                   </tr>
                                )}
                             </tbody>
                          </table>
                    ) : (
                        <table className="premium-table">
                           <thead>
                              <tr>
                                 <th style={{width: '60px'}}>STT</th>
                                 <th>Họ và tên</th>
                                 <th style={{width: '100px'}}>Lớp</th>
                                 {isGiaovienOnly ? (
                                    <th>Lỗi vi phạm</th>
                                 ) : (
                                    <>
                                       <th>Số lần VP</th>
                                       <th>Tổng điểm trừ</th>
                                    </>
                                 )}
                              </tr>
                           </thead>
                           <tbody>
                              {violationStats.studentList.length > 0 ? violationStats.studentList.map((s, idx) => (
                                 <tr key={s.mahs}>
                                    <td className="text-gray-500">{idx + 1}</td>
                                    <td className="font-semibold text-gray-900">{s.hoten}</td>
                                    <td><span className="badge-gray">{s.className}</span></td>
                                    {isGiaovienOnly ? (
                                       <td className="text-sm text-gray-700">{s.errorDetails}</td>
                                    ) : (
                                       <>
                                          <td className="text-center"><span className="badge-gray">{s.count}</span></td>
                                          <td className="text-center"><span className="badge-red">-{s.points}</span></td>
                                       </>
                                    )}
                                 </tr>
                              )) : (
                                 <tr>
                                    <td colSpan={isGiaovienOnly ? "4" : "5"} className="text-center py-10 text-gray-400">Không có dữ liệu</td>

                                 </tr>
                              )}
                           </tbody>
                        </table>
                    )}
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
