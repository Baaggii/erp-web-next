const DICT = {
  year: 'он',
  month: 'сар',
  day: 'өдөр',
  name: 'нэр',
  id: 'дугаар',
  code: 'код',
  amount: 'дүн',
  description: 'тайлбар',
};

export function translateToMn(text) {
  const lower = String(text).toLowerCase();
  if (DICT[lower]) return DICT[lower];
  const parts = lower.split(/[_\s]+/);
  return parts.map((p) => DICT[p] || p).join(' ');
}
