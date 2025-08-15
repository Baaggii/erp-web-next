if (typeof window !== 'undefined') {
  window.showBranchModal = window.showBranchModal || (() => {});
  window.showDepartmentModal = window.showDepartmentModal || (() => {});
  window.showDeptModal = window.showDeptModal || window.showDepartmentModal;
  window.setShowBranchModal = window.setShowBranchModal || (() => {});
  window.setShowDepartmentModal = window.setShowDepartmentModal || (() => {});
  window.setShowDeptModal = window.setShowDeptModal || window.setShowDepartmentModal;
  // Provide global bindings for legacy scripts executed as ES modules
  // eslint-disable-next-line no-var
  var showBranchModal = window.showBranchModal;
  // eslint-disable-next-line no-var
  var showDepartmentModal = window.showDepartmentModal;
  // eslint-disable-next-line no-var
  var showDeptModal = window.showDeptModal;
  // eslint-disable-next-line no-var
  var setShowBranchModal = window.setShowBranchModal;
  // eslint-disable-next-line no-var
  var setShowDepartmentModal = window.setShowDepartmentModal;
  // eslint-disable-next-line no-var
  var setShowDeptModal = window.setShowDeptModal;
}
