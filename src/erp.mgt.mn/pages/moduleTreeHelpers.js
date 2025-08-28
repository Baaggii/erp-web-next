export function collectModuleKeys(mod) {
  const keys = [mod.key];
  if (mod.children?.length) {
    for (const child of mod.children) {
      keys.push(...collectModuleKeys(child));
    }
  }
  return keys;
}

export function toggleModuleGroupSelection(current, keys, checked) {
  const set = new Set(current);
  if (checked) keys.forEach((k) => set.add(k));
  else keys.forEach((k) => set.delete(k));
  return Array.from(set);
}
