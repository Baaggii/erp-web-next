if (typeof window !== 'undefined') {
  window.showBranchModal = window.showBranchModal || (() => {});
  window.showDepartmentModal = window.showDepartmentModal || (() => {});
  // Provide global bindings for legacy scripts executed as ES modules
  // eslint-disable-next-line no-var
  var showBranchModal = window.showBranchModal;
  // eslint-disable-next-line no-var
  var showDepartmentModal = window.showDepartmentModal;
}
