const TEMPORARY_NAME_REGEX = /^tmp_(\d{13})__([a-z0-9]+)(?:_(.+))?$/i;

export function buildTemporaryImageName() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 5);
  return `tmp_${timestamp}__${random}`;
}

export function parseTemporaryImageName(name = '') {
  const match = String(name).match(TEMPORARY_NAME_REGEX);
  if (!match) {
    return {
      isTemporary: false,
      timestamp: null,
      random: null,
      suffix: '',
      date: '',
    };
  }
  const timestamp = Number(match[1]);
  const date = Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString().split('T')[0]
    : '';
  return {
    isTemporary: true,
    timestamp,
    random: match[2],
    suffix: match[3] || '',
    date,
  };
}

export function isTemporaryImageName(name = '') {
  return parseTemporaryImageName(name).isTemporary;
}
