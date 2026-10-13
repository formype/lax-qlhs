import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
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
  Filter, 
  X,
  BookOpen,
  GraduationCap
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import './ExtraClassStudentList.css';

export function ExtraClassStudentList() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Role permissions check
  const isAuthorized = user?.role?.includes('admin') || 
                       user?.role?.includes('vip-admin') || 
                       user?.role?.includes('giamthi');

  const [extraClasses, setExtraClasses] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState('all');
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
      } catch (error) {
        console.error('Lỗi tải danh sách học sinh ngoại khóa:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAuthorized, navigate]);

  // Group students by extraClassId
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

    // Sort students in each class: lop ascending, then mahs ascending
    Object.keys(map).forEach(clsId => {
      map[clsId] = sortExtraClassStudents(map[clsId]);
    });

    return map;
  }, [extraClasses, allStudents]);

  // Filtered classes and their filtered students
  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const targetClasses = selectedClassId === 'all' 
      ? extraClasses 
      : extraClasses.filter(c => c.id === selectedClassId);

    return targetClasses.map(cls => {
      const clsStudents = studentsByClass[cls.id] || [];
      const filteredStudents = query 
        ? clsStudents.filter(s => 
            (s.hoten || '').toLowerCase().includes(query) ||
            (s.mahs || '').toLowerCase().includes(query) ||
            (s.tenlop || s.lop || '').toLowerCase().includes(query)
          )
        : clsStudents;

      return {
        ...cls,
        totalEnrolled: clsStudents.length,
        students: filteredStudents
      };
    });
  }, [extraClasses, studentsByClass, selectedClassId, searchQuery]);

  // Total summary counts
  const totalExtraClasses = extraClasses.length;
  const totalEnrolledStudents = allStudents.length;

  // Export Excel function: Each subject is 1 sheet
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

        // Sheet data array
        // Row 1: Title "DANH SÁCH HỌC SINH HỌC NGOẠI KHÓA MÔN [TÊN MÔN]"
        // Row 2: Empty row
        // Row 3: Table Header: STT, Họ và tên học sinh, Lớp
        // Row 4+: Student rows
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

        // Column widths
        ws['!cols'] = [
          { wch: 8 },  // STT
          { wch: 30 }, // Họ và tên học sinh
          { wch: 15 }  // Lớp
        ];

        // Merge title header across 3 columns: A1 to C1
        ws['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }
        ];

        // Sanitize sheet name (Excel limit: max 31 chars, no : \ / ? * [ ])
        let safeSheetName = clsName
          .replace(/[:\\/?*\[\]]/g, '')
          .trim()
          .slice(0, 31);
        if (!safeSheetName) {
          safeSheetName = `Mon_${cls.id.slice(0, 6)}`;
        }

        // Handle duplicate sheet names
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

  // Export a single subject to Excel
  const handleExportSingleClassToExcel = (cls) => {
    try {
      setExporting(true);
      const wb = XLSX.utils.book_new();
      const clsName = cls.tenlopngoaikhoa || cls.name || 'Môn ngoại khóa';
      const clsStudents = studentsByClass[cls.id] || [];

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
        {/* Top Summary Banner */}
        <div className="extra-list-summary-card">
          <div className="summary-stat-box">
            <div className="stat-icon-wrapper bg-purple">
              <Sparkles size={22} />
            </div>
            <div className="stat-text-group">
              <span className="stat-number">{totalExtraClasses}</span>
              <span className="stat-label">Môn ngoại khóa</span>
            </div>
          </div>

          <div className="summary-divider" />

          <div className="summary-stat-box">
            <div className="stat-icon-wrapper bg-blue">
              <Users size={22} />
            </div>
            <div className="stat-text-group">
              <span className="stat-number">{totalEnrolledStudents}</span>
              <span className="stat-label">Học sinh đã đăng ký</span>
            </div>
          </div>

          <div className="summary-actions">
            <Button
              className="export-all-excel-btn"
              onClick={handleExportAllToExcel}
              disabled={loading || exporting || totalExtraClasses === 0}
            >
              <FileSpreadsheet size={18} />
              <span>{exporting ? 'Đang xuất Excel...' : 'Xuất Excel tất cả các môn'}</span>
            </Button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <Card className="filter-controls-card">
          <CardBody className="filter-controls-body">
            {/* Subject Tabs / Pills */}
            <div className="subject-pills-bar">
              <span className="pills-label">
                <Filter size={15} />
                <span>Môn:</span>
              </span>
              <div className="pills-scroll-container">
                <button
                  type="button"
                  className={`subject-pill-btn ${selectedClassId === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedClassId('all')}
                >
                  Tất cả các môn ({totalEnrolledStudents})
                </button>
                {extraClasses.map(cls => {
                  const count = (studentsByClass[cls.id] || []).length;
                  const isSelected = selectedClassId === cls.id;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      className={`subject-pill-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedClassId(cls.id)}
                    >
                      <span>{cls.tenlopngoaikhoa || cls.name}</span>
                      <span className="pill-count-badge">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Input Bar */}
            <div className="search-input-wrapper">
              <Search size={18} className="search-input-icon" />
              <input
                type="text"
                placeholder="Tìm kiếm theo họ tên, lớp (ví dụ: 10A1) hoặc mã học sinh..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-text-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  title="Xóa tìm kiếm"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Content list / Tables by subject */}
        {loading ? (
          <div className="loading-state-container">
            <div className="loading-spinner" />
            <p>Đang tải danh sách học sinh ngoại khóa...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="empty-state-card">
            <Sparkles size={40} className="empty-icon" />
            <h3>Chưa có môn ngoại khóa nào</h3>
            <p>Vui lòng thêm môn ngoại khóa và học sinh để xem danh sách tại đây.</p>
          </div>
        ) : (
          <div className="classes-list-container">
            {filteredData.map(cls => {
              const students = cls.students || [];
              const isSearching = searchQuery.trim().length > 0;

              return (
                <Card key={cls.id} className="subject-group-card">
                  <div className="subject-card-header">
                    <div className="subject-title-area">
                      <div className="subject-icon-badge">
                        <Sparkles size={20} color="#8b5cf6" />
                      </div>
                      <div>
                        <h3 className="subject-title">
                          Môn: {cls.tenlopngoaikhoa || cls.name}
                        </h3>
                        <span className="subject-subtitle">
                          {cls.totalEnrolled} học sinh đăng ký
                          {isSearching && ` (khớp ${students.length} kết quả tìm kiếm)`}
                        </span>
                      </div>
                    </div>

                    <div className="subject-header-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="export-single-sheet-btn"
                        onClick={() => handleExportSingleClassToExcel(cls)}
                        title={`Xuất riêng danh sách môn ${cls.tenlopngoaikhoa || cls.name}`}
                      >
                        <Download size={15} />
                        <span>Xuất môn này</span>
                      </Button>
                    </div>
                  </div>

                  <CardBody className="subject-card-body">
                    {students.length === 0 ? (
                      <div className="subject-empty-students">
                        {isSearching ? (
                          <p>Không tìm thấy học sinh nào phù hợp với từ khóa "{searchQuery}"</p>
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
                              <th style={{ width: '110px', textAlign: 'center' }}>Lớp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {students.map((st, idx) => (
                              <tr key={st.id || `${cls.id}_${st.mahs}_${idx}`}>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
