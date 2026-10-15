import React, { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { getDailyLogs, deleteDailyLog, fetchSystemSettings, fetchUsers } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO, parse } from 'date-fns';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { DayPicker, MonthPicker } from '../components/ui/DatePicker';
import { Card, CardBody } from '../components/ui/Card';
import { ExternalLink, Trash2, Calendar, Clock, User, FileText, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import './Search.css'; // Re-use search css

const ProofImagePreview = ({ url, labelText }) => {
  const [isImageError, setIsImageError] = useState(false);
  if (!url) return null;

  let imgSrc = url;
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    imgSrc = `https://drive.google.com/uc?id=${driveMatch[1]}`;
  }

  return (
    <>
      {!isImageError ? (
        <img 
          src={imgSrc} 
          alt="Đính kèm" 
          onClick={() => window.open(url, '_blank')} 
          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)', cursor: 'pointer' }} 
          title="Nhấn để xem ảnh lớn"
          onError={() => setIsImageError(true)}
        />
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <ExternalLink size={14} style={{ marginRight: '6px' }} /> {labelText || 'Mở file đính kèm'}
        </a>
      )}
    </>
  );
};

export function DailyLogList() {
  const [allLogs, setAllLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [timeFilterType, setTimeFilterType] = useState('week'); // all, day, week, month
  const [timeValueDay, setTimeValueDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeValueWeek, setTimeValueWeek] = useState('1');
  const [timeValueMonth, setTimeValueMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  const [sessionFilter, setSessionFilter] = useState('all'); // all, Sáng, Chiều
  
  const { user } = useAuth();
  
  const isAdmin = user?.role?.includes('admin') || user?.role?.includes('vip-admin');
  const isGiamthi = user?.role?.includes('giamthi');

  const fetchData = async () => {
    setLoading(true);
    const [fetchedLogs, sData, usersData] = await Promise.all([
      getDailyLogs(),
      fetchSystemSettings(),
      fetchUsers()
    ]);
    
    const uMap = {};
    if (usersData) {
      usersData.forEach(u => {
        uMap[u.id] = u.fullName || u.name || u.hoten || u.username || 'Unknown';
      });
    }
    setUsersMap(uMap);
    
    setAllLogs(fetchedLogs);
    setSettings(sData);

    if (sData) {
      const today = new Date();
      const s1Start = parse(sData.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
      const s2Start = parse(sData.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
      const s1Weeks = parseInt(sData.semester1Weeks || 18, 10);
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

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const logs = React.useMemo(() => {
    if (!settings) return [];
    const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s1Weeks = parseInt(settings.semester1Weeks || 18, 10);
    const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());

    return allLogs.filter(v => {
      let vDate;
      if (v.ngay) {
        vDate = parseISO(v.ngay);
      } else {
        return false;
      }

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
        if (v.ngay !== timeValueDay) return false;
      } else if (timeFilterType === 'week') {
        if (weekNum.toString() !== timeValueWeek) return false;
      } else if (timeFilterType === 'month') {
        if (format(vDate, 'yyyy-MM') !== timeValueMonth) return false;
      }

      // Session Filter
      if (sessionFilter !== 'all') {
        if (v.buoi !== sessionFilter) return false;
      }

      return true;
    });
  }, [allLogs, settings, timeFilterType, timeValueDay, timeValueWeek, timeValueMonth, sessionFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa ghi nhận này?')) return;
    await deleteDailyLog(id);
    fetchData();
  };

  const weekOptions = React.useMemo(() => {
    if (!settings) return [];
    const s1Start = parse(settings.semester1StartDate || '2026-09-07', 'yyyy-MM-dd', new Date());
    const s2Start = parse(settings.semester2StartDate || '2027-01-18', 'yyyy-MM-dd', new Date());
    const s1Weeks = parseInt(settings.semester1Weeks || 18, 10);
    const s2Weeks = parseInt(settings.semester2Weeks || 17, 10);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [logs]);

  const totalPages = Math.ceil(logs.length / itemsPerPage);
  const paginatedLogs = logs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const exportPDF = async () => {
    if (logs.length === 0) return;

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

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    doc.addFileToVFS('Tinos-Regular.ttf', regularBase64);
    doc.addFont('Tinos-Regular.ttf', 'Tinos', 'normal');
    doc.addFileToVFS('Tinos-Bold.ttf', boldBase64);
    doc.addFont('Tinos-Bold.ttf', 'Tinos', 'bold');

    doc.setFont('Tinos', 'bold');
    doc.setFontSize(12);
    
    doc.text("ỦY BAN NHÂN DÂN PHƯỜNG MINH PHỤNG", 14, 15);
    doc.text("TRƯỜNG THCS LÊ ANH XUÂN", 14, 21);
    
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", pageWidth - 14, 15, { align: 'right' });
    doc.text("Độc lập - Tự do - Hạnh phúc", pageWidth - 14, 21, { align: 'right' });

    doc.setFontSize(15);
    doc.text("DANH SÁCH GHI NHẬN HÀNG NGÀY", pageWidth / 2, 33, { align: 'center' });

    const tableColumn = ["STT", "Ngày", "Buổi", "Nội dung ghi nhận", "Người ghi nhận"];
    const tableRows = logs.map((log, index) => {
      const dateStr = log.ngay ? format(parseISO(log.ngay), 'dd/MM/yyyy') : '';
      const creator = (log.createdById && usersMap[log.createdById]) || (log.createdBy !== 'Unknown' ? log.createdBy : 'Người dùng');
      return [
        (index + 1).toString(),
        dateStr,
        log.buoi || '',
        log.noidung || '',
        creator
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 42,
      styles: { font: 'Tinos', fontSize: 11, lineWidth: 0.1, lineColor: [0, 0, 0] },
      headStyles: { font: 'Tinos', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: 'center' },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 85 },
        4: { cellWidth: 40 }
      }
    });

    doc.save(`DanhSachGhiNhan_${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  const exportExcel = async () => {
    if (logs.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DanhSachGhiNhan');

    worksheet.pageSetup.orientation = 'portrait';
    worksheet.pageSetup.paperSize = 9; // A4

    worksheet.columns = [
      { width: 8 },  // A: STT
      { width: 15 }, // B: Ngày
      { width: 12 }, // C: Buổi
      { width: 55 }, // D: Nội dung ghi nhận
      { width: 25 }, // E: Người ghi nhận
      { width: 20 }  // F: Thời gian tạo
    ];

    // Row 1
    worksheet.mergeCells('A1:C1');
    const cellA1 = worksheet.getCell('A1');
    cellA1.value = "ỦY BAN NHÂN DÂN PHƯỜNG MINH PHỤNG";
    cellA1.font = { name: 'Times New Roman', size: 12, bold: false };
    cellA1.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('D1:F1');
    const cellD1 = worksheet.getCell('D1');
    cellD1.value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
    cellD1.font = { name: 'Times New Roman', size: 12, bold: true };
    cellD1.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 2
    worksheet.mergeCells('A2:C2');
    const cellA2 = worksheet.getCell('A2');
    cellA2.value = "TRƯỜNG THCS LÊ ANH XUÂN";
    cellA2.font = { name: 'Times New Roman', size: 12, bold: true, underline: true };
    cellA2.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('D2:F2');
    const cellD2 = worksheet.getCell('D2');
    cellD2.value = "Độc lập - Tự do - Hạnh phúc";
    cellD2.font = { name: 'Times New Roman', size: 12, bold: true, underline: true };
    cellD2.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 4: Title
    worksheet.mergeCells('A4:F4');
    const cellA4 = worksheet.getCell('A4');
    cellA4.value = "DANH SÁCH GHI NHẬN HÀNG NGÀY";
    cellA4.font = { name: 'Times New Roman', size: 15, bold: true };
    cellA4.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 6: Headers
    const headers = ["STT", "Ngày", "Buổi", "Nội dung ghi nhận", "Người ghi nhận", "Thời gian tạo"];
    const headerRow = worksheet.getRow(6);
    headerRow.values = headers;
    headerRow.font = { name: 'Times New Roman', size: 12, bold: true };
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
    logs.forEach((log, index) => {
      const dateStr = log.ngay ? format(parseISO(log.ngay), 'dd/MM/yyyy') : '';
      const creator = (log.createdById && usersMap[log.createdById]) || (log.createdBy !== 'Unknown' ? log.createdBy : 'Người dùng');
      let createdTimeStr = '';
      if (log.createdAt) {
        const cDate = log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt.seconds * 1000);
        createdTimeStr = format(cDate, 'HH:mm dd/MM/yyyy');
      }

      const rowData = [
        index + 1,
        dateStr,
        log.buoi || '',
        log.noidung || '',
        creator,
        createdTimeStr
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
        if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 6) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 4) {
          cell.alignment = { vertical: 'middle', wrapText: true };
        } else {
          cell.alignment = { vertical: 'middle' };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `DanhSachGhiNhan_${format(new Date(), 'ddMMyyyy')}.xlsx`);
  };

  return (
    <div className="search-page pb-20">
      <Header title="Danh sách ghi nhận" />
      
      <div className="search-content">
        <Card className="filter-card">
          <CardBody>
            <div className="filter-grid">
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
                      {value: 'month', label: 'Theo tháng'}
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
                </div>
              </div>

              <div className="filter-group">
                <label className="text-sm font-semibold mb-1 block">Buổi học</label>
                <Select 
                  value={sessionFilter}
                  onChange={e => setSessionFilter(e.target.value)}
                  options={[
                    {value: 'all', label: 'Tất cả buổi'},
                    {value: 'Sáng', label: 'Buổi sáng'},
                    {value: 'Chiều', label: 'Buổi chiều'}
                  ]}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="export-actions flex-between mt-3 mb-3">
          <span className="text-muted text-sm font-semibold">Tìm thấy {logs.length} kết quả</span>
          <div className="flex-row gap-2">
            <Button variant="secondary" size="sm" onClick={exportPDF} disabled={logs.length === 0}>
              <FileText size={15} style={{ marginRight: '6px' }} /> Xuất PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={exportExcel} disabled={logs.length === 0}>
              <Download size={15} style={{ marginRight: '6px' }} /> Xuất Excel
            </Button>
          </div>
        </div>

        <div className="search-results-grid">
          {loading ? (
            <p className="text-center text-muted mt-4 w-full">Đang tải...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted mt-4 w-full py-4">Không có dữ liệu ghi nhận</p>
          ) : (
            paginatedLogs.map(log => (
              <Card key={log.id} className="violation-card-modern">
                <CardBody>
                  <div className="flex-between mb-2 align-start">
                    <div className="student-name-modern" style={{ display: 'flex', alignItems: 'center' }}>
                      <Calendar size={16} className="mr-2" style={{ marginRight: '6px' }} />
                      {log.ngay ? format(parseISO(log.ngay), 'dd/MM/yyyy') : ''}
                    </div>
                    <span className="class-badge-modern">{log.buoi}</span>
                  </div>
                  
                  <div className="violation-info-modern mt-3 mb-4" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: 'var(--text-color)' }}>
                    {log.noidung}
                  </div>
                  
                  {log.images && log.images.length > 0 && (
                    <div className="mt-3 mb-2">
                      <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Hình ảnh đính kèm:</p>
                        <div className="flex-row gap-2 flex-wrap">
                          {log.images.map((url, index) => (
                             <ProofImagePreview key={index} url={url} labelText={`Xem ảnh ${index + 1}`} />
                          ))}
                        </div>
                    </div>
                  )}
                  
                  <div className="violation-footer-modern mt-4 pt-3" style={{ borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="text-sm text-muted" style={{ display: 'flex', alignItems: 'center' }}>
                      <User size={14} style={{ marginRight: '6px' }} /> 
                      <span>
                        Ghi nhận bởi: <strong style={{ color: 'var(--text-color)', marginLeft: '2px' }}>
                          {(log.createdById && usersMap[log.createdById]) || (log.createdBy !== 'Unknown' ? log.createdBy : 'Người dùng')}
                        </strong>
                        {log.createdAt && <span style={{ marginLeft: '4px' }}>lúc {format(log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt.seconds * 1000), 'HH:mm dd/MM/yyyy')}</span>}
                      </span>
                    </div>
                    {(isAdmin || isGiamthi) && (
                      <Button variant="secondary" size="sm" onClick={() => handleDelete(log.id)} style={{ padding: '4px 8px', color: '#ef4444' }}>
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex-row gap-2" style={{ justifyContent: 'center', marginTop: '20px', marginBottom: '20px' }}>
            <Button variant="secondary" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              &lt; Trước
            </Button>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px', padding: '0 10px' }}>Trang {currentPage} / {totalPages}</span>
            <Button variant="secondary" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              Sau &gt;
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
