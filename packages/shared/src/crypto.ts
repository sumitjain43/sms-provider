import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits auth tag

/**
 * Normalizes an encryption key into a 32-byte Buffer.
 */
function getKeyBuffer(keyHexOrSecret: string): Buffer {
  if (keyHexOrSecret.length === 64 && /^[0-9a-fA-F]+$/.test(keyHexOrSecret)) {
    return Buffer.from(keyHexOrSecret, 'hex');
  }
  // Otherwise derive a deterministic 32-byte key via SHA-256
  return crypto.createHash('sha256').update(keyHexOrSecret).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (hex encoded)
 */
export function encrypt(plaintext: string, secretKey: string): string {
  const key = getKeyBuffer(secretKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts ciphertext using AES-256-GCM.
 */
export function decrypt(encryptedPayload: string, secretKey: string): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getKeyBuffer(secretKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Calculates SHA-256 hash of a string.
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Calculates HMAC-SHA256 of data using a secret.
 */
export function hmacSha256(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Generates a cryptographically secure 6-digit OTP code (string '000000' to '999999').
 */
export function generateOtp(): string {
  const randomNum = crypto.randomInt(0, 1000000);
  return randomNum.toString().padStart(6, '0');
}

/**
 * Generates a cryptographically secure pairing code (e.g. 8-char uppercase alphanumeric or 16-char token).
 */
export function generatePairingCode(): string {
  // 16 bytes = 128 bits entropy
  const bytes = crypto.randomBytes(16);
  return bytes.toString('hex');
}

/**
 * Generates an API key with a prefix (e.g. bk_test_... or bk_live_...).
 * Returns the raw key, the prefix, and the SHA-256 hash for storage.
 */
export function generateApiKey(environment: 'development' | 'production' = 'development') {
  const prefix = environment === 'production' ? 'bk_live_' : 'bk_test_';
  const randomSecret = crypto.randomBytes(24).toString('base64url');
  const rawKey = `${prefix}${randomSecret}`;
  const hashedSecret = sha256(rawKey);

  return {
    rawKey,
    prefix,
    hashedSecret,
  };
}

/**
 * Webhook signature generation:
 * Format: v1=<hex-hmac>
 */
export function signWebhookPayload(payload: string, timestamp: number, secret: string): string {
  const canonicalPayload = `${timestamp}.${payload}`;
  const hmac = hmacSha256(canonicalPayload, secret);
  return `v1=${hmac}`;
}

/**
 * Webhook signature verification
 */
export function verifyWebhookSignature(
  payload: string,
  timestamp: number,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false; // Replay attack protection
  }

  const expectedSignature = signWebhookPayload(payload, timestamp, secret);
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature));
}
