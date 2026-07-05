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
import { Search as SearchIcon, FileText, Download, BarChart2, PieChart as PieIcon, CalendarCheck, FileWarning } from 'lucide-react';
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
         if (reasonFilter === 'absent_no_reason' && a.status === 'absent_np') {
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

  const attendanceStats = useMemo(() => {
     let present = 0;
     let absent_p = 0;
     let absent_np = 0;
     
     const studentMap = {};

     filteredAttendance.forEach(a => {
        if (a.status === 'present') present++;
        else if (a.status === 'absent_p') absent_p++;
        else if (a.status === 'absent_np') absent_np++;

        if (!studentMap[a.studentId]) {
           studentMap[a.studentId] = { mahs: a.mahs, hoten: a.hoten, className: a.className, present: 0, absent_p: 0, absent_np: 0, total_absent: 0 };
        }
        if (a.status === 'present') studentMap[a.studentId].present++;
        else if (a.status === 'absent_p') { studentMap[a.studentId].absent_p++; studentMap[a.studentId].total_absent++; }
        else if (a.status === 'absent_np') { studentMap[a.studentId].absent_np++; studentMap[a.studentId].total_absent++; }
     });

     const studentList = Object.values(studentMap).sort((a,b) => b.total_absent - a.total_absent).filter(s => s.total_absent > 0);
     const pieData = [
        { name: 'Có mặt', value: present },
        { name: 'Vắng có phép', value: absent_p },
        { name: 'Vắng không phép', value: absent_np }
     ];
     return { present, absent_p, absent_np, studentList, pieData };
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
       doc.text(`Tong vang co phep: ${attendanceStats.absent_p} | Tong vang khong phep: ${attendanceStats.absent_np}`, 14, 30);
       
       const tableData = attendanceStats.studentList.map((s, index) => [
         index + 1,
         s.mahs,
         s.hoten,
         s.className,
         s.absent_p,
         s.absent_np,
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
         { header: 'Vắng không phép', key: 'absent_np', width: 15 },
         { header: 'Tổng vắng', key: 'total_absent', width: 15 }
       ];
       attendanceStats.studentList.forEach((s, index) => {
         worksheet.addRow({
           stt: index + 1,
           mahs: s.mahs,
           hoten: s.hoten,
           className: s.className,
           absent_p: s.absent_p,
           absent_np: s.absent_np,
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
        <div className="flex gap-4 mb-4 mt-2">
           <button className={`tab-btn ${mode === 'attendance' ? 'active' : ''}`} onClick={() => setMode('attendance')}>
             <CalendarCheck size={18} /> Chuyên cần
           </button>
           <button className={`tab-btn ${mode === 'violation' ? 'active' : ''}`} onClick={() => setMode('violation')}>
             <FileWarning size={18} /> Vi phạm
           </button>
        </div>

        {/* ===================== FILTERS ===================== */}
        <Card className="mb-4">
          <CardBody>
            <div className="filter-group">
              <label className="filter-label">Thời gian</label>
              <div className="filter-row">
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
                  className="filter-select"
                />
                
                {timeFilterType === 'day' && (
                  <div className="date-picker-wrapper" onClick={() => dateInputRef.current?.showPicker()}>
                    <input 
                      ref={dateInputRef}
                      type="date" 
                      className="input-field native-date-input" 
                      value={timeValueDay}
                      onChange={(e) => setTimeValueDay(e.target.value)}
                    />
                    <DayPicker 
                      value={timeValueDay} 
                      onChange={setTimeValueDay} 
                    />
                  </div>
                )}

                {timeFilterType === 'week' && (
                  <Select
                    value={timeValueWeek}
                    onChange={(e) => setTimeValueWeek(e.target.value)}
                    options={weekOptions}
                    className="filter-select"
                  />
                )}

                {timeFilterType === 'month' && (
                  <div className="date-picker-wrapper" onClick={() => monthInputRef.current?.showPicker()}>
                    <input 
                      ref={monthInputRef}
                      type="month" 
                      className="input-field native-date-input" 
                      value={timeValueMonth}
                      onChange={(e) => setTimeValueMonth(e.target.value)}
                    />
                    <MonthPicker 
                      value={timeValueMonth} 
                      onChange={setTimeValueMonth} 
                    />
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
                    className="filter-select"
                  />
                )}
              </div>
            </div>

            <div className="filter-group mt-3">
              <label className="filter-label">Đối tượng & Tìm kiếm</label>
              <div className="filter-row">
                {!isGiaovienOnly && (
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
                    className="filter-select"
                  />
                )}

                {targetFilterType === 'grade' && !isGiaovienOnly && (
                  <Select
                    value={targetValueGrade}
                    onChange={(e) => setTargetValueGrade(e.target.value)}
                    options={[{ value: '', label: 'Chọn khối...' }, ...gradeOptions]}
                    className="filter-select"
                  />
                )}

                {targetFilterType === 'class' && !isGiaovienOnly && (
                  <Select
                    value={targetValueClass}
                    onChange={(e) => setTargetValueClass(e.target.value)}
                    options={[{ value: '', label: 'Chọn lớp...' }, ...classOptions]}
                    className="filter-select"
                  />
                )}

                <div className="search-input-wrapper" style={{ flex: 1, minWidth: '200px' }}>
                  <SearchIcon className="search-icon" size={18} />
                  <Input
                    placeholder="Tìm mã hoặc tên HS..."
                    value={targetValueStudentId}
                    onChange={(e) => setTargetValueStudentId(e.target.value)}
                    hideLabel
                  />
                </div>
              </div>
            </div>

            {mode === 'attendance' && (
              <div className="filter-group mt-3">
                <label className="filter-label">Trạng thái, Buổi & Lý do</label>
                <div className="filter-row">
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'Tất cả trạng thái' },
                      { value: 'present', label: 'Đi học' },
                      { value: 'absent_p', label: 'Vắng có phép' },
                      { value: 'absent_np', label: 'Vắng không phép' }
                    ]}
                    className="filter-select"
                  />
                  <Select
                    value={sessionFilter}
                    onChange={(e) => setSessionFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'Tất cả các buổi' },
                      { value: 'Sáng', label: 'Buổi Sáng' },
                      { value: 'Chiều', label: 'Buổi Chiều' }
                    ]}
                    className="filter-select"
                  />
                  <Select
                    value={reasonFilter}
                    onChange={(e) => setReasonFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'Tất cả lý do' },
                      { value: 'Bệnh', label: 'Bệnh' },
                      { value: 'Việc riêng', label: 'Việc riêng' },
                      { value: 'absent_no_reason', label: 'Không có lý do (Không phép)' }
                    ]}
                    className="filter-select"
                  />
                </div>
              </div>
            )}

            {mode === 'violation' && (
              <div className="filter-group mt-3">
                <label className="filter-label">Loại vi phạm</label>
                <div className="filter-row">
                  <Select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'Tất cả các lỗi' },
                      ...violationTypes.map(t => ({ value: t.tenloai, label: t.tenloai }))
                    ]}
                    className="filter-select"
                  />
                </div>
              </div>
            )}

            {isGiaovienOnly && (
               <div className="text-primary mt-2 font-medium">
                  Chỉ hiển thị dữ liệu của lớp chủ nhiệm: {teacherClass || 'Chưa phân công'}
               </div>
            )}
          </CardBody>
        </Card>

        {/* ===================== EXPORT BUTTONS ===================== */}
        <div className="flex gap-3 mb-4">
           <Button variant="outline" onClick={handleExportPDF}>
              <FileText size={18} className="mr-2" /> Xuất PDF
           </Button>
           <Button variant="outline" onClick={handleExportExcel}>
              <Download size={18} className="mr-2" /> Xuất Excel
           </Button>
        </div>

        {/* ===================== STATISTICS DISPLAY ===================== */}
        {!loading && mode === 'attendance' && (
           <>
              <div className="stats-cards flex gap-4 mb-4 overflow-x-auto">
                 <div className="stat-card bg-white p-4 rounded-lg shadow min-w-[150px] flex-1 text-center border-b-4 border-green-500">
                    <div className="text-sm text-gray-500">Tổng đi học</div>
                    <div className="text-2xl font-bold text-green-600">{attendanceStats.present}</div>
                 </div>
                 <div className="stat-card bg-white p-4 rounded-lg shadow min-w-[150px] flex-1 text-center border-b-4 border-yellow-500">
                    <div className="text-sm text-gray-500">Vắng có phép</div>
                    <div className="text-2xl font-bold text-yellow-600">{attendanceStats.absent_p}</div>
                 </div>
                 <div className="stat-card bg-white p-4 rounded-lg shadow min-w-[150px] flex-1 text-center border-b-4 border-red-500">
                    <div className="text-sm text-gray-500">Vắng không phép</div>
                    <div className="text-2xl font-bold text-red-600">{attendanceStats.absent_np}</div>
                 </div>
              </div>

              <div className="charts-container grid md:grid-cols-2 gap-4 mb-4">
                 <Card>
                    <CardBody>
                       <h3 className="font-semibold mb-4 flex items-center"><PieIcon size={18} className="mr-2"/> Tỷ lệ chuyên cần</h3>
                       <div style={{ width: '100%', height: 250 }}>
                          <ResponsiveContainer>
                             <PieChart>
                                <Pie data={attendanceStats.pieData} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label>
                                   {attendanceStats.pieData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                   ))}
                                </Pie>
                                <RechartsTooltip />
                                <Legend />
                             </PieChart>
                          </ResponsiveContainer>
                       </div>
                    </CardBody>
                 </Card>
                 <Card>
                    <CardBody>
                       <h3 className="font-semibold mb-4 flex items-center"><BarChart2 size={18} className="mr-2"/> Top học sinh vắng nhiều</h3>
                       <div style={{ width: '100%', height: 250 }}>
                          <ResponsiveContainer>
                             <BarChart data={attendanceStats.studentList.slice(0, 5)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hoten" tick={{fontSize: 12}} width={100} />
                                <YAxis />
                                <RechartsTooltip />
                                <Legend />
                                <Bar dataKey="absent_p" name="Có phép" stackId="a" fill="#FFBB28" />
                                <Bar dataKey="absent_np" name="Không phép" stackId="a" fill="#FF8042" />
                             </BarChart>
                          </ResponsiveContainer>
                       </div>
                    </CardBody>
                 </Card>
              </div>

              <Card>
                 <CardBody>
                    <h3 className="font-semibold mb-4">Bảng dữ liệu chi tiết</h3>
                    <div className="modern-table-container">
                       <table className="modern-table">
                          <thead>
                             <tr>
                                <th>STT</th>
                                <th>Mã HS</th>
                                <th>Họ và tên</th>
                                <th>Lớp</th>
                                <th>Vắng CP</th>
                                <th>Vắng KP</th>
                                <th>Tổng vắng</th>
                             </tr>
                          </thead>
                          <tbody>
                             {attendanceStats.studentList.length > 0 ? attendanceStats.studentList.map((s, idx) => (
                                <tr key={s.mahs}>
                                   <td>{idx + 1}</td>
                                   <td>{s.mahs}</td>
                                   <td>{s.hoten}</td>
                                   <td>{s.className}</td>
                                   <td className="text-yellow-600 font-medium">{s.absent_p}</td>
                                   <td className="text-red-600 font-medium">{s.absent_np}</td>
                                   <td className="font-bold">{s.total_absent}</td>
                                </tr>
                             )) : (
                                <tr>
                                   <td colSpan="7" className="text-center py-4 text-gray-500">Không có dữ liệu vắng mặt</td>
                                </tr>
                             )}
                          </tbody>
                       </table>
                    </div>
                 </CardBody>
              </Card>
           </>
        )}

        {!loading && mode === 'violation' && (
           <>
              <div className="stats-cards flex gap-4 mb-4 overflow-x-auto">
                 <div className="stat-card bg-white p-4 rounded-lg shadow min-w-[150px] flex-1 text-center border-b-4 border-red-500">
                    <div className="text-sm text-gray-500">Tổng điểm trừ</div>
                    <div className="text-2xl font-bold text-red-600">{violationStats.totalPoints}</div>
                 </div>
                 <div className="stat-card bg-white p-4 rounded-lg shadow min-w-[150px] flex-1 text-center border-b-4 border-orange-500">
                    <div className="text-sm text-gray-500">Số lượt vi phạm</div>
                    <div className="text-2xl font-bold text-orange-600">{filteredViolations.length}</div>
                 </div>
              </div>

              <div className="charts-container grid md:grid-cols-2 gap-4 mb-4">
                 <Card>
                    <CardBody>
                       <h3 className="font-semibold mb-4 flex items-center"><PieIcon size={18} className="mr-2"/> Phân bổ loại vi phạm</h3>
                       <div style={{ width: '100%', height: 250 }}>
                          <ResponsiveContainer>
                             <PieChart>
                                <Pie data={violationStats.pieData} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label>
                                   {violationStats.pieData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                   ))}
                                </Pie>
                                <RechartsTooltip />
                                <Legend />
                             </PieChart>
                          </ResponsiveContainer>
                       </div>
                    </CardBody>
                 </Card>
                 <Card>
                    <CardBody>
                       <h3 className="font-semibold mb-4 flex items-center"><BarChart2 size={18} className="mr-2"/> Top học sinh vi phạm</h3>
                       <div style={{ width: '100%', height: 250 }}>
                          <ResponsiveContainer>
                             <BarChart data={violationStats.studentList.slice(0, 5)} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="hoten" type="category" width={100} tick={{fontSize: 12}} />
                                <RechartsTooltip />
                                <Legend />
                                <Bar dataKey="points" name="Điểm trừ" fill="#EF4444" />
                             </BarChart>
                          </ResponsiveContainer>
                       </div>
                    </CardBody>
                 </Card>
              </div>

              <Card>
                 <CardBody>
                    <h3 className="font-semibold mb-4">Bảng dữ liệu chi tiết</h3>
                    <div className="modern-table-container">
                       <table className="modern-table">
                          <thead>
                             <tr>
                                <th>STT</th>
                                <th>Mã HS</th>
                                <th>Họ và tên</th>
                                <th>Lớp</th>
                                <th>Số lần VP</th>
                                <th>Tổng điểm trừ</th>
                             </tr>
                          </thead>
                          <tbody>
                             {violationStats.studentList.length > 0 ? violationStats.studentList.map((s, idx) => (
                                <tr key={s.mahs}>
                                   <td>{idx + 1}</td>
                                   <td>{s.mahs}</td>
                                   <td>{s.hoten}</td>
                                   <td>{s.className}</td>
                                   <td className="font-medium">{s.count}</td>
                                   <td className="text-red-600 font-bold">{s.points}</td>
                                </tr>
                             )) : (
                                <tr>
                                   <td colSpan="6" className="text-center py-4 text-gray-500">Không có dữ liệu vi phạm</td>
                                </tr>
                             )}
                          </tbody>
                       </table>
                    </div>
                 </CardBody>
              </Card>
           </>
        )}
      </div>
    </>
  );
}
