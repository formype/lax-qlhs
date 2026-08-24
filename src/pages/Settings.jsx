import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LogOut, User as UserIcon, Database, Moon, Users, BookOpen, Calendar, Save, RefreshCw, DownloadCloud, UploadCloud, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchSystemSettings, updateSystemSettings, exportDatabase, importDatabase, deleteAllData } from '../lib/firebase';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './Settings.css';

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [academicSettings, setAcademicSettings] = React.useState({
    semester1StartDate: '2026-09-07',
    semester2StartDate: '2027-01-18',
    semester1Weeks: 18,
    semester2Weeks: 17
  });
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const [showRestoreModal, setShowRestoreModal] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [backupData, setBackupData] = React.useState(null);
  const [backupSummary, setBackupSummary] = React.useState(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const fileInputRef = React.useRef(null);

  const handleBackup = async () => {
    try {
      setIsProcessing(true);
      const data = await exportDatabase();
      const zip = new JSZip();
      zip.file('qlhs_backup.json', JSON.stringify(data));
      const content = await zip.generateAsync({ type: 'blob' });
      const dateStr = new Date().toISOString().split('T')[0];
      saveAs(content, `QLHS_Backup_${dateStr}.zip`);
      alert("Sao lưu dữ liệu thành công!");
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi khi sao lưu dữ liệu.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      setIsProcessing(true);
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      const jsonFile = loadedZip.file('qlhs_backup.json');
      if (!jsonFile) {
        alert("File sao lưu không hợp lệ.");
        return;
      }
      const jsonStr = await jsonFile.async('string');
      const data = JSON.parse(jsonStr);
      
      setBackupData(data);
      setBackupSummary({
        students: data.students?.length || 0,
        classes: data.classes?.length || 0,
        violations: data.violations?.length || 0,
        attendance: data.attendance?.length || 0
      });
      setShowRestoreModal(true);
    } catch (err) {
      console.error(err);
      alert("Không thể đọc file sao lưu.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmRestore = async () => {
    if (!backupData) return;
    try {
      setIsProcessing(true);
      await importDatabase(backupData);
      alert("Khôi phục dữ liệu thành công! Ứng dụng sẽ tải lại.");
      setShowRestoreModal(false);
      setBackupData(null);
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi khi khôi phục dữ liệu.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    try {
      setIsProcessing(true);
      await deleteAllData();
      alert("Đã xóa toàn bộ dữ liệu thành công! Ứng dụng sẽ tải lại.");
      setShowDeleteModal(false);
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi khi xóa dữ liệu.");
    } finally {
      setIsProcessing(false);
    }
  };

  React.useEffect(() => {
    fetchSystemSettings().then(data => setAcademicSettings(data));
    const currentMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(currentMode);
    if (currentMode) {
      document.body.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    if (newMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSaveAcademicSettings = async () => {
    setSavingSettings(true);
    const result = await updateSystemSettings(academicSettings);
    setSavingSettings(false);
    if (result.success) {
      alert("Đã lưu cấu hình năm học thành công!");
    } else {
      alert("Có lỗi xảy ra khi lưu cấu hình.");
    }
  };

  return (
    <>
      <Header title="Cài đặt" />
      <div className="settings-content">
        <Card className="profile-card">
          <CardBody className="flex-row gap-4">
            <div className="avatar-circle">
              <UserIcon size={32} color="var(--primary-color)" />
            </div>
            <div>
              <h3 className="profile-name">{user ? user.fullName : 'Chưa đăng nhập'}</h3>
              <p className="text-muted">Vai trò: {user ? (Array.isArray(user.role) ? user.role.map(r => r === 'vip-admin' ? 'VIP Admin' : r === 'admin' ? 'Quản trị viên' : r === 'giamthi' ? 'Giám thị' : 'Giáo viên').join(', ') : 'Khách') : 'Khách'}</p>
            </div>
          </CardBody>
        </Card>

        {/* Removed Quản lý Dữ liệu as requested */}

        {user && (user.role?.includes('admin') || user.role?.includes('vip-admin')) && (
          <>
            <h4 className="settings-group-title mt-4">Quản lý</h4>
            <div className="settings-list">
              <Card className="settings-item" onClick={() => navigate('/manage-accounts')} style={{ cursor: 'pointer' }}>
                <CardBody className="flex-between">
                  <div className="flex-row gap-3">
                    <Users size={20} className="text-primary" />
                    <span>Quản lý tài khoản</span>
                  </div>
                </CardBody>
              </Card>
              {user.role?.includes('vip-admin') && (
                <Card className="settings-item mt-2" onClick={() => navigate('/manage-updates')} style={{ cursor: 'pointer' }}>
                  <CardBody className="flex-between">
                    <div className="flex-row gap-3">
                      <RefreshCw size={20} className="text-primary" />
                      <span>Quản lý cập nhật</span>
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          </>
        )}

        <h4 className="settings-group-title mt-4">Tài khoản</h4>
        <div className="settings-list">
          <Card className="settings-item" onClick={() => navigate('/account-settings')} style={{ cursor: 'pointer' }}>
            <CardBody className="flex-between">
              <div className="flex-row gap-3">
                <UserIcon size={20} className="text-primary" />
                <span>Cài đặt tài khoản</span>
              </div>
            </CardBody>
          </Card>
        </div>

        {user && (user.role?.includes('admin') || user.role?.includes('vip-admin')) && (
          <>
            <h4 className="settings-group-title mt-4">Cấu hình Năm học</h4>
            <Card className="mb-3">
              <CardBody>
                <div className="flex-col gap-3">
                  <div className="flex-row gap-3">
                    <div className="input-group flex-1">
                      <label className="input-label">Ngày bắt đầu Tuần 1 (HK1)</label>
                      <input 
                        type="date" 
                        className="input-field" 
                        value={academicSettings.semester1StartDate}
                        onChange={(e) => setAcademicSettings({...academicSettings, semester1StartDate: e.target.value})}
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label className="input-label">Ngày bắt đầu Tuần 1 (HK2)</label>
                      <input 
                        type="date" 
                        className="input-field" 
                        value={academicSettings.semester2StartDate}
                        onChange={(e) => setAcademicSettings({...academicSettings, semester2StartDate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="flex-row gap-3">
                    <div className="input-group flex-1">
                      <label className="input-label">Số tuần Học kỳ 1</label>
                      <input 
                        type="number" 
                        className="input-field" 
                        value={academicSettings.semester1Weeks}
                        onChange={(e) => setAcademicSettings({...academicSettings, semester1Weeks: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label className="input-label">Số tuần Học kỳ 2</label>
                      <input 
                        type="number" 
                        className="input-field" 
                        value={academicSettings.semester2Weeks}
                        onChange={(e) => setAcademicSettings({...academicSettings, semester2Weeks: parseInt(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                  <Button onClick={handleSaveAcademicSettings} disabled={savingSettings} size="sm" className="mt-2" fullWidth>
                    <Save size={16} /> {savingSettings ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </Button>
                </div>
              </CardBody>
            </Card>
          </>
        )}

        <h4 className="settings-group-title mt-4">Tuỳ chọn hệ thống</h4>
        
        <div className="settings-list">
          <Card className="settings-item">
            <CardBody className="flex-between">
              <div className="flex-row gap-3">
                <Database size={20} className="text-muted" />
                <span>Trạng thái máy chủ</span>
              </div>
              <span className="text-success text-sm">Đã kết nối</span>
            </CardBody>
          </Card>
          
          <Card className="settings-item" onClick={toggleDarkMode} style={{ cursor: 'pointer' }}>
            <CardBody className="flex-between">
              <div className="flex-row gap-3">
                <Moon size={20} className="text-muted" />
                <span>Chế độ tối (Dark mode)</span>
              </div>
              <div className={`toggle-switch ${isDarkMode ? 'active' : ''}`} style={{ 
                width: '44px', height: '24px', background: isDarkMode ? 'var(--success)' : 'var(--border-color)', 
                borderRadius: '12px', position: 'relative', transition: 'background 0.3s'
              }}>
                <div className="toggle-knob" style={{ 
                  width: '20px', height: '20px', background: 'white', borderRadius: '50%', 
                  position: 'absolute', top: '2px', left: isDarkMode ? '22px' : '2px', transition: 'left 0.3s' 
                }}></div>
              </div>
            </CardBody>
          </Card>

          {user && (user.role?.includes('admin') || user.role?.includes('vip-admin')) && (
            <>
              <Card className="settings-item" onClick={isProcessing ? undefined : handleBackup} style={{ cursor: isProcessing ? 'wait' : 'pointer' }}>
                <CardBody className="flex-between">
                  <div className="flex-row gap-3">
                    <DownloadCloud size={20} className="text-primary" />
                    <span>Sao lưu toàn bộ dữ liệu</span>
                  </div>
                  <span className="text-xs text-muted">{isProcessing ? 'Đang xử lý...' : 'Tải file .zip'}</span>
                </CardBody>
              </Card>

              {user.role?.includes('vip-admin') && (
                <>
                  <input 
                    type="file" 
                    accept=".zip" 
                    style={{ display: 'none' }} 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                  />
                  <Card className="settings-item" onClick={() => !isProcessing && fileInputRef.current?.click()} style={{ cursor: isProcessing ? 'wait' : 'pointer' }}>
                    <CardBody className="flex-between">
                      <div className="flex-row gap-3">
                        <UploadCloud size={20} className="text-warning" />
                        <span>Khôi phục toàn bộ dữ liệu</span>
                      </div>
                      <span className="text-xs text-muted">{isProcessing ? 'Đang xử lý...' : 'Từ file .zip'}</span>
                    </CardBody>
                  </Card>

                  <Card className="settings-item" onClick={() => !isProcessing && setShowDeleteModal(true)} style={{ cursor: isProcessing ? 'wait' : 'pointer' }}>
                    <CardBody className="flex-between">
                      <div className="flex-row gap-3">
                        <Trash2 size={20} className="text-danger" />
                        <span className="text-danger" style={{ fontWeight: 600 }}>Xóa toàn bộ dữ liệu</span>
                      </div>
                    </CardBody>
                  </Card>
                </>
              )}
            </>
          )}
        </div>

        <Button variant="danger" fullWidth className="mt-4" style={{ marginTop: '32px' }} onClick={handleLogout}>
          <LogOut size={18} />
          Đăng xuất
        </Button>
      </div>

      {showRestoreModal && (
        <div className="modal-overlay" onClick={() => !isProcessing && setShowRestoreModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Xác nhận khôi phục</h3>
            </div>
            <div className="modal-body">
              <div style={{ padding: '12px', background: 'rgba(255, 193, 7, 0.1)', color: '#d97706', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '16px' }}>
                <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.9rem' }}><strong>CẢNH BÁO:</strong> Hành động này sẽ xóa toàn bộ dữ liệu Lớp, Học sinh, Vi phạm, Chuyên cần và Ghi nhận trong ngày hiện có và thay thế bằng dữ liệu từ bản sao lưu.</span>
              </div>
              <p>Bản sao lưu chứa:</p>
              <ul style={{ margin: '10px 0 20px 20px' }}>
                <li><strong>{backupSummary?.classes}</strong> lớp học</li>
                <li><strong>{backupSummary?.students}</strong> học sinh</li>
                <li><strong>{backupSummary?.violations}</strong> vi phạm</li>
                <li><strong>{backupSummary?.attendance}</strong> lượt điểm danh</li>
              </ul>
              <p>Bạn có chắc chắn muốn tiến hành?</p>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowRestoreModal(false)} disabled={isProcessing}>Hủy</Button>
              <Button variant="warning" onClick={handleConfirmRestore} disabled={isProcessing}>
                {isProcessing ? 'Đang xử lý...' : 'Khôi phục'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !isProcessing && setShowDeleteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--danger)' }}>Xác nhận xóa dữ liệu</h3>
            </div>
            <div className="modal-body">
              <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '16px' }}>
                <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.9rem' }}><strong>CẢNH BÁO NGUY HIỂM:</strong> Hành động này sẽ <strong>XÓA SẠCH</strong> toàn bộ dữ liệu về Lớp học, Học sinh, Vi phạm, Chuyên cần và Ghi nhận trong ngày trên hệ thống.</span>
              </div>
              <p>Dữ liệu đã xóa sẽ <strong>KHÔNG THỂ KHÔI PHỤC</strong> nếu bạn chưa sao lưu.</p>
              <p>Bạn có thực sự muốn xóa?</p>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={isProcessing}>Hủy</Button>
              <Button variant="danger" onClick={handleConfirmDeleteAll} disabled={isProcessing}>
                {isProcessing ? 'Đang xử lý...' : 'Xóa toàn bộ'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
