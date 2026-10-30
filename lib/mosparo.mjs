import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// mosparo 1.5 signs PHP-style JSON (escaped slashes and non-ASCII).
export const mosparoJson = value => JSON.stringify(value).replace(/\//g, '\\/').replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

export function prepare(data, secret, validationToken) {
  const hmac = value => createHmac('sha256', secret).update(value).digest('hex');
  const formData = Object.fromEntries(Object.keys(data).sort().map(k => [k, createHash('sha256').update(String(data[k]).replace(/\r\n/g, '\n')).digest('hex')]));
  const validationSignature = hmac(validationToken);
  const formSignature = hmac(mosparoJson(formData));
  return { formData, validationSignature, formSignature, expected: hmac(validationSignature + formSignature), hmac };
}

// Returns true/false; throws when mosparo is unreachable (caller fails closed with 503).
export async function verifyMosparo(data, submitToken, validationToken, env = process.env) {
  const { formData, validationSignature, formSignature, expected, hmac } = prepare(data, env.MOSPARO_PRIVATE_KEY, validationToken);
  const endpoint = '/api/v1/verification/verify';
  const body = mosparoJson({ submitToken, validationSignature, formSignature, formData });
  const auth = Buffer.from(env.MOSPARO_PUBLIC_KEY + ':' + hmac(endpoint + body)).toString('base64');
  const response = await fetch(env.MOSPARO_HOST.replace(/\/+$/, '') + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Basic ' + auth },
    body,
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) { if (response.status < 500) return { valid: false, reason: 'http_' + response.status }; throw new Error('mosparo unavailable'); }
  const result = await response.json();
  if (result.valid !== true || typeof result.verificationSignature !== 'string' || !/^[a-f0-9]{64}$/.test(result.verificationSignature)) return { valid: false, reason: 'invalid', issues: result.issues };
  const signatureOk = timingSafeEqual(Buffer.from(result.verificationSignature), Buffer.from(expected));
  const unverified = Object.keys(data).filter(k => result.verifiedFields?.[k] !== 'valid');
  return { valid: signatureOk && unverified.length === 0, reason: signatureOk ? (unverified.length ? 'fields:' + unverified.join(',') : 'ok') : 'signature' };
}
