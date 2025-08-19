export default function filterHeaderModules(modules, perms = {}, txnModules = null) {
  return modules.filter((m) => {
    if (!m.show_in_header) return false;
    const isTxn = txnModules && txnModules.keys && txnModules.keys.has(m.module_key);
    return isTxn || perms[m.module_key];
  });
}
