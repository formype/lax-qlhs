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

  const [timeFilterType, setTimeFilterType] = useState('all');
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
              reason: att.reasons ? att.reasons[studentId] : (status === 'absent_p' ? 'Việc riêng' : null),
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

  const attendanceStats = useMemo(() => {
     let present = 0;
     let absent_p = 0;
     let absent_kp = 0;
     let absent_benh = 0;
     let absent_viecrieng = 0;
     
     const studentMap = {};

     filteredAttendance.forEach(a => {
        if (a.status === 'present') present++;
        else if (a.status === 'absent_p') {
           absent_p++;
           if (a.reason === 'Bệnh') absent_benh++;
           else if (a.reason === 'Việc riêng') absent_viecrieng++;
        }
        else if (a.status === 'absent_kp') absent_kp++;

        if (!studentMap[a.studentId]) {
           studentMap[a.studentId] = { 
              mahs: a.mahs, hoten: a.hoten, className: a.className, 
              present: 0, absent_p: 0, absent_kp: 0, absent_benh: 0, absent_viecrieng: 0, total_absent: 0,
              absences: []
           };
        }
        const s = studentMap[a.studentId];
        
        if (a.status === 'present') s.present++;
        else {
           if (a.status === 'absent_p') {
              s.absent_p++;
              if (a.reason === 'Bệnh') s.absent_benh++;
              else if (a.reason === 'Việc riêng') s.absent_viecrieng++;
           } else if (a.status === 'absent_kp') {
              s.absent_kp++;
           }
           s.total_absent++;
           s.absences.push({ date: a.date, session: a.session, status: a.status, reason: a.reason });
        }
     });

     const studentList = Object.values(studentMap).map(s => ({
       ...s,
       absentDetails_p: formatAbsenceDetails(s.absences.filter(x => x.status === 'absent_p')),
       absentDetails_kp: formatAbsenceDetails(s.absences.filter(x => x.status === 'absent_kp')),
       absentDetails_benh: formatAbsenceDetails(s.absences.filter(x => x.reason === 'Bệnh')),
       absentDetails_viecrieng: formatAbsenceDetails(s.absences.filter(x => x.reason === 'Việc riêng'))
     }));
     
     const pieData = [
        { name: 'Có mặt', value: present },
        { name: 'Vắng có phép', value: absent_p },
        { name: 'Vắng không phép', value: absent_kp }
     ];
     return { present, absent_p, absent_kp, absent_benh, absent_viecrieng, studentList, pieData };
  }, [filteredAttendance]);

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
           studentMap[sId] = { mahs: v.mahs, hoten: v.hoten, className: v.tenlop, count: 0, points: 0 };
        }
        studentMap[sId].count++;
        studentMap[sId].points += (v.diemtru || 0);
     });

     const typeList = Object.values(typeMap).sort((a,b) => b.count - a.count);
     const studentList = Object.values(studentMap).sort((a,b) => b.points - a.points);
     
     const pieData = typeList.map(t => ({ name: t.name, value: t.count }));
     
     return { totalPoints, typeList, studentList, pieData };
  }, [filteredViolations]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica");

    if (mode === 'attendance') {
       doc.text("THONG KE CHUYEN CAN", pageWidth / 2, 20, { align: 'center' });
       doc.text(`Tong vang co phep: ${attendanceStats.absent_p} | Tong vang khong phep: ${attendanceStats.absent_kp}`, 14, 30);
       
       const tableData = attendanceStats.studentList.map((s, index) => [
         index + 1,
         s.mahs,
         s.hoten,
         s.className,
         s.absent_p,
         s.absent_kp,
         s.total_absent
       ]);
   
       autoTable(doc, {
         startY: 40,
         head: [['STT', 'Ma HS', 'Ho ten', 'Lop', 'Co phep', 'Khong phep', 'Tong vang']],
         body: tableData,
       });
    } else {
       doc.text("THONG KE VI PHAM", pageWidth / 2, 20, { align: 'center' });
       doc.text(`Tong diem tru: ${violationStats.totalPoints}`, 14, 30);
       
       const tableData = violationStats.studentList.map((s, index) => [
         index + 1,
         s.mahs,
         s.hoten,
         s.className,
         s.count,
         s.points
       ]);
   
       autoTable(doc, {
         startY: 40,
         head: [['STT', 'Ma HS', 'Ho ten', 'Lop', 'So lan VP', 'Tong diem tru']],
         body: tableData,
       });
    }
    doc.save(`ThongKe_${mode}_${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('ThongKe');

    if (mode === 'attendance') {
       worksheet.columns = [
         { header: 'STT', key: 'stt', width: 5 },
         { header: 'Mã HS', key: 'mahs', width: 15 },
         { header: 'Họ và tên', key: 'hoten', width: 25 },
         { header: 'Lớp', key: 'className', width: 15 },
         { header: 'Vắng có phép', key: 'absent_p', width: 15 },
         { header: 'Vắng không phép', key: 'absent_kp', width: 15 },
         { header: 'Tổng vắng', key: 'total_absent', width: 15 }
       ];
       attendanceStats.studentList.forEach((s, index) => {
         worksheet.addRow({
           stt: index + 1,
           mahs: s.mahs,
           hoten: s.hoten,
           className: s.className,
           absent_p: s.absent_p,
           absent_kp: s.absent_kp,
           total_absent: s.total_absent
         });
       });
    } else {
       worksheet.columns = [
         { header: 'STT', key: 'stt', width: 5 },
         { header: 'Mã HS', key: 'mahs', width: 15 },
         { header: 'Họ và tên', key: 'hoten', width: 25 },
         { header: 'Lớp', key: 'className', width: 15 },
         { header: 'Số lần VP', key: 'count', width: 15 },
         { header: 'Tổng điểm trừ', key: 'points', width: 15 }
       ];
       violationStats.studentList.forEach((s, index) => {
         worksheet.addRow({
           stt: index + 1,
           mahs: s.mahs,
           hoten: s.hoten,
           className: s.className,
           count: s.count,
           points: s.points
         });
       });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `ThongKe_${mode}_${format(new Date(), 'ddMMyyyy')}.xlsx`);
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
          
          <div className="stats-export-actions">
             <button className="btn-export pdf" onClick={handleExportPDF}>
                <FileText size={16} /> Xuất PDF
             </button>
             <button className="btn-export excel" onClick={handleExportExcel}>
                <Download size={16} /> Xuất Excel
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

             {mode === 'violation' && (
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
                 
                 <div className="chart-card">
                    <h3 className="chart-title">
                       <BarChart2 size={20} className="text-indigo-500" />
                       Học sinh vắng nhiều nhất
                    </h3>
                    <div style={{ width: '100%', height: 280 }}>
                       <ResponsiveContainer>
                          <BarChart data={attendanceStats.studentList.slice(0, 5)} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                             <XAxis dataKey="hoten" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                             <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                             <RechartsTooltip cursor={{fill: '#f1f5f9'}} />
                             <Legend />
                             <Bar dataKey="absent_p" name="Có phép" stackId="a" fill="#f59e0b" radius={[0,0,4,4]} barSize={40} />
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
                 <div className="premium-stat-card" onClick={() => { setModalType('violation'); setModalTitle('Danh sách lượt vi phạm'); setShowModal(true); }}>
                    <div className="stat-left-col">
                       <span className="stat-title">Số lượt vi phạm</span>
                       <span className="stat-value">{filteredViolations.length}</span>
                       <span className="stat-subtitle">Học sinh vi phạm</span>
                    </div>
                    <div className="stat-right-col stat-absent-kp-icon">
                       <ClipboardList size={24} />
                    </div>
                 </div>
              </div>

              <div className="stats-charts-grid">
                 <div className="chart-card">
                    <h3 className="chart-title">
                       <PieIcon size={20} className="text-indigo-500" />
                       Phân bổ loại vi phạm
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
                 
                 <div className="chart-card">
                    <h3 className="chart-title">
                       <BarChart2 size={20} className="text-indigo-500" />
                       Top học sinh vi phạm
                    </h3>
                    <div style={{ width: '100%', height: 280 }}>
                       <ResponsiveContainer>
                          <BarChart data={violationStats.studentList.slice(0, 5)} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                             <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                             <XAxis type="number" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                             <YAxis dataKey="hoten" type="category" width={120} tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                             <RechartsTooltip cursor={{fill: '#f1f5f9'}} />
                             <Bar dataKey="points" name="Điểm trừ" fill="#ef4444" radius={[0,4,4,0]} barSize={24} />
                          </BarChart>
                       </ResponsiveContainer>
                    </div>
                 </div>
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
              <div className="stats-table-card">
                 <div className="overflow-x-auto">
                    {modalType?.startsWith('attendance_') ? (() => {
                        let listToRender = [];
                        if (modalType === 'attendance_present') listToRender = attendanceStats.studentList.filter(s => s.present > 0);
                        else if (modalType === 'attendance_absent_p') listToRender = attendanceStats.studentList.filter(s => s.absent_p > 0);
                        else if (modalType === 'attendance_absent_kp') listToRender = attendanceStats.studentList.filter(s => s.absent_kp > 0);
                        else if (modalType === 'attendance_absent_benh') listToRender = attendanceStats.studentList.filter(s => s.absent_benh > 0);
                        else if (modalType === 'attendance_absent_viecrieng') listToRender = attendanceStats.studentList.filter(s => s.absent_viecrieng > 0);
                        
                        return (
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
                        );
                    })() : (
                        <table className="premium-table">
                           <thead>
                              <tr>
                                 <th style={{width: '60px'}}>STT</th>
                                 <th>Họ và tên</th>
                                 <th style={{width: '100px'}}>Lớp</th>
                                 <th>Số lần VP</th>
                                 <th>Tổng điểm trừ</th>
                              </tr>
                           </thead>
                           <tbody>
                              {violationStats.studentList.length > 0 ? violationStats.studentList.map((s, idx) => (
                                 <tr key={s.mahs}>
                                    <td className="text-gray-500">{idx + 1}</td>
                                    <td className="font-semibold text-gray-900">{s.hoten}</td>
                                    <td><span className="badge-gray">{s.className}</span></td>
                                    <td className="text-center"><span className="badge-gray">{s.count}</span></td>
                                    <td className="text-center"><span className="badge-red">-{s.points}</span></td>
                                 </tr>
                              )) : (
                                 <tr>
                                    <td colSpan="5" className="text-center py-10 text-gray-400">Không có dữ liệu</td>
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
