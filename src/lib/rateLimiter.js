/**
 * Client-Side Rate Limiter for Authentication & Sensitive Operations
 * Enforces maximum 5 attempts per 15 minutes window with automatic cooldown.
 */

const AUTH_RATE_LIMIT_KEY = 'qlhs_auth_rate_limit';
const MAX_AUTH_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Get current rate limit state
 */
function getStoredState() {
  try {
    const raw = localStorage.getItem(AUTH_RATE_LIMIT_KEY);
    if (!raw) return { attempts: [], lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0
    };
  } catch (e) {
    return { attempts: [], lockedUntil: 0 };
  }
}

/**
 * Save rate limit state
 */
function saveState(state) {
  try {
    localStorage.setItem(AUTH_RATE_LIMIT_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save rate limit state', e);
  }
}

/**
 * Format remaining milliseconds to readable string (e.g. "14 phút 30 giây")
 */
export function formatRemainingTime(ms) {
  if (ms <= 0) return '0 giây';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes} phút ${seconds > 0 ? `${seconds} giây` : ''}`.trim();
  }
  return `${seconds} giây`;
}

/**
 * Check if authentication is currently locked
 * @returns {{ isLocked: boolean, remainingMs: number, formattedTime: string, remainingAttempts: number }}
 */
export function checkAuthRateLimit() {
  const now = Date.now();
  const state = getStoredState();

  // Filter out attempts older than windowMs
  const validAttempts = state.attempts.filter(timestamp => (now - timestamp) < WINDOW_MS);

  // Check if locked
  if (state.lockedUntil && now < state.lockedUntil) {
    const remainingMs = state.lockedUntil - now;
    return {
      isLocked: true,
      remainingMs,
      formattedTime: formatRemainingTime(remainingMs),
      remainingAttempts: 0
    };
  }

  // If lockout has expired, reset lockedUntil
  let lockedUntil = 0;
  if (state.lockedUntil && now >= state.lockedUntil) {
    saveState({ attempts: [], lockedUntil: 0 });
    return {
      isLocked: false,
      remainingMs: 0,
      formattedTime: '',
      remainingAttempts: MAX_AUTH_ATTEMPTS
    };
  }

  const remainingAttempts = Math.max(0, MAX_AUTH_ATTEMPTS - validAttempts.length);
  return {
    isLocked: false,
    remainingMs: 0,
    formattedTime: '',
    remainingAttempts
  };
}

/**
 * Record a failed authentication attempt
 * @returns {{ isLocked: boolean, remainingAttempts: number, remainingMs: number, formattedTime: string }}
 */
export function recordFailedAuthAttempt() {
  const now = Date.now();
  const state = getStoredState();

  const validAttempts = state.attempts.filter(timestamp => (now - timestamp) < WINDOW_MS);
  validAttempts.push(now);

  let lockedUntil = 0;
  let isLocked = false;
  let remainingMs = 0;

  if (validAttempts.length >= MAX_AUTH_ATTEMPTS) {
    lockedUntil = now + WINDOW_MS;
    isLocked = true;
    remainingMs = WINDOW_MS;
  }

  saveState({
    attempts: validAttempts,
    lockedUntil
  });

  const remainingAttempts = Math.max(0, MAX_AUTH_ATTEMPTS - validAttempts.length);

  return {
    isLocked,
    remainingAttempts,
    remainingMs,
    formattedTime: formatRemainingTime(remainingMs)
  };
}

/**
 * Clear rate limit state upon successful authentication
 */
export function recordSuccessfulAuth() {
  try {
    localStorage.removeItem(AUTH_RATE_LIMIT_KEY);
  } catch (e) {
    console.error('Failed to clear rate limit state', e);
  }
}
