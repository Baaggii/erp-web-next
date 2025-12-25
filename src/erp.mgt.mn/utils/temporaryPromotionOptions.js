export function computeTemporaryPromotionOptions({
  requestType,
  submitIntent = 'post',
  pendingPromotionHasSeniorAbove = false,
  pendingTemporaryPromotionId = null,
  canPostTransactions = true,
  forceResolvePendingDrafts = false,
} = {}) {
  const forcePostFromTemporary =
    requestType === 'temporary-promote' && submitIntent === 'post';
  const forwardingExistingTemporary =
    requestType === 'temporary-promote' &&
    pendingPromotionHasSeniorAbove &&
    pendingTemporaryPromotionId &&
    !forcePostFromTemporary;
  const promoteAsTemporary = forcePostFromTemporary ? false : !canPostTransactions;
  const shouldForcePromote = forcePostFromTemporary || forceResolvePendingDrafts;
  return {
    forcePostFromTemporary,
    forwardingExistingTemporary,
    promoteAsTemporary,
    shouldForcePromote,
  };
}
