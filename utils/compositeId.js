export const COMPOSITE_ID_PREFIX = '~';

function toBase64Url(str) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(str, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/u, '');
  }
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const bytes = encoder
    ? encoder.encode(str)
    : Array.from(str).map((ch) => ch.charCodeAt(0));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.btoa === 'function') {
    return globalThis
      .btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/u, '');
  }
  throw new Error('No base64 encoder available');
}

function fromBase64Url(input) {
  const normalized = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(padded);
    if (typeof TextDecoder !== 'undefined') {
      const decoder = new TextDecoder('utf-8');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return decoder.decode(bytes);
    }
    let result = '';
    for (let i = 0; i < binary.length; i += 1) {
      result += `%${binary.charCodeAt(i).toString(16).padStart(2, '0')}`;
    }
    return decodeURIComponent(result);
  }
  throw new Error('No base64 decoder available');
}

export function encodeCompositeId(parts) {
  if (!Array.isArray(parts)) {
    return undefined;
  }
  const normalized = parts.map((part) => (part == null ? '' : String(part)));
  if (normalized.length <= 1) {
    return normalized[0];
  }
  const encoded = normalized.map((part) => toBase64Url(part));
  return `${COMPOSITE_ID_PREFIX}${encoded.join('.')}`;
}

export function decodeCompositeId(raw, expectedLength = 0) {
  if (raw == null) return [];
  const str = String(raw);
  if (str.startsWith(COMPOSITE_ID_PREFIX)) {
    const payload = str.slice(COMPOSITE_ID_PREFIX.length);
    if (!payload) return [''];
    const segments = payload.split('.');
    const result = [];
    try {
      for (const segment of segments) {
        result.push(fromBase64Url(segment));
      }
      return result;
    } catch (err) {
      // fall through to legacy split
    }
  }
  if (expectedLength && expectedLength > 0) {
    const pieces = str.split('-');
    if (pieces.length > expectedLength && expectedLength > 1) {
      const head = pieces.slice(0, expectedLength - 1);
      head.push(pieces.slice(expectedLength - 1).join('-'));
      return head;
    }
    return pieces;
  }
  return [str];
}

export function isCompositeIdEncoded(raw) {
  return typeof raw === 'string' && raw.startsWith(COMPOSITE_ID_PREFIX);
}
