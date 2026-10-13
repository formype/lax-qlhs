import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { 
  fetchExtraClasses, 
  fetchStudents, 
  fetchClasses,
  fetchStudentsForExtraClass, 
  addStudentsToExtraClass, 
  removeStudentFromExtraClass,
  removeMultipleStudentsFromExtraClass,
  transferExtraClassStudents
} from '../lib/firebase';
import { 
  Users, 
  FileSpreadsheet, 
  Download, 
  FileUp, 
  Plus, 
  Trash2, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  Sparkles, 
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
  ArrowRightLeft,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import './ManageExtraClassStudents.css';

export function ManageExtraClassStudents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const isAdmin = user?.role?.includes('admin') || user?.role?.includes('vip-admin');

  // Extra classes list
  const [extraClasses, setExtraClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedClass, setSelectedClass] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(true);

  // Enrolled students in selected extra class
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [loadingEnrolled, setLoadingEnrolled] = useState(false);
  const [enrolledSearch, setEnrolledSearch] = useState('');
  const [selectedEnrolledIds, setSelectedEnrolledIds] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Chuyển lớp ngoại khóa state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [studentsToTransfer, setStudentsToTransfer] = useState([]);
  const [targetTransferClassId, setTargetTransferClassId] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Active input mode: 'manual' (Dạng 1) | 'excel' (Dạng 2)
  const [activeTab, setActiveTab] = useState('manual');

  // Dạng 1: Select from all students
  const [allStudents, setAllStudents] = useState([]);
  const [classesList, setClassesList] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState(new Set()); // Set of student IDs or mahs
  const [addingManual, setAddingManual] = useState(false);
  const [manualSuccess, setManualSuccess] = useState('');
  const [manualError, setManualError] = useState('');

  // Dạng 2: Excel import
  const [excelFile, setExcelFile] = useState(null);
  const [excelPreview, setExcelPreview] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [savingExcel, setSavingExcel] = useState(false);
  const [excelSuccess, setExcelSuccess] = useState('');
  const [excelError, setExcelError] = useState('');

  // Load extra classes and regular classes on mount
  useEffect(() => {
    if (!isAdmin) return;

    const loadInitial = async () => {
      setLoadingClasses(true);
      const [eClasses, cList] = await Promise.all([
        fetchExtraClasses(),
        fetchClasses()
      ]);
      setExtraClasses(eClasses);
      setClassesList(cList);
      if (eClasses.length > 0) {
        setSelectedClassId(eClasses[0].id);
        setSelectedClass(eClasses[0]);
      }
      setLoadingClasses(false);
    };

    loadInitial();
  }, [isAdmin]);

  // Load students for selected extra class
  const loadEnrolled = async (classId) => {
    if (!classId) {
      setEnrolledStudents([]);
      return;
    }
    setLoadingEnrolled(true);
    const list = await fetchStudentsForExtraClass(classId);
    setEnrolledStudents(list);
    setSelectedEnrolledIds(new Set());
    setLoadingEnrolled(false);
  };

  // Load all students for Dạng 1
  const loadAllStudents = async () => {
    if (allStudents.length > 0) return;
    setLoadingStudents(true);
    const data = await fetchStudents();
    setAllStudents(data);
    setLoadingStudents(false);
  };

  // When selected class changes
  useEffect(() => {
    if (selectedClassId) {
      const cls = extraClasses.find(c => c.id === selectedClassId);
      setSelectedClass(cls || null);
      loadEnrolled(selectedClassId);
      setSelectedToAdd(new Set());
      setManualSuccess('');
      setManualError('');
      setExcelSuccess('');
      setExcelError('');
      setExcelPreview([]);
      setExcelFile(null);
    }
  }, [selectedClassId, extraClasses]);

  // Load all students when opening Dạng 1
  useEffect(() => {
    if (activeTab === 'manual') {
      loadAllStudents();
    }
  }, [activeTab]);

  // Handle Class select change
  const handleClassChange = (e) => {
    setSelectedClassId(e.target.value);
  };

  // Enrolled student lookup set by mahs
  const enrolledMahsSet = new Set(enrolledStudents.map(s => (s.mahs || '').toUpperCase()));

  // Filtered all students for Dạng 1
  const filteredAllStudents = allStudents.filter(s => {
    if (filterGrade !== 'all') {
      const sKhoi = s.khoi ? (s.khoi.startsWith('Khối') ? s.khoi : `Khối ${s.khoi}`) : '';
      if (sKhoi !== filterGrade) return false;
    }
    if (filterClass !== 'all' && s.tenlop !== filterClass) {
      return false;
    }
    if (studentSearch.trim()) {
      const query = studentSearch.trim().toLowerCase();
      const matchName = (s.hoten || '').toLowerCase().includes(query);
      const matchId = (s.mahs || '').toLowerCase().includes(query);
      if (!matchName && !matchId) return false;
    }
    return true;
  });

  // Toggle student selection for Dạng 1
  const toggleSelectStudent = (student) => {
    const isEnrolled = enrolledMahsSet.has((student.mahs || '').toUpperCase());
    if (isEnrolled) return; // Already in class

    const key = student.id || student.mahs;
    setSelectedToAdd(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Toggle select all available in filtered list
  const toggleSelectAllFiltered = () => {
    const availableStudents = filteredAllStudents.filter(
      s => !enrolledMahsSet.has((s.mahs || '').toUpperCase())
    );

    const allSelected = availableStudents.every(s => selectedToAdd.has(s.id || s.mahs));

    if (allSelected) {
      // Deselect all
      setSelectedToAdd(prev => {
        const next = new Set(prev);
        availableStudents.forEach(s => next.delete(s.id || s.mahs));
        return next;
      });
    } else {
      // Select all
      setSelectedToAdd(prev => {
        const next = new Set(prev);
        availableStudents.forEach(s => next.add(s.id || s.mahs));
        return next;
      });
    }
  };

  // Submit Dạng 1 (Thêm các học sinh đã chọn)
  const handleAddSelectedStudents = async () => {
    if (!selectedClass) {
      setManualError('Vui lòng chọn lớp ngoại khóa.');
      return;
    }
    if (selectedToAdd.size === 0) {
      setManualError('Vui lòng chọn ít nhất một học sinh.');
      return;
    }

    setAddingManual(true);
    setManualError('');
    setManualSuccess('');

    const studentsToAddList = allStudents.filter(s => selectedToAdd.has(s.id || s.mahs));
    const targetClassName = selectedClass.tenlopngoaikhoa || selectedClass.name;

    const res = await addStudentsToExtraClass(
      selectedClass.id,
      targetClassName,
      studentsToAddList,
      user?.fullName || user?.username || 'Admin'
    );

    setAddingManual(false);

    if (res.success) {
      setManualSuccess(`✓ Đã thêm thành công ${res.count} học sinh vào lớp "${targetClassName}"!`);
      setSelectedToAdd(new Set());
      loadEnrolled(selectedClass.id);
      setTimeout(() => setManualSuccess(''), 4000);
    } else {
      setManualError(res.error || 'Có lỗi xảy ra khi thêm học sinh.');
    }
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Mã học sinh', 'Họ và tên', 'Lớp'],
      ['HS001', 'Nguyễn Văn An', '6/1'],
      ['HS002', 'Trần Thị Bình', '7/2'],
      ['HS003', 'Lê Văn Cường', '8/3']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'HocSinhNgoaiKhoa');
    XLSX.writeFile(wb, 'Mau_Nhap_Hoc_Sinh_Ngoai_Khoa.xlsx');
  };

  // Parse Excel File
  const processExcel = (file) => {
    setExcelError('');
    setExcelSuccess('');
    setExcelPreview([]);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rawData.length <= 1) {
          setExcelError('File Excel không có dữ liệu (chỉ có dòng tiêu đề hoặc rỗng).');
          return;
        }

        const parsed = [];
        const enrolledSet = new Set(enrolledStudents.map(s => (s.mahs || '').toUpperCase()));

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0) continue;

          const mahs = row[0] ? String(row[0]).trim().toUpperCase() : '';
          const hoten = row[1] ? String(row[1]).trim() : '';
          const tenlop = row[2] ? String(row[2]).trim() : '';

          if (!mahs && !hoten) continue;

          const isEnrolled = enrolledSet.has(mahs);
          const isValid = !!(mahs && hoten);

          parsed.push({
            mahs,
            hoten,
            tenlop,
            isValid,
            isEnrolled,
            statusNote: !mahs 
              ? 'Thiếu Mã HS' 
              : !hoten 
              ? 'Thiếu Họ tên' 
              : isEnrolled 
              ? 'Đã có trong lớp' 
              : 'Hợp lệ'
          });
        }

        if (parsed.length === 0) {
          setExcelError('Không tìm thấy dữ liệu học sinh hợp lệ trong file Excel.');
          return;
        }

        setExcelPreview(parsed);
      } catch (err) {
        console.error('Lỗi đọc file Excel:', err);
        setExcelError('Không thể đọc file Excel. Vui lòng kiểm tra lại định dạng file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setExcelFile(file);
      processExcel(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setExcelFile(file);
      processExcel(file);
    }
  };

  // Submit Dạng 2: Lưu danh sách từ Excel
  const handleSaveExcelStudents = async () => {
    if (!selectedClass) {
      setExcelError('Vui lòng chọn lớp ngoại khóa.');
      return;
    }

    const validStudents = excelPreview.filter(p => p.isValid && !p.isEnrolled);
    if (validStudents.length === 0) {
      setExcelError('Không có học sinh mới nào hợp lệ để thêm (các học sinh có thể đã có trong lớp hoặc thông tin không hợp lệ).');
      return;
    }

    setSavingExcel(true);
    setExcelError('');
    setExcelSuccess('');

    const targetClassName = selectedClass.tenlopngoaikhoa || selectedClass.name;

    const res = await addStudentsToExtraClass(
      selectedClass.id,
      targetClassName,
      validStudents,
      user?.fullName || user?.username || 'Admin'
    );

    setSavingExcel(false);

    if (res.success) {
      setExcelSuccess(`✓ Đã thêm thành công ${res.count} học sinh từ Excel vào lớp "${targetClassName}"!`);
      setExcelPreview([]);
      setExcelFile(null);
      loadEnrolled(selectedClass.id);
      setTimeout(() => setExcelSuccess(''), 4000);
    } else {
      setExcelError(res.error || 'Có lỗi xảy ra khi lưu dữ liệu từ Excel.');
    }
  };

  // Xóa 1 học sinh khỏi lớp ngoại khóa
  const handleRemoveSingle = async (student) => {
    if (window.confirm(`Bạn có chắc muốn xóa học sinh "${student.hoten}" khỏi lớp ngoại khóa này?`)) {
      const res = await removeStudentFromExtraClass(student.id);
      if (res.success) {
        loadEnrolled(selectedClassId);
      } else {
        alert(res.error || 'Lỗi khi xóa học sinh.');
      }
    }
  };

  // Xóa nhiều học sinh khỏi lớp ngoại khóa
  const handleRemoveMultiple = async () => {
    if (selectedEnrolledIds.size === 0) return;
    if (window.confirm(`Bạn có chắc muốn xóa ${selectedEnrolledIds.size} học sinh đã chọn khỏi lớp ngoại khóa này?`)) {
      setIsDeleting(true);
      const res = await removeMultipleStudentsFromExtraClass(Array.from(selectedEnrolledIds));
      setIsDeleting(false);
      if (res.success) {
        setSelectedEnrolledIds(new Set());
        loadEnrolled(selectedClassId);
      } else {
        alert(res.error || 'Lỗi khi xóa học sinh.');
      }
    }
  };

  // Chuyển 1 học sinh sang lớp ngoại khóa khác
  const handleOpenTransferSingle = (student) => {
    setStudentsToTransfer([student]);
    setTargetTransferClassId('');
    setTransferError('');
    setIsTransferModalOpen(true);
  };

  // Chuyển nhiều học sinh sang lớp ngoại khóa khác
  const handleOpenTransferMultiple = () => {
    if (selectedEnrolledIds.size === 0) return;
    const toMove = enrolledStudents.filter(s => selectedEnrolledIds.has(s.id));
    setStudentsToTransfer(toMove);
    setTargetTransferClassId('');
    setTransferError('');
    setIsTransferModalOpen(true);
  };

  // Đóng modal chuyển lớp
  const handleCloseTransfer = () => {
    if (transferSaving) return;
    setIsTransferModalOpen(false);
    setStudentsToTransfer([]);
    setTargetTransferClassId('');
    setTransferError('');
  };

  // Xác nhận thực hiện chuyển lớp
  const handleConfirmTransfer = async () => {
    if (!targetTransferClassId) {
      setTransferError('Vui lòng chọn lớp ngoại khóa chuyển đến.');
      return;
    }
    const targetCls = extraClasses.find(c => c.id === targetTransferClassId);
    if (!targetCls) {
      setTransferError('Lớp chuyển đến không hợp lệ.');
      return;
    }
    if (studentsToTransfer.length === 0) {
      setTransferError('Không có học sinh nào được chọn để chuyển.');
      return;
    }

    setTransferSaving(true);
    setTransferError('');
    const targetClassName = targetCls.tenlopngoaikhoa || targetCls.name;
    const res = await transferExtraClassStudents(
      selectedClassId,
      targetTransferClassId,
      targetClassName,
      studentsToTransfer,
      user?.fullName || user?.username || 'Admin'
    );
    setTransferSaving(false);

    if (res.success) {
      setIsTransferModalOpen(false);
      setStudentsToTransfer([]);
      setSelectedEnrolledIds(new Set());
      loadEnrolled(selectedClassId);
      setManualSuccess(`✓ Đã chuyển thành công ${res.count} học sinh sang lớp "${targetClassName}"!`);
      setTimeout(() => setManualSuccess(''), 4000);
    } else {
      setTransferError(res.error || 'Có lỗi xảy ra khi chuyển lớp.');
    }
  };

  // Toggle chọn học sinh trong danh sách đã tham gia
  const toggleSelectEnrolled = (docId) => {
    setSelectedEnrolledIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // Filtered enrolled students list
  const filteredEnrolled = enrolledStudents.filter(s => {
    if (!enrolledSearch.trim()) return true;
    const q = enrolledSearch.trim().toLowerCase();
    return (s.hoten || '').toLowerCase().includes(q) || 
           (s.mahs || '').toLowerCase().includes(q) || 
           (s.tenlop || '').toLowerCase().includes(q);
  });

  // Unique class names for filter
  const classOptions = classesList.map(c => ({ value: c.tenlop, label: c.tenlop }));

  if (!isAdmin) {
    return (
      <>
        <Header title="Nhập thông tin học sinh ngoại khóa" />
        <div className="manage-extra-students-content">
          <div className="p-4 text-center text-danger">
            Bạn không có quyền truy cập vào chức năng này!
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Nhập thông tin học sinh ngoại khóa" />
      <div className="manage-extra-students-content">
        
        {/* Chọn lớp ngoại khóa */}
        <Card className="mb-3">
          <CardBody>
            <div className="flex-row items-center justify-between mb-2">
              <label className="input-label font-bold text-sm m-0 flex-row items-center gap-2" style={{ color: 'var(--text-color)' }}>
                <Sparkles size={18} color="#8b5cf6" />
                Chọn lớp ngoại khóa để nhập học sinh
              </label>
              {selectedClass && (
                <span className="enrolled-badge">
                  Đã có: <strong>{enrolledStudents.length}</strong> học sinh
                </span>
              )}
            </div>

            {loadingClasses ? (
              <div className="py-2 text-muted text-sm">Đang tải danh sách lớp ngoại khóa...</div>
            ) : extraClasses.length === 0 ? (
              <div className="empty-classes-notice p-3 text-center">
                <p className="text-muted text-sm mb-2">Chưa có lớp ngoại khóa nào trong hệ thống.</p>
                <Button 
                  size="sm" 
                  onClick={() => navigate('/extra-classes')}
                  style={{ background: '#8b5cf6', color: '#fff' }}
                >
                  <Plus size={14} style={{ marginRight: '4px' }} />
                  Tạo lớp ngoại khóa trước
                </Button>
              </div>
            ) : (
              <Select
                value={selectedClassId}
                onChange={handleClassChange}
                options={extraClasses.map(c => ({
                  value: c.id,
                  label: `Lớp ngoại khóa: ${c.tenlopngoaikhoa || c.name}`
                }))}
              />
            )}
          </CardBody>
        </Card>

        {selectedClass && (
          <>
            {/* Tabs chọn phương thức nhập: Dạng 1 & Dạng 2 */}
            <div className="tabs-header-container mb-3">
              <button
                type="button"
                className={`mode-tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
                onClick={() => setActiveTab('manual')}
              >
                <Users size={18} />
                <span>Dạng 1: Chọn từ danh sách</span>
              </button>
              <button
                type="button"
                className={`mode-tab-btn ${activeTab === 'excel' ? 'active' : ''}`}
                onClick={() => setActiveTab('excel')}
              >
                <FileSpreadsheet size={18} />
                <span>Dạng 2: Nhập từ file Excel</span>
              </button>
            </div>

            {/* DẠNG 1: CHỌN TỪ DANH SÁCH HỌC SINH */}
            {activeTab === 'manual' && (
              <Card className="mb-4">
                <CardBody>
                  <div className="flex-row items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className="section-title text-base font-bold m-0" style={{ color: 'var(--text-color)' }}>
                      Chọn học sinh thêm vào lớp "{selectedClass.tenlopngoaikhoa || selectedClass.name}"
                    </h3>
                    <div className="selected-counter-chip">
                      Đã chọn: <strong>{selectedToAdd.size}</strong> học sinh
                    </div>
                  </div>

                  {manualError && (
                    <div className="extra-alert error-alert mb-3">
                      <AlertCircle size={16} />
                      <span>{manualError}</span>
                    </div>
                  )}
                  {manualSuccess && (
                    <div className="extra-alert success-alert mb-3">
                      <CheckCircle size={16} />
                      <span>{manualSuccess}</span>
                    </div>
                  )}

                  {/* Thanh lọc học sinh */}
                  <div className="filters-grid mb-3">
                    <Select
                      label="Khối"
                      value={filterGrade}
                      onChange={(e) => setFilterGrade(e.target.value)}
                      options={[
                        { value: 'all', label: 'Tất cả các khối' },
                        { value: 'Khối 6', label: 'Khối 6' },
                        { value: 'Khối 7', label: 'Khối 7' },
                        { value: 'Khối 8', label: 'Khối 8' },
                        { value: 'Khối 9', label: 'Khối 9' },
                      ]}
                    />
                    <Select
                      label="Lớp chính khóa"
                      value={filterClass}
                      onChange={(e) => setFilterClass(e.target.value)}
                      options={[
                        { value: 'all', label: 'Tất cả các lớp' },
                        ...classOptions
                      ]}
                    />
                    <div className="input-group">
                      <label className="input-label">Tìm kiếm học sinh</label>
                      <div className="search-bar-wrapper">
                        <Search size={16} className="search-icon" />
                        <input
                          type="text"
                          className="search-extra-input"
                          placeholder="Tìm theo tên hoặc mã HS..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Nút Chọn tất cả & Thêm vào lớp */}
                  <div className="action-bar-strip mb-3">
                    <button
                      type="button"
                      className="select-all-btn"
                      onClick={toggleSelectAllFiltered}
                      disabled={filteredAllStudents.length === 0}
                    >
                      {filteredAllStudents.filter(s => !enrolledMahsSet.has((s.mahs || '').toUpperCase())).length > 0 &&
                       filteredAllStudents.filter(s => !enrolledMahsSet.has((s.mahs || '').toUpperCase())).every(s => selectedToAdd.has(s.id || s.mahs)) ? (
                        <>
                          <CheckSquare size={16} color="#8b5cf6" />
                          <span>Bỏ chọn tất cả</span>
                        </>
                      ) : (
                        <>
                          <Square size={16} />
                          <span>Chọn tất cả ({filteredAllStudents.filter(s => !enrolledMahsSet.has((s.mahs || '').toUpperCase())).length} HS)</span>
                        </>
                      )}
                    </button>

                    <Button
                      onClick={handleAddSelectedStudents}
                      disabled={addingManual || selectedToAdd.size === 0}
                      className="submit-extra-btn"
                    >
                      <Plus size={16} style={{ marginRight: '6px' }} />
                      {addingManual ? 'Đang thêm...' : `Thêm ${selectedToAdd.size} học sinh vào lớp`}
                    </Button>
                  </div>

                  {/* Danh sách học sinh để check */}
                  {loadingStudents ? (
                    <div className="py-4 text-center text-muted">Đang tải danh sách học sinh...</div>
                  ) : filteredAllStudents.length === 0 ? (
                    <div className="py-4 text-center text-muted text-sm">
                      Không tìm thấy học sinh nào theo bộ lọc hiện tại.
                    </div>
                  ) : (
                    <div className="students-selection-table-wrapper">
                      <table className="modern-table">
                        <thead>
                          <tr>
                            <th style={{ width: '44px', textAlign: 'center' }}>Chọn</th>
                            <th style={{ width: '110px' }}>Mã HS</th>
                            <th>Họ và tên</th>
                            <th style={{ width: '90px' }}>Lớp</th>
                            <th style={{ width: '130px', textAlign: 'center' }}>Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAllStudents.map((st) => {
                            const isEnrolled = enrolledMahsSet.has((st.mahs || '').toUpperCase());
                            const isChecked = selectedToAdd.has(st.id || st.mahs);
                            return (
                              <tr 
                                key={st.id || st.mahs}
                                className={`student-row ${isEnrolled ? 'enrolled-row' : ''} ${isChecked ? 'selected-row' : ''}`}
                                onClick={() => toggleSelectStudent(st)}
                              >
                                <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isEnrolled || isChecked}
                                    disabled={isEnrolled}
                                    onChange={() => toggleSelectStudent(st)}
                                    className="custom-checkbox"
                                  />
                                </td>
                                <td className="font-semibold">{st.mahs}</td>
                                <td>{st.hoten}</td>
                                <td>
                                  <span className="class-badge-mini">{st.tenlop}</span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {isEnrolled ? (
                                    <span className="badge-already-enrolled">Đã trong lớp</span>
                                  ) : isChecked ? (
                                    <span className="badge-selected">Đã chọn</span>
                                  ) : (
                                    <span className="badge-available">Chưa tham gia</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {/* DẠNG 2: NHẬP TỪ FILE EXCEL */}
            {activeTab === 'excel' && (
              <Card className="mb-4">
                <CardBody>
                  <h3 className="section-title text-base font-bold mb-2" style={{ color: 'var(--text-color)' }}>
                    Nhập học sinh từ file Excel vào lớp "{selectedClass.tenlopngoaikhoa || selectedClass.name}"
                  </h3>
                  <p className="text-muted text-sm mb-4">
                    Hệ thống chỉ yêu cầu 3 cột thông tin cơ bản: <strong>Mã học sinh</strong>, <strong>Họ tên học sinh</strong>, và <strong>Lớp</strong>.
                  </p>

                  {/* Bước 1: Tải file mẫu */}
                  <div className="excel-step-card mb-3">
                    <div className="step-badge">1</div>
                    <div className="step-content">
                      <h4 className="step-title">Tải file mẫu Excel (.xlsx)</h4>
                      <p className="step-desc">
                        Sử dụng file mẫu có sẵn 3 cột chuẩn để nhập liệu nhanh và chính xác nhất.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTemplate}
                      className="download-template-btn"
                    >
                      <Download size={16} style={{ marginRight: '6px' }} />
                      Tải file mẫu Excel
                    </Button>
                  </div>

                  {/* Bước 2: Tải lên file Excel */}
                  <div className="excel-step-card mb-3" style={{ display: 'block' }}>
                    <div className="flex-row items-center gap-2 mb-2">
                      <div className="step-badge">2</div>
                      <h4 className="step-title m-0">Kéo thả hoặc chọn file Excel của bạn</h4>
                    </div>

                    <div
                      className={`excel-dropzone ${dragActive ? 'active' : ''}`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".xlsx, .xls"
                        style={{ display: 'none' }}
                      />
                      <FileUp size={36} color="#8b5cf6" className="dropzone-icon mb-2" />
                      <h4 className="dropzone-title">Nhấn để chọn file hoặc kéo thả vào đây</h4>
                      <p className="dropzone-hint text-xs text-muted">Hỗ trợ các định dạng .xlsx, .xls</p>
                      {excelFile && (
                        <div className="selected-filename-chip mt-2">
                          <FileSpreadsheet size={14} />
                          <span>{excelFile.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {excelError && (
                    <div className="extra-alert error-alert mb-3">
                      <AlertCircle size={16} />
                      <span>{excelError}</span>
                    </div>
                  )}
                  {excelSuccess && (
                    <div className="extra-alert success-alert mb-3">
                      <CheckCircle size={16} />
                      <span>{excelSuccess}</span>
                    </div>
                  )}

                  {/* Bước 3: Xem trước dữ liệu và xác nhận */}
                  {excelPreview.length > 0 && (
                    <div className="excel-preview-container mt-4">
                      <div className="flex-row items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="flex-row items-center gap-2">
                          <h4 className="font-bold text-sm m-0">Xem trước dữ liệu Excel:</h4>
                          <span className="count-badge">Tổng: {excelPreview.length} HS</span>
                          <span className="badge-selected">
                            Hợp lệ: {excelPreview.filter(p => p.isValid && !p.isEnrolled).length} HS
                          </span>
                        </div>

                        <Button
                          onClick={handleSaveExcelStudents}
                          disabled={savingExcel || excelPreview.filter(p => p.isValid && !p.isEnrolled).length === 0}
                          className="submit-extra-btn"
                        >
                          <Plus size={16} style={{ marginRight: '6px' }} />
                          {savingExcel ? 'Đang lưu...' : `Xác nhận thêm ${excelPreview.filter(p => p.isValid && !p.isEnrolled).length} HS vào lớp`}
                        </Button>
                      </div>

                      <div className="students-selection-table-wrapper" style={{ maxHeight: '320px' }}>
                        <table className="modern-table">
                          <thead>
                            <tr>
                              <th style={{ width: '50px' }}>STT</th>
                              <th style={{ width: '130px' }}>Mã học sinh</th>
                              <th>Họ và tên</th>
                              <th style={{ width: '100px' }}>Lớp</th>
                              <th style={{ width: '140px', textAlign: 'center' }}>Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody>
                            {excelPreview.map((item, idx) => (
                              <tr key={idx} className={item.isEnrolled ? 'enrolled-row' : !item.isValid ? 'error-row' : ''}>
                                <td>{idx + 1}</td>
                                <td className="font-semibold">{item.mahs || '---'}</td>
                                <td>{item.hoten || '---'}</td>
                                <td>
                                  {item.tenlop ? <span className="class-badge-mini">{item.tenlop}</span> : '---'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {item.isEnrolled ? (
                                    <span className="badge-already-enrolled">Đã có trong lớp</span>
                                  ) : item.isValid ? (
                                    <span className="badge-selected">Sẵn sàng thêm</span>
                                  ) : (
                                    <span className="badge-error">{item.statusNote}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {/* DANH SÁCH HỌC SINH HIỆN TẠI CỦA LỚP NGOẠI KHÓA */}
            <Card>
              <CardBody>
                <div className="flex-row items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex-row items-center gap-2">
                    <h3 className="section-title text-base font-bold m-0" style={{ color: 'var(--text-color)' }}>
                      Danh sách học sinh lớp "{selectedClass.tenlopngoaikhoa || selectedClass.name}"
                    </h3>
                    <span className="count-badge">{enrolledStudents.length} học sinh</span>
                  </div>

                  {selectedEnrolledIds.size > 0 && (
                    <div className="flex-row items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleOpenTransferMultiple}
                        className="transfer-batch-btn"
                        style={{ background: '#8b5cf6', color: '#fff' }}
                      >
                        <ArrowRightLeft size={14} style={{ marginRight: '4px' }} />
                        Chuyển {selectedEnrolledIds.size} HS sang lớp khác
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleRemoveMultiple}
                        disabled={isDeleting}
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}
                      >
                        <Trash2 size={14} style={{ marginRight: '4px' }} />
                        Xóa {selectedEnrolledIds.size} HS đã chọn
                      </Button>
                    </div>
                  )}
                </div>

                {enrolledStudents.length > 5 && (
                  <div className="search-bar-wrapper mb-3">
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      className="search-extra-input"
                      placeholder="Tìm kiếm trong danh sách lớp..."
                      value={enrolledSearch}
                      onChange={(e) => setEnrolledSearch(e.target.value)}
                    />
                  </div>
                )}

                {loadingEnrolled ? (
                  <div className="py-4 text-center text-muted">Đang tải danh sách học sinh...</div>
                ) : filteredEnrolled.length === 0 ? (
                  <div className="py-4 text-center text-muted text-sm">
                    {enrolledSearch ? 'Không tìm thấy học sinh phù hợp' : 'Lớp ngoại khóa này chưa có học sinh nào. Hãy sử dụng Dạng 1 hoặc Dạng 2 ở trên để thêm học sinh.'}
                  </div>
                ) : (
                  <div className="students-selection-table-wrapper">
                    <table className="modern-table">
                      <thead>
                        <tr>
                          <th style={{ width: '44px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedEnrolledIds.size === filteredEnrolled.length && filteredEnrolled.length > 0}
                              onChange={() => {
                                if (selectedEnrolledIds.size === filteredEnrolled.length) {
                                  setSelectedEnrolledIds(new Set());
                                } else {
                                  setSelectedEnrolledIds(new Set(filteredEnrolled.map(s => s.id)));
                                }
                              }}
                              className="custom-checkbox"
                            />
                          </th>
                          <th style={{ width: '50px' }}>STT</th>
                          <th style={{ width: '120px' }}>Mã HS</th>
                          <th>Họ và tên</th>
                          <th style={{ width: '100px' }}>Lớp</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEnrolled.map((st, idx) => (
                          <tr key={st.id} className={selectedEnrolledIds.has(st.id) ? 'selected-row' : ''}>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedEnrolledIds.has(st.id)}
                                onChange={() => toggleSelectEnrolled(st.id)}
                                className="custom-checkbox"
                              />
                            </td>
                            <td>{idx + 1}</td>
                            <td className="font-semibold">{st.mahs}</td>
                            <td>{st.hoten}</td>
                            <td>
                              <span className="class-badge-mini">{st.tenlop}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div className="table-actions-cell">
                                <button
                                  type="button"
                                  className="transfer-row-btn"
                                  onClick={() => handleOpenTransferSingle(st)}
                                  title="Chuyển sang lớp ngoại khóa khác"
                                >
                                  <ArrowRightLeft size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="delete-row-btn"
                                  onClick={() => handleRemoveSingle(st)}
                                  title="Xóa khỏi lớp ngoại khóa"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {/* Modal Chuyển Lớp Ngoại Khóa */}
      {isTransferModalOpen && (
        <div className="modal-overlay" onClick={handleCloseTransfer}>
          <div className="modal-content transfer-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div className="flex-row items-center gap-2">
                <div className="transfer-icon-badge">
                  <ArrowRightLeft size={18} color="#8b5cf6" />
                </div>
                <div>
                  <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-color)' }}>
                    Chuyển lớp ngoại khóa
                  </h3>
                  <p className="text-xs text-muted m-0">
                    Đang chọn {studentsToTransfer.length} học sinh để chuyển
                  </p>
                </div>
              </div>
              <button type="button" className="close-modal-btn" onClick={handleCloseTransfer} disabled={transferSaving}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body py-4">
              {transferError && (
                <div className="extra-alert error-alert mb-3">
                  <AlertCircle size={16} />
                  <span>{transferError}</span>
                </div>
              )}

              {/* Lộ trình chuyển: Lớp hiện tại -> Lớp mới */}
              <div className="transfer-route-box mb-3">
                <div className="route-class-node">
                  <span className="route-node-label">Lớp hiện tại</span>
                  <strong className="route-node-value">{selectedClass?.tenlopngoaikhoa || selectedClass?.name}</strong>
                </div>
                <div className="route-arrow-icon">
                  <ArrowRight size={20} color="#8b5cf6" />
                </div>
                <div className="route-class-node">
                  <span className="route-node-label">Lớp chuyển đến</span>
                  <strong className="route-node-value" style={{ color: '#8b5cf6' }}>
                    {targetTransferClassId 
                      ? (extraClasses.find(c => c.id === targetTransferClassId)?.tenlopngoaikhoa || extraClasses.find(c => c.id === targetTransferClassId)?.name)
                      : 'Chưa chọn'}
                  </strong>
                </div>
              </div>

              {/* Dropdown chọn lớp chuyển đến */}
              <div className="input-group mb-3 full-width">
                <label className="input-label required-label font-semibold">Chọn lớp ngoại khóa chuyển đến</label>
                {extraClasses.filter(c => c.id !== selectedClassId).length === 0 ? (
                  <div className="text-sm text-danger p-2 bg-light rounded">
                    Chưa có lớp ngoại khóa khác trong hệ thống để chuyển đến. Hãy tạo thêm lớp ngoại khóa mới trước.
                  </div>
                ) : (
                  <Select
                    value={targetTransferClassId}
                    onChange={(e) => setTargetTransferClassId(e.target.value)}
                    options={[
                      { value: '', label: '-- Chọn lớp ngoại khóa chuyển đến --' },
                      ...extraClasses
                        .filter(c => c.id !== selectedClassId)
                        .map(c => ({
                          value: c.id,
                          label: c.tenlopngoaikhoa || c.name
                        }))
                    ]}
                  />
                )}
              </div>

              {/* Danh sách học sinh chuyển */}
              <div className="transfer-students-preview">
                <label className="input-label font-semibold mb-2" style={{ display: 'block' }}>
                  Danh sách học sinh sẽ chuyển ({studentsToTransfer.length}):
                </label>
                <div className="transfer-chips-scroll">
                  {studentsToTransfer.map((st) => (
                    <div key={st.id || st.mahs} className="transfer-student-chip">
                      <span className="chip-mahs">{st.mahs}</span>
                      <span className="chip-name">{st.hoten}</span>
                      {st.tenlop && <span className="chip-lop">({st.tenlop})</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer flex-row justify-end gap-2 pt-3 border-t">
              <Button variant="secondary" onClick={handleCloseTransfer} disabled={transferSaving}>
                Hủy
              </Button>
              <Button
                onClick={handleConfirmTransfer}
                disabled={transferSaving || !targetTransferClassId || studentsToTransfer.length === 0}
                style={{ background: '#8b5cf6', color: '#fff' }}
              >
                <ArrowRightLeft size={16} style={{ marginRight: '6px' }} />
                {transferSaving ? 'Đang chuyển...' : `Xác nhận chuyển ${studentsToTransfer.length} học sinh`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
