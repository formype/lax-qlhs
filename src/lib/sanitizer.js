/**
 * Frontend Input Sanitization & Validation Library
 * Prevents XSS, buffer overflows, and invalid data formats before database writes.
 */

const VALID_ROLES = ['admin', 'vip-admin', 'bgh', 'giamthi', 'tongphutrach', 'giaovien', 'canbo'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Sanitize general text: remove HTML tags, script vectors, dangerous attributes
 * @param {any} input - Text to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Cleaned text
 */
export function sanitizeText(input, maxLength = 255) {
  if (input === null || input === undefined) return '';
  let str = String(input);

  // Strip script and style blocks entirely
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  str = str.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Strip all HTML tags
  str = str.replace(/<[^>]+>/g, '');

  // Strip dangerous javascript: and data: text
  str = str.replace(/javascript:/gi, '');
  str = str.replace(/on\w+\s*=/gi, '');

  // Strip control characters except newline and tab
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim whitespace
  str = str.trim();

  // Truncate to maximum length
  if (maxLength && str.length > maxLength) {
    str = str.substring(0, maxLength);
  }

  return str;
}

/**
 * Sanitize username: only letters, numbers, underscores, hyphens and dots
 */
export function sanitizeUsername(username) {
  if (!username) return '';
  const clean = String(username).trim().toLowerCase();
  return clean.replace(/[^a-z0-9_.-]/g, '').substring(0, 50);
}

/**
 * Validate and format date string (YYYY-MM-DD)
 */
export function sanitizeDate(dateStr) {
  if (!dateStr) return '';
  const clean = String(dateStr).trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(clean)) return '';
  
  const parsed = new Date(clean);
  if (isNaN(parsed.getTime())) return '';
  return clean;
}

/**
 * Validate safe integer / float number within bounds
 */
export function sanitizeNumber(val, defaultValue = 0, min = 0, max = 100000) {
  const num = Number(val);
  if (isNaN(num)) return defaultValue;
  return Math.min(Math.max(num, min), max);
}

/**
 * Validate base64 image string and check file size
 * @param {string} base64Str - Base64 image data URL
 * @param {number} maxBytes - Max allowed bytes (default 5MB)
 * @returns {{ isValid: boolean, error?: string, sizeBytes?: number }}
 */
export function validateImageBase64(base64Str, maxBytes = MAX_IMAGE_SIZE_BYTES) {
  if (!base64Str) return { isValid: true };
  if (typeof base64Str !== 'string') {
    return { isValid: false, error: 'Dữ liệu ảnh không đúng định dạng.' };
  }

  // Check if valid data URL or URL
  if (base64Str.startsWith('http://') || base64Str.startsWith('https://')) {
    return { isValid: true };
  }

  if (!base64Str.startsWith('data:image/')) {
    return { isValid: false, error: 'File tải lên không phải là ảnh hợp lệ (chỉ chấp nhận JPEG, PNG, WEBP, GIF).' };
  }

  // Calculate approximate byte size of base64
  const head = base64Str.indexOf(',');
  if (head === -1) {
    return { isValid: false, error: 'Dữ liệu ảnh bị lỗi cấu trúc base64.' };
  }

  const rawBase64 = base64Str.substring(head + 1);
  const sizeBytes = Math.ceil((rawBase64.length * 3) / 4);

  if (sizeBytes > maxBytes) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    const maxMB = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      isValid: false,
      error: `Ảnh vượt quá dung lượng cho phép (${sizeMB}MB / tối đa ${maxMB}MB). Vui lòng nén hoặc chọn ảnh nhỏ hơn.`,
      sizeBytes
    };
  }

  return { isValid: true, sizeBytes };
}

/**
 * Validate and sanitize violation record before saving
 */
export function validateViolationPayload(data) {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'Dữ liệu vi phạm không hợp lệ.' };
  }

  const studentName = sanitizeText(data.studentName, 100);
  const className = sanitizeText(data.className, 50);
  const violationType = sanitizeText(data.violationType || data.violation, 200);
  const description = sanitizeText(data.description || data.customViolation, 500);
  const date = sanitizeDate(data.date) || new Date().toISOString().split('T')[0];
  const points = sanitizeNumber(data.points || data.point, 0, 0, 100);
  const reporter = sanitizeText(data.reporter || data.reportedBy, 100);
  const session = (data.session === 'Chiều' || data.session === 'afternoon') ? 'Chiều' : 'Sáng';

  if (!studentName) {
    return { isValid: false, error: 'Tên học sinh không được để trống.' };
  }
  if (!className) {
    return { isValid: false, error: 'Lớp không được để trống.' };
  }
  if (!violationType && !description) {
    return { isValid: false, error: 'Nội dung hoặc loại vi phạm không được để trống.' };
  }

  // Validate image if attached
  if (data.imageUrl) {
    const imageCheck = validateImageBase64(data.imageUrl);
    if (!imageCheck.isValid) {
      return { isValid: false, error: imageCheck.error };
    }
  }

  return {
    isValid: true,
    sanitized: {
      studentName,
      className,
      violationType: violationType || description,
      description,
      date,
      points,
      reporter: reporter || 'Giám thị',
      session,
      imageUrl: data.imageUrl || null,
      createdAt: data.createdAt || Date.now()
    }
  };
}

/**
 * Validate and sanitize account record
 */
export function validateUserAccountPayload(data, isNew = false) {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'Dữ liệu tài khoản không hợp lệ.' };
  }

  const sanitized = {};

  if (isNew) {
    const username = sanitizeUsername(data.username);
    const fullName = sanitizeText(data.fullName, 100);
    if (!username || username.length < 3) {
      return { isValid: false, error: 'Tên đăng nhập phải có từ 3-50 ký tự (chữ, số, dấu chấm, gạch dưới).' };
    }
    if (!fullName) {
      return { isValid: false, error: 'Họ tên không được để trống.' };
    }
    sanitized.username = username;
    sanitized.fullName = fullName;

    // Process roles
    if (Array.isArray(data.role)) {
      const filtered = data.role.map(r => String(r).trim().toLowerCase()).filter(r => VALID_ROLES.includes(r));
      sanitized.role = filtered.length > 0 ? filtered : ['giaovien'];
    } else if (typeof data.role === 'string') {
      const r = data.role.trim().toLowerCase();
      sanitized.role = VALID_ROLES.includes(r) ? [r] : ['giaovien'];
    } else {
      sanitized.role = ['giaovien'];
    }

    if (data.password) {
      const pwd = String(data.password).trim();
      if (pwd.length < 3) {
        return { isValid: false, error: 'Mật khẩu phải có ít nhất 3 ký tự.' };
      }
      sanitized.password = pwd.substring(0, 100);
    } else {
      sanitized.password = '123';
    }
  } else {
    // Partial updates (reset password, edit account, edit profile)
    if (data.username !== undefined) {
      const username = sanitizeUsername(data.username);
      if (username && username.length < 3) {
        return { isValid: false, error: 'Tên đăng nhập phải có từ 3-50 ký tự.' };
      }
      if (username) sanitized.username = username;
    }

    if (data.fullName !== undefined) {
      const fullName = sanitizeText(data.fullName, 100);
      if (!fullName) {
        return { isValid: false, error: 'Họ tên không được để trống.' };
      }
      sanitized.fullName = fullName;
    }

    if (data.role !== undefined) {
      if (Array.isArray(data.role)) {
        const filtered = data.role.map(r => String(r).trim().toLowerCase()).filter(r => VALID_ROLES.includes(r));
        sanitized.role = filtered.length > 0 ? filtered : ['giaovien'];
      } else if (typeof data.role === 'string') {
        const r = data.role.trim().toLowerCase();
        if (VALID_ROLES.includes(r)) {
          sanitized.role = [r];
        }
      }
    }

    if (data.password !== undefined) {
      const pwd = String(data.password).trim();
      if (pwd && pwd.length < 3) {
        return { isValid: false, error: 'Mật khẩu phải có ít nhất 3 ký tự.' };
      }
      if (pwd) {
        sanitized.password = pwd.substring(0, 100);
      }
    }

    if (data.blockedPages !== undefined && Array.isArray(data.blockedPages)) {
      sanitized.blockedPages = data.blockedPages;
    }
  }

  if (data.homeroomClass !== undefined) {
    sanitized.homeroomClass = sanitizeText(data.homeroomClass, 50);
  }

  sanitized.credentialsUpdatedAt = data.credentialsUpdatedAt || Date.now();

  return {
    isValid: true,
    sanitized
  };
}
