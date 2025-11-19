export default function extractCombinationFilterValue(input) {
  let current = input;
  let depth = 0;
  while (current && typeof current === 'object' && depth < 5) {
    if (Object.prototype.hasOwnProperty.call(current, 'value')) {
      current = current.value;
    } else if (Object.prototype.hasOwnProperty.call(current, 'id')) {
      current = current.id;
    } else if (Object.prototype.hasOwnProperty.call(current, 'key')) {
      current = current.key;
    } else {
      break;
    }
    depth += 1;
  }
  return current;
}
