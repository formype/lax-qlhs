/**
 * Request Validation & Payload Size Limiter for Serverless API Endpoints
 */

/**
 * Validate and enforce payload size limits on incoming requests
 * @param {object} req - Request
 * @param {object} res - Response
 * @param {number} maxBytes - Max allowed payload in bytes (default: 250KB)
 * @returns {boolean} - true if valid, false if rejected (413 Payload Too Large)
 */
export function validatePayloadSize(req, res, maxBytes = 250 * 1024) {
  // Check Content-Length header
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > maxBytes) {
    res.status(413).json({
      success: false,
      error: `Dung lượng payload vượt quá giới hạn cho phép (Tối đa ${Math.round(maxBytes / 1024)}KB).`,
      maxBytes
    });
    return false;
  }

  // Check parsed body byte length if available
  if (req.body) {
    try {
      const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const byteLength = Buffer.byteLength(bodyStr, 'utf8');
      if (byteLength > maxBytes) {
        res.status(413).json({
          success: false,
          error: `Dung lượng dữ liệu gửi lên quá lớn (Tối đa ${Math.round(maxBytes / 1024)}KB).`,
          maxBytes
        });
        return false;
      }
    } catch (e) {
      // Ignore stringify error
    }
  }

  return true;
}

/**
 * Validate that the request has a valid JSON body object
 * @param {object} req - Request
 * @param {object} res - Response
 * @returns {boolean} - true if valid, false if rejected
 */
export function validateJsonBody(req, res) {
  const contentType = req.headers['content-type'] || '';
  
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (contentType && !contentType.toLowerCase().includes('application/json')) {
      res.status(415).json({
        success: false,
        error: 'Định dạng dữ liệu không được hỗ trợ. Vui lòng sử dụng Content-Type: application/json.'
      });
      return false;
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({
        success: false,
        error: 'Dữ liệu gửi lên sai định dạng hoặc rỗng. Yêu cầu JSON Object hợp lệ.'
      });
      return false;
    }
  }

  return true;
}

/**
 * Sanitize a string: strip HTML/script tags, control characters and trim
 * @param {any} input - Input string
 * @param {number} maxLength - Maximum length (default: 255)
 * @returns {string} - Clean string
 */
export function sanitizeText(input, maxLength = 255) {
  if (input === null || input === undefined) return '';
  let str = String(input);
  
  // Strip HTML tags (<script>...</script>, <iframe>, <style>, and any HTML tags)
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  str = str.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  str = str.replace(/<[^>]+>/g, '');
  
  // Strip javascript: pseudo-protocol and event handlers
  str = str.replace(/javascript:/gi, '');
  str = str.replace(/on\w+\s*=/gi, '');

  // Strip null bytes and non-printable control chars except \n and \r
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim whitespace
  str = str.trim();

  // Truncate to maxLength
  if (maxLength && str.length > maxLength) {
    str = str.substring(0, maxLength);
  }

  return str;
}

/**
 * Validate and clean push notification payload
 * @param {object} body - Request body
 * @returns {{ isValid: boolean, error?: string, sanitized?: object }}
 */
export function validatePushPayload(body) {
  const { tokens, title, body: notifBody, data } = body;

  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return {
      isValid: false,
      error: 'Danh sách token thông báo (tokens) không được để trống và phải là mảng.'
    };
  }

  if (tokens.length > 500) {
    return {
      isValid: false,
      error: 'Số lượng token cho mỗi lần gửi không được vượt quá 500.'
    };
  }

  // Validate each token
  const validTokens = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      const cleanToken = token.trim();
      if (cleanToken.length > 10 && cleanToken.length < 350) {
        validTokens.push(cleanToken);
      }
    }
  }

  if (validTokens.length === 0) {
    return {
      isValid: false,
      error: 'Không tìm thấy token FCM nào hợp lệ.'
    };
  }

  const cleanTitle = sanitizeText(title || 'Thông báo mới', 120);
  const cleanBody = sanitizeText(notifBody || 'Bạn có thông báo mới', 500);

  const safeData = {};
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data).slice(0, 20); // max 20 custom fields
    for (const key of keys) {
      const cleanKey = sanitizeText(key, 50);
      if (cleanKey) {
        safeData[cleanKey] = sanitizeText(data[key], 1000);
      }
    }
  }

  return {
    isValid: true,
    sanitized: {
      tokens: validTokens,
      title: cleanTitle,
      body: cleanBody,
      data: safeData
    }
  };
}
