import { API_BASE } from './apiBase.js';

export function buildImageThumbnailUrl(path) {
  if (!path) return '';
  const encoded = encodeURIComponent(path);
  return `${API_BASE}/transaction_images/thumbnail?path=${encoded}`;
}
