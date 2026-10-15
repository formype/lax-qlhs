import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { 
  fetchExtraClasses, 
  fetchAllExtraClassStudents, 
  sortExtraClassStudents 
} from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Users, 
  FileSpreadsheet, 
  Search, 
  Sparkles, 
  Download, 
  X
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import './ExtraClassStudentList.css';

export function ExtraClassStudentList() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Role permissions check: admin, vip-admin, giamthi, giaovien
  const isAuthorized = user?.role?.includes('admin') || 
                       user?.role?.includes('vip-admin') || 
                       user?.role?.includes('giamthi') ||
                       user?.role?.includes('giaovien');

  const [extraClasses, setExtraClasses] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isAuthorized) {
      alert('Bạn không có quyền truy cập vào chức năng này!');
      navigate('/', { replace: true });
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [classesData, studentsData] = await Promise.all([
          fetchExtraClasses(),
          fetchAllExtraClassStudents()
        ]);
        setExtraClasses(classesData);
        setAllStudents(studentsData);

        // Mặc định chọn môn đầu tiên nếu có
        if (classesData.length > 0) {
          setSelectedClassId(classesData[0].id);
        }
      } catch (error) {
        console.error('Lỗi tải danh sách học sinh ngoại khóa:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAuthorized, navigate]);

  // Selected class object
  const selectedClass = useMemo(() => {
    return extraClasses.find(c => c.id === selectedClassId) || null;
  }, [extraClasses, selectedClassId]);

  // Group all students by extraClassId
  const studentsByClass = useMemo(() => {
    const map = {};
    extraClasses.forEach(cls => {
      map[cls.id] = [];
    });

    allStudents.forEach(st => {
      if (st.extraClassId) {
        if (!map[st.extraClassId]) {
          map[st.extraClassId] = [];
        }
        map[st.extraClassId].push(st);
      }
    });

    // Sort students in each class: lớp ascending, then mahs ascending
    Object.keys(map).forEach(clsId => {
      map[clsId] = sortExtraClassStudents(map[clsId]);
    });

    return map;
  }, [extraClasses, allStudents]);

  // Students for the currently selected class
  const currentClassStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return studentsByClass[selectedClassId] || [];
  }, [studentsByClass, selectedClassId]);

  // Filtered students by search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return currentClassStudents;
    const q = searchQuery.trim().toLowerCase();
    return currentClassStudents.filter(s =>
      (s.hoten || '').toLowerCase().includes(q) ||
      (s.mahs || '').toLowerCase().includes(q) ||
      (s.tenlop || s.lop || '').toLowerCase().includes(q)
    );
  }, [currentClassStudents, searchQuery]);

  // Dropdown options matching Image 2
  const classSelectOptions = useMemo(() => {
    return extraClasses.map(c => ({
      value: c.id,
      label: `Lớp ngoại khóa: ${c.tenlopngoaikhoa || c.name}`
    }));
  }, [extraClasses]);

  // Export Excel: Mỗi môn là 1 sheet
  const handleExportAllToExcel = () => {
    if (!extraClasses || extraClasses.length === 0) {
      alert('Không có lớp ngoại khóa nào để xuất!');
      return;
    }

    try {
      setExporting(true);
      const wb = XLSX.utils.book_new();
      let sheetCount = 0;

      extraClasses.forEach(cls => {
        const clsName = cls.tenlopngoaikhoa || cls.name || 'Môn ngoại khóa';
        const clsStudents = studentsByClass[cls.id] || [];

        // Tiêu đề và định dạng theo yêu cầu
        // Tiêu đề: DANH SÁCH HỌC SINH HỌC NGOẠI KHÓA MÔN [TÊN MÔN]
        // Cột: STT, Họ và tên học sinh, Lớp
        const wsData = [
          [`DANH SÁCH HỌC SINH HỌC NGOẠI KHÓA MÔN ${clsName.toUpperCase()}`],
          [],
          ['STT', 'Họ và tên học sinh', 'Lớp']
        ];

        clsStudents.forEach((st, idx) => {
          wsData.push([
            idx + 1,
            st.hoten || '',
            st.tenlop || st.lop || ''
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Độ rộng cột
        ws['!cols'] = [
          { wch: 8 },  // STT
          { wch: 30 }, // Họ và tên học sinh
          { wch: 15 }  // Lớp
        ];

        // Merge dòng tiêu đề qua 3 cột A1:C1
        ws['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }
        ];

        // Sanitize tên sheet (tối đa 31 ký tự, không chứa ký tự cấm của Excel)
        let safeSheetName = clsName
          .replace(/[:\\/?*\[\]]/g, '')
          .trim()
          .slice(0, 31);
        if (!safeSheetName) {
          safeSheetName = `Mon_${cls.id.slice(0, 6)}`;
        }

        // Tránh trùng tên sheet
        let finalSheetName = safeSheetName;
        let counter = 1;
        while (wb.SheetNames.includes(finalSheetName)) {
          finalSheetName = `${safeSheetName.slice(0, 27)}_${counter++}`;
        }

        XLSX.utils.book_append_sheet(wb, ws, finalSheetName);
        sheetCount++;
      });

      if (sheetCount === 0) {
        alert('Không có dữ liệu môn ngoại khóa để xuất!');
        return;
      }

      const dateStr = format(new Date(), 'dd_MM_yyyy');
      XLSX.writeFile(wb, `Danh_sach_hoc_sinh_ngoai_khoa_${dateStr}.xlsx`);
    } catch (error) {
      console.error('Lỗi khi xuất file Excel:', error);
      alert('Có lỗi xảy ra khi tạo file Excel: ' + (error.message || error));
    } finally {
      setExporting(false);
    }
  };

  // Xuất Excel cho riêng môn đang chọn
  const handleExportCurrentClassToExcel = () => {
    if (!selectedClass) {
      alert('Vui lòng chọn môn ngoại khóa để xuất!');
      return;
    }

    try {
      setExporting(true);
      const wb = XLSX.utils.book_new();
      const clsName = selectedClass.tenlopngoaikhoa || selectedClass.name || 'Môn ngoại khóa';
      const clsStudents = currentClassStudents;

      const wsData = [
        [`DANH SÁCH HỌC SINH HỌC NGOẠI KHÓA MÔN ${clsName.toUpperCase()}`],
        [],
        ['STT', 'Họ và tên học sinh', 'Lớp']
      ];

      clsStudents.forEach((st, idx) => {
        wsData.push([
          idx + 1,
          st.hoten || '',
          st.tenlop || st.lop || ''
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 8 },
        { wch: 30 },
        { wch: 15 }
      ];
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }
      ];

      let safeSheetName = clsName
        .replace(/[:\\/?*\[\]]/g, '')
        .trim()
        .slice(0, 31) || 'Mon_ngoai_khoa';

      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

      const dateStr = format(new Date(), 'dd_MM_yyyy');
      const safeFileName = safeSheetName.replace(/\s+/g, '_');
      XLSX.writeFile(wb, `Danh_sach_HS_${safeFileName}_${dateStr}.xlsx`);
    } catch (error) {
      console.error('Lỗi khi xuất file Excel:', error);
      alert('Có lỗi xảy ra khi tạo file Excel: ' + (error.message || error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="extra-class-student-list-page">
      <Header title="Danh sách học sinh ngoại khóa" />

      <div className="extra-list-content">
        {/* Hàng chọn môn (giống hình 2) & Các nút xuất Excel */}
        <Card className="class-selector-card">
          <CardBody className="class-selector-body">
            <div className="selector-row">
              <div className="selector-select-wrapper">
                {loading ? (
                  <div className="selector-loading-text">Đang tải danh sách môn ngoại khóa...</div>
                ) : extraClasses.length === 0 ? (
                  <div className="text-muted text-sm">Chưa có môn ngoại khóa nào trong hệ thống.</div>
                ) : (
                  <Select
                    value={selectedClassId}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      setSearchQuery('');
                    }}
                    options={classSelectOptions}
                    className="extra-class-dropdown"
                  />
                )}
              </div>

              {/* Nút xuất Excel */}
              <div className="export-actions-group">
                <Button
                  className="export-btn-all"
                  onClick={handleExportAllToExcel}
                  disabled={loading || exporting || extraClasses.length === 0}
                  title="Xuất 1 file Excel chứa tất cả các môn, mỗi môn là 1 sheet"
                >
                  <FileSpreadsheet size={17} />
                  <span>Xuất Excel tất cả các môn</span>
                </Button>

                {selectedClass && (
                  <Button
                    variant="secondary"
                    className="export-btn-single"
                    onClick={handleExportCurrentClassToExcel}
                    disabled={loading || exporting}
                    title="Chỉ xuất danh sách của môn đang chọn"
                  >
                    <Download size={16} />
                    <span>Xuất môn này</span>
                  </Button>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Nội dung danh sách học sinh của môn đã chọn */}
        {loading ? (
          <div className="loading-state-container">
            <div className="loading-spinner" />
            <p>Đang tải dữ liệu học sinh...</p>
          </div>
        ) : !selectedClass ? (
          <div className="empty-state-card">
            <Sparkles size={40} className="empty-icon" />
            <h3>Chưa chọn môn ngoại khóa</h3>
            <p>Vui lòng chọn một môn ngoại khóa từ menu phía trên để xem danh sách học sinh.</p>
          </div>
        ) : (
          <Card className="subject-detail-card">
            {/* Header thông tin môn và thanh tìm kiếm */}
            <div className="subject-detail-header">
              <div className="subject-title-info">
                <div className="subject-icon-box">
                  <Sparkles size={20} color="#8b5cf6" />
                </div>
                <div>
                  <h3 className="subject-heading">
                    {selectedClass.tenlopngoaikhoa || selectedClass.name}
                  </h3>
                  <span className="subject-count-text">
                    Tổng số: <strong>{currentClassStudents.length}</strong> học sinh
                    {searchQuery.trim() && ` (Tìm thấy: ${filteredStudents.length})`}
                  </span>
                </div>
              </div>

              {/* Thanh tìm kiếm nhanh trong môn */}
              <div className="search-box-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Tìm học sinh theo họ tên, lớp, mã HS..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input-field"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear-button"
                    onClick={() => setSearchQuery('')}
                    title="Xóa tìm kiếm"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Bảng danh sách học sinh */}
            <CardBody className="subject-detail-body">
              {filteredStudents.length === 0 ? (
                <div className="empty-students-notice">
                  {searchQuery.trim() ? (
                    <p>Không tìm thấy học sinh nào phù hợp với từ khóa "{searchQuery}".</p>
                  ) : (
                    <p>Chưa có học sinh nào đăng ký môn ngoại khóa này.</p>
                  )}
                </div>
              ) : (
                <div className="table-responsive-wrapper">
                  <table className="extra-class-table">
                    <thead>
                      <tr>
                        <th style={{ width: '60px', textAlign: 'center' }}>STT</th>
                        <th style={{ width: '130px' }}>Mã HS</th>
                        <th>Họ và tên học sinh</th>
                        <th style={{ width: '120px', textAlign: 'center' }}>Lớp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((st, idx) => (
                        <tr key={st.id || `${selectedClass.id}_${st.mahs}_${idx}`}>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {idx + 1}
                          </td>
                          <td>
                            <span className="student-mahs-badge">{st.mahs || '---'}</span>
                          </td>
                          <td>
                            <span className="student-name-text">{st.hoten || '---'}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="student-class-badge">{st.tenlop || st.lop || '---'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
