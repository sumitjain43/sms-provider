/**
 * Normalizes phone numbers to standard E.164 format.
 * Strips non-digit characters except leading '+'.
 * If no country code is present, defaults or throws an error.
 */
export function normalizeE164(phone: string, defaultCountryCode = '+91'): string {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number must be a non-empty string');
  }

  // Remove spaces, hyphens, parentheses, periods
  let cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  } else if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = `${defaultCountryCode}${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }

  // E.164 regex: + followed by 7 to 15 digits (first digit 1-9)
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  if (!e164Regex.test(cleaned)) {
    throw new Error(`Invalid E.164 phone number format: "${phone}" (normalized to "${cleaned}")`);
  }

  return cleaned;
}

/**
 * Redacts a phone number for audit logs and safe UI display.
 * E.g. "+919876543210" becomes "+91*****3210"
 */
export function redactPhone(phone: string): string {
  if (!phone) return '';
  const str = phone.trim();
  if (str.length <= 6) return '***';
  
  // Show first 3-4 chars (usually country code) and last 4 chars
  const prefixLen = str.startsWith('+') ? 3 : 2;
  const suffixLen = 4;
  
  if (str.length <= prefixLen + suffixLen) {
    return str.slice(0, prefixLen) + '****';
  }
  
  const prefix = str.slice(0, prefixLen);
  const suffix = str.slice(-suffixLen);
  const maskedCount = Math.max(3, str.length - prefixLen - suffixLen);
  return `${prefix}${'*'.repeat(maskedCount)}${suffix}`;
}
