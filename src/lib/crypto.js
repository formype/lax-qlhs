/**
 * Cryptographic Utility for Secure Password Hashing & Verification.
 * Uses Web Crypto API (SHA-256 + Salt) compatible with Browser, Node.js, and Capacitor Android/iOS.
 */

// Helper to convert Uint8Array / ArrayBuffer to Hex string
function buf2hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper to generate cryptographically secure random salt (16 bytes = 32 hex chars)
function generateSalt(length = 16) {
  const bytes = new Uint8Array(length);
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback PRNG if crypto.getRandomValues is unavailable
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return buf2hex(bytes);
}

// Compute SHA-256 hash of a string
async function computeSha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return buf2hex(hashBuffer);
  }

  // Pure JS fallback SHA-256 if subtle crypto is unavailable
  return fallbackSha256(str);
}

/**
 * Pure JS SHA-256 Fallback implementation for maximum robustness
 */
function fallbackSha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i, j;
  let result = '';

  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  
  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let str = ascii + '\x80';
  while ((str[lengthProperty] % 64) !== 56) {
    str += '\x00';
  }
  for (i = 0; i < str[lengthProperty]; i++) {
    j = str.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiBitLength | 0);

  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, j += 16);
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const i2 = i + j;
      const w15 = w[i - 15], w2 = w[i - 2];

      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        );
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let bit = 3; bit >= 0; bit--) {
      const byte = (hash[i] >> (bit * 8)) & 255;
      result += ((byte < 16) ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

/**
 * Hash a plain text password with a unique salt.
 * @param {string} plainPassword 
 * @returns {Promise<string>} Stored string in format 'v1:<salt>:<hash>'
 */
export async function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || !plainPassword) {
    throw new Error('Password must be a non-empty string.');
  }
  const salt = generateSalt(16);
  const hash = await computeSha256(`${salt}:${plainPassword}`);
  return `v1:${salt}:${hash}`;
}

/**
 * Verify a plain text password against a stored password value.
 * Handles both modern 'v1:<salt>:<hash>' format and legacy plaintext passwords with migration support.
 * 
 * @param {string} plainPassword 
 * @param {string} storedPassword 
 * @returns {Promise<{ isValid: boolean, needsUpgrade: boolean }>}
 */
export async function verifyPassword(plainPassword, storedPassword) {
  if (!plainPassword || !storedPassword) {
    return { isValid: false, needsUpgrade: false };
  }

  // Modern hashed format: 'v1:<salt>:<hash>'
  if (typeof storedPassword === 'string' && storedPassword.startsWith('v1:')) {
    const parts = storedPassword.split(':');
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = parts[2];
      const computedHash = await computeSha256(`${salt}:${plainPassword}`);
      return {
        isValid: computedHash === expectedHash,
        needsUpgrade: false
      };
    }
  }

  // Legacy plaintext fallback check
  const isLegacyMatch = String(plainPassword) === String(storedPassword);
  return {
    isValid: isLegacyMatch,
    needsUpgrade: isLegacyMatch // If matched legacy password, flag for silent upgrade
  };
}
