export const APP_VERSION = '2.2.4';

/**
 * Compares two semantic version strings (e.g. "2.2.4" vs "2.2.5").
 * Returns:
 *   -1 if v1 < v2 (v1 is older than v2)
 *    0 if v1 === v2
 *    1 if v1 > v2 (v1 is newer than v2)
 */
export const compareVersions = (v1, v2) => {
  if (!v1 || !v2) return 0;
  const parseParts = (v) => String(v).trim().replace(/^[^\d]+/, '').split('.').map(n => parseInt(n, 10) || 0);
  const p1 = parseParts(v1);
  const p2 = parseParts(v2);
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }
  return 0;
};

/**
 * Checks if an update is required:
 * Returns true if and only if currentVersion < latestVersion.
 * If currentVersion >= latestVersion, returns false.
 */
export const isUpdateRequired = (currentVersion, latestVersion) => {
  if (!currentVersion || !latestVersion) return false;
  return compareVersions(currentVersion, latestVersion) < 0;
};

